"""
Plaud -> Transcricoes
======================
Mesma ideia do collectors/fathom_transcricoes.py, mas pra reunioes
PRESENCIAIS gravadas no Plaud (tags (PR-S)/(PR-F) no nome da gravacao).

Roda de graca no GitHub Actions (nao gasta token do Claude). So a analise
de sentimento/probabilidade usa IA (Gemini) - o resto e regra determinística.

Fluxo:
  1. Loga na API do Plaud (nao-oficial, engenharia reversa do web.plaud.ai):
     POST https://api.plaud.ai/auth/access-token  (username/password)
     -> devolve um JWT que dura ~30 dias. O token e guardado em cache
        (arquivo .plaud_token.json, persistido entre runs via actions/cache)
        pra NAO relogar toda hora - cada login novo desconecta o app do
        celular do Lucas.
  2. Lista as gravacoes (GET /file/simple/web).
  3. So processa gravacao cujo NOME (que o Lucas renomeia no app do Plaud)
     contenha "(PR-S)" ou "(PR-F)" E ("Comissao" ou "Turma"). As gravacoes
     com nome automatico do Plaud sao ignoradas (nao da pra saber a turma).
  4. Casa o nome com a tabela `turmas` no Supabase (fuzzy: curso+faculdade+
     turma+ano_formatura contidos no texto). Se nao achar exatamente UMA,
     pula e reporta (nunca inventa - regra do projeto).
  5. Puxa a transcricao (GET /file/detail/<id> -> pre_download_content_list).
  6. Analisa com Gemini (probabilidade/sentimento/resumo/pontos).
  7. Grava em `transcricoes` (Supabase). Dedup por `url` = plaud:<file_id>.

Reunioes online (Fathom, tag (ON)) sao outro fluxo - collectors/fathom_transcricoes.py.
"""

import os
import re
import json
import time
import base64
import logging
from datetime import datetime, timezone

import requests
from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("plaud_transcricoes")

PLAUD_EMAIL     = os.getenv("PLAUD_EMAIL", "").strip()
PLAUD_PASSWORD  = os.getenv("PLAUD_PASSWORD", "").strip()
PLAUD_REGION    = os.getenv("PLAUD_REGION", "us").strip().lower()
PLAUD_TOKEN_FILE = os.getenv("PLAUD_TOKEN_FILE", ".plaud_token.json").strip()
SUPABASE_URL    = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY    = os.getenv("SUPABASE_SERVICE_KEY", "")
GEMINI_API_KEY  = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL    = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# Quantos dias pra tras olhar (gravacao nova costuma sincronizar no fim do dia).
JANELA_DIAS = int(os.getenv("PLAUD_JANELA_DIAS", "45"))

BASE_URLS = {"us": "https://api.plaud.ai", "eu": "https://api-euc1.plaud.ai"}

# A API do Plaud rejeita User-Agent "node"/"python" com 403 - manda um de browser.
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

CLOSER_ALIASES = {
    "amorim": "Lucas Amorim",
    "daniel": "Daniel Silva",
    "gustavo": "Gustavo",
}

TRANSCRICAO_MAX_CHARS = 50000
ANALISE_MAX_CHARS = 15000


# ── Auth Plaud ────────────────────────────────────────────
def _jwt_exp(token):
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload))
        return int(claims.get("exp", 0))
    except Exception:
        return 0


def _carregar_token_cache():
    try:
        with open(PLAUD_TOKEN_FILE, "r") as f:
            data = json.load(f)
        tok = data.get("access_token", "")
        exp = _jwt_exp(tok)
        # Reusa se ainda faltam > 24h pra expirar.
        if tok and exp - time.time() > 24 * 3600:
            return tok, data.get("region", PLAUD_REGION)
    except FileNotFoundError:
        pass
    except Exception as e:
        log.warning(f"Cache de token ilegível ({e}), vou relogar.")
    return None, None


def _salvar_token_cache(token, region):
    try:
        with open(PLAUD_TOKEN_FILE, "w") as f:
            json.dump({"access_token": token, "region": region}, f)
    except Exception as e:
        log.warning(f"Não consegui salvar cache do token: {e}")


def plaud_login():
    """Loga com email/senha e devolve (token, region). Cada login novo cria uma
    sessão nova no Plaud e desloga o app do celular - por isso o cache."""
    region = PLAUD_REGION if PLAUD_REGION in BASE_URLS else "us"
    base = BASE_URLS[region]
    r = requests.post(
        f"{base}/auth/access-token",
        headers={"User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded"},
        data={"username": PLAUD_EMAIL, "password": PLAUD_PASSWORD},
        timeout=30,
    )
    r.raise_for_status()
    data = r.json()
    # -302 = região errada, a resposta diz qual usar.
    if data.get("status") == -302 and data.get("data", {}).get("domains", {}).get("api"):
        dom = data["data"]["domains"]["api"]
        region = "eu" if "euc1" in dom else "us"
        base = BASE_URLS[region]
        r = requests.post(
            f"{base}/auth/access-token",
            headers={"User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded"},
            data={"username": PLAUD_EMAIL, "password": PLAUD_PASSWORD},
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
    if data.get("status") != 0 or not data.get("access_token"):
        raise RuntimeError(f"Login Plaud falhou: {data.get('msg') or data}")
    token = data["access_token"]
    _salvar_token_cache(token, region)
    log.info(f"Login Plaud OK (região {region}).")
    return token, region


class PlaudAPI:
    def __init__(self):
        tok, reg = _carregar_token_cache()
        if tok:
            self.token, self.region = tok, reg
            log.info("Usando token do Plaud em cache.")
        else:
            self.token, self.region = plaud_login()

    @property
    def base(self):
        return BASE_URLS.get(self.region, BASE_URLS["us"])

    def _get(self, path, _retry=True):
        r = requests.get(
            f"{self.base}{path}",
            headers={"User-Agent": USER_AGENT, "Authorization": f"Bearer {self.token}",
                     "Content-Type": "application/json"},
            timeout=45,
        )
        if r.status_code == 401 and _retry:
            log.info("Token do Plaud rejeitado (401), relogando uma vez.")
            self.token, self.region = plaud_login()
            return self._get(path, _retry=False)
        r.raise_for_status()
        data = r.json()
        if isinstance(data, dict) and data.get("status") == -302:
            dom = data.get("data", {}).get("domains", {}).get("api", "")
            self.region = "eu" if "euc1" in dom else "us"
            return self._get(path, _retry=_retry)
        return data

    def listar_gravacoes(self):
        data = self._get("/file/simple/web")
        lista = data.get("data_file_list") or data.get("data") or []
        return [g for g in lista if not g.get("is_trash")]

    def transcricao(self, file_id):
        data = self._get(f"/file/detail/{file_id}")
        raw = data.get("data") or data
        melhor = ""
        for item in raw.get("pre_download_content_list", []) or []:
            c = item.get("data_content") or ""
            if len(c) > len(melhor):
                melhor = c
        return melhor


# ── helpers de gravação ───────────────────────────────────
def nome_gravacao(g):
    return (g.get("filename") or g.get("file_name") or g.get("name") or "").strip()


def id_gravacao(g):
    return str(g.get("id") or g.get("file_id") or "")


def epoch_ms_gravacao(g):
    for k in ("start_time", "start_at", "create_time", "created_at"):
        v = g.get(k)
        if isinstance(v, (int, float)) and v > 0:
            return v if v > 1e12 else v * 1000
    return 0


# ── parse do nome (espelha o parser do Fathom, mas presencial) ──
def parse_nome(nome):
    """So aceita reuniao presencial de venda: precisa ter (PR-S) ou (PR-F)
    E ("Comissao" ou "Turma")."""
    n = (nome or "").strip()

    if not re.search(r"\(pr-[sf]\)", n, re.I):
        return None

    tipo = None
    if re.search(r"comiss[aã]o", n, re.I):
        tipo = "Reunião Comissão"
    elif re.search(r"\bturma\b", n, re.I):
        tipo = "Reunião Turma"
    if not tipo:
        return None

    closer = None
    for chave, nome_completo in CLOSER_ALIASES.items():
        if re.search(rf"\b{chave}\b", n, re.I):
            closer = nome_completo
            break

    turma_text = n
    turma_text = re.sub(r"\[plaud\]", "", turma_text, flags=re.I)
    turma_text = re.sub(r"\(pr-[sf]\)", "", turma_text, flags=re.I)
    turma_text = re.sub(r"apresenta[cç][aã]o", "", turma_text, flags=re.I)
    turma_text = re.sub(r"^\s*(comiss[aã]o|turma)\s*-\s*", "", turma_text, flags=re.I)
    # tira "- Lucas", "- Lucas e Gustavo" do fim
    turma_text = re.sub(r"\s*-\s*[A-Za-zÀ-ÿ ]+(e [A-Za-zÀ-ÿ]+)?\s*$", "", turma_text)
    turma_text = turma_text.strip(" -\u00a0")

    return {"tipo": tipo, "turma_text": turma_text, "closer": closer}


def buscar_turmas(sb):
    r = sb.table("turmas").select(
        "id, curso, faculdade, turma, ano_formatura, cidade, empresa"
    ).execute()
    return r.data or []


def casar_turma(turma_text, turmas):
    texto = (turma_text or "").lower()
    candidatas = []
    for t in turmas:
        campos = [t.get("curso"), t.get("faculdade"), t.get("turma"), t.get("ano_formatura")]
        campos = [str(c).lower() for c in campos if c]
        if not campos:
            continue
        if all(c in texto for c in campos):
            candidatas.append(t)
    return candidatas[0] if len(candidatas) == 1 else None


def nome_completo_turma(t):
    partes = [t.get("empresa"), t.get("curso"), t.get("faculdade"),
              t.get("turma"), t.get("ano_formatura"), t.get("cidade")]
    return " ".join(str(p) for p in partes if p)


def analisar_com_gemini(client, nome_turma, transcricao):
    prompt = (
        "Você é um analista especialista em vendas de formatura e SDR educacional.\n"
        f'Analise a transcrição de reunião abaixo referente à turma "{nome_turma}".\n\n'
        f'Transcrição:\n"""\n{transcricao[:ANALISE_MAX_CHARS]}\n"""\n\n'
        "Retorne OBRIGATORIAMENTE APENAS um JSON válido (sem markdown, sem texto antes/depois) "
        "neste formato:\n"
        "{\n"
        '  "probabilidade": <inteiro 0-100, chance de avançar/fechar>,\n'
        '  "sentimento": "positivo" | "neutro" | "negativo",\n'
        '  "pontosFortes": [<strings>],\n'
        '  "pontosAtencao": [<strings, objeções/riscos>],\n'
        '  "resumo": "<2-3 frases>",\n'
        '  "recomendacao": "<próximo passo sugerido pro SDR/closer>"\n'
        "}"
    )
    resp = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
        config={"response_mime_type": "application/json"},
    )
    return json.loads(resp.text)


def main():
    faltando = [n for n, v in [
        ("PLAUD_EMAIL", PLAUD_EMAIL), ("PLAUD_PASSWORD", PLAUD_PASSWORD),
        ("SUPABASE_URL", SUPABASE_URL), ("SUPABASE_SERVICE_KEY", SUPABASE_KEY),
    ] if not v]
    if faltando:
        log.error(f"Faltando variáveis de ambiente: {', '.join(faltando)} - abortando.")
        return

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    gemini_client = None
    if GEMINI_API_KEY:
        from google import genai
        gemini_client = genai.Client(api_key=GEMINI_API_KEY)
    else:
        log.warning("GEMINI_API_KEY não configurado - transcrições salvas sem análise de IA.")

    api = PlaudAPI()
    gravacoes = api.listar_gravacoes()
    log.info(f"{len(gravacoes)} gravação(ões) no Plaud (fora da lixeira).")

    turmas = buscar_turmas(sb)
    limite_ms = (time.time() - JANELA_DIAS * 86400) * 1000

    criados, pulados = [], []

    for g in gravacoes:
        nome = nome_gravacao(g)
        fid = id_gravacao(g)
        if not fid:
            continue

        ts = epoch_ms_gravacao(g)
        if ts and ts < limite_ms:
            continue  # gravação antiga, fora da janela

        parsed = parse_nome(nome)
        if not parsed:
            # nome automático do Plaud ou fora do padrão -> nem reporta (ruído)
            continue

        url_plaud = f"plaud:{fid}"
        existente = sb.table("transcricoes").select("id").eq("url", url_plaud).limit(1).execute()
        if existente.data:
            continue  # já processado

        turma = casar_turma(parsed["turma_text"], turmas)
        if not turma:
            pulados.append((nome, f'turma não encontrada/ambígua (texto: "{parsed["turma_text"]}")'))
            continue

        if not g.get("is_trans", True):
            pulados.append((nome, "gravação ainda sem transcrição no Plaud"))
            continue

        try:
            transcricao = api.transcricao(fid)
        except Exception as e:
            log.error(f"Erro buscando transcrição do Plaud (file_id={fid}): {e}")
            pulados.append((nome, f"erro Plaud: {e}"))
            continue

        if not transcricao.strip():
            pulados.append((nome, "transcrição vazia no Plaud"))
            continue

        analise = None
        if gemini_client:
            try:
                analise = analisar_com_gemini(gemini_client, nome_completo_turma(turma), transcricao)
            except Exception as e:
                log.warning(f"Falha na análise Gemini (salvando sem análise): {e}")

        titulo = f"[Plaud] {nome}" if not nome.lower().startswith("[plaud]") else nome
        linha = {
            "turma_id": turma["id"],
            "tipo": parsed["tipo"],
            "titulo": titulo,
            "conteudo": transcricao[:TRANSCRICAO_MAX_CHARS],
            "url": url_plaud,
            "probabilidade": (analise or {}).get("probabilidade"),
            "sentimento": (analise or {}).get("sentimento"),
            "resumo": (analise or {}).get("resumo"),
            "pontos_fortes": "\n".join((analise or {}).get("pontosFortes", []) or []) or None,
            "pontos_atencao": "\n".join((analise or {}).get("pontosAtencao", []) or []) or None,
            "proximo_passo": (analise or {}).get("recomendacao"),
        }
        sb.table("transcricoes").insert(linha).execute()

        prob = f' — probabilidade {analise["probabilidade"]}%' if analise and analise.get("probabilidade") is not None else ""
        closer_info = f' (closer: {parsed["closer"]})' if parsed["closer"] else ""
        criados.append(f'{nome_completo_turma(turma)} — {parsed["tipo"]}{closer_info}{prob}')

    log.info(f"Criadas: {len(criados)} transcrição(ões).")
    for c in criados:
        log.info(f"  criado: {c}")
    log.info(f"Pulados: {len(pulados)}.")
    for nome, motivo in pulados:
        log.info(f'  pulado ("{nome}"): {motivo}')


if __name__ == "__main__":
    main()
