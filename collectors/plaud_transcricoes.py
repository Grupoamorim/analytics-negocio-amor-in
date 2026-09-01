"""
Plaud -> Transcricoes  (reunioes presenciais)
=============================================
Roda de graca no GitHub Actions (nao gasta token do Claude).

O Plaud no plano GRATIS so guarda o AUDIO - nao transcreve. Entao este
collector baixa o mp3 do Plaud e manda pro Gemini transcrever (chamada em
texto puro) + analisar (JSON). Se a conta do Plaud for paga e ja tiver a
transcricao pronta, usa ela direto.

COMO A TURMA E DESCOBERTA (sem IA lendo a transcricao):
  Cruza o HORARIO da gravacao do Plaud com o EVENTO da agenda do Google
  (feed .ics secreto). O evento tem que seguir a convencao:
      Apresentacao (PR-S|PR-F) <Turma|Comissao> <nome da turma> ...
  O <nome da turma> vem do TITULO DO EVENTO, nao da gravacao (o Plaud
  batiza a gravacao com um resumo automatico inutil pra isso).

  - Pega o evento cujo inicio esta mais perto do inicio da gravacao
    (no maximo JANELA_MIN minutos de diferenca) E que casa com a convencao.
  - Extrai curso+faculdade+turma+ano do titulo e casa com `turmas` (fuzzy).
  - Se nao achar exatamente 1 turma, ou nao achar evento, pula e reporta.
    Nunca inventa (regra do projeto).

MULTIPLAS GRAVACOES DA MESMA TURMA:
  Ate 4 por turma. O titulo salvo ganha um rotulo pra diferenciar:
  "Comissao", "Turma", "Turma B/C", "Matutino"/"Noturno" (o que estiver no
  titulo do evento). Passou de 4 -> pula e reporta.

APRENDIZADO / MEDIA DE PROBABILIDADE:
  Toda transcricao gravada aqui entra no aprendizado e na media de
  probabilidade das reunioes da turma (isso e feito no app, so precisa
  do registro em `transcricoes` com turma_id + probabilidade).

AUTENTICACAO PLAUD (API nao-oficial, engenharia reversa do web.plaud.ai):
  a) PLAUD_TOKEN: cola o JWT do localStorage do web.plaud.ai. Dura ~30
     dias, NAO renova - o job avisa no log quando falta < 5 dias.
  b) PLAUD_EMAIL + PLAUD_PASSWORD: renova sozinho, mas cada login novo
     desloga o app do celular. Token fica em cache (.plaud_token.json,
     persistido entre runs via actions/cache).

Reunioes online (Fathom, (ON)) sao outro fluxo - collectors/fathom_transcricoes.py.
"""

import os
import re
import json
import time
import base64
import logging
from datetime import datetime, timezone, timedelta

import requests
from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("plaud_transcricoes")

PLAUD_EMAIL      = os.getenv("PLAUD_EMAIL", "").strip()
PLAUD_PASSWORD   = os.getenv("PLAUD_PASSWORD", "").strip()
PLAUD_TOKEN      = os.getenv("PLAUD_TOKEN", "").strip()
PLAUD_REGION     = os.getenv("PLAUD_REGION", "us").strip().lower()
PLAUD_TOKEN_FILE = os.getenv("PLAUD_TOKEN_FILE", ".plaud_token.json").strip()
GCAL_ICS_URL     = os.getenv("GCAL_ICS_URL", "").strip()
SUPABASE_URL     = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY     = os.getenv("SUPABASE_SERVICE_KEY", "")
GEMINI_API_KEY   = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL     = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

JANELA_DIAS = int(os.getenv("PLAUD_JANELA_DIAS", "45"))
# Diferenca maxima entre inicio da gravacao e inicio do evento da agenda.
JANELA_MIN = int(os.getenv("PLAUD_JANELA_MIN", "120"))
MAX_GRAVACOES_POR_TURMA = 4

BASE_URLS = {"us": "https://api.plaud.ai", "eu": "https://api-euc1.plaud.ai"}
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

TRANSCRICAO_MAX_CHARS = 50000
ANALISE_MAX_CHARS = 15000


# ── Auth Plaud ────────────────────────────────────────────
def _jwt_exp(token):
    try:
        p = token.split(".")[1]
        p += "=" * (-len(p) % 4)
        return int(json.loads(base64.urlsafe_b64decode(p)).get("exp", 0))
    except Exception:
        return 0


def _carregar_token_cache():
    try:
        with open(PLAUD_TOKEN_FILE) as f:
            d = json.load(f)
        tok = d.get("access_token", "")
        if tok and _jwt_exp(tok) - time.time() > 24 * 3600:
            return tok, d.get("region", PLAUD_REGION)
    except FileNotFoundError:
        pass
    except Exception as e:
        log.warning(f"Cache de token ilegivel ({e}).")
    return None, None


def _salvar_token_cache(token, region):
    try:
        with open(PLAUD_TOKEN_FILE, "w") as f:
            json.dump({"access_token": token, "region": region}, f)
    except Exception as e:
        log.warning(f"Nao consegui salvar cache do token: {e}")


def _avisar_expiracao(token):
    exp = _jwt_exp(token)
    if exp:
        dias = (exp - time.time()) / 86400
        if dias < 5:
            log.warning(f"TOKEN DO PLAUD EXPIRA EM {dias:.1f} DIA(S). Atualize o secret PLAUD_TOKEN.")


def plaud_login():
    if not (PLAUD_EMAIL and PLAUD_PASSWORD):
        raise RuntimeError(
            "Sem PLAUD_EMAIL/PLAUD_PASSWORD e o PLAUD_TOKEN expirou/foi rejeitado. "
            "Cole um token novo do web.plaud.ai no secret PLAUD_TOKEN."
        )
    region = PLAUD_REGION if PLAUD_REGION in BASE_URLS else "us"
    for _ in range(2):
        r = requests.post(
            f"{BASE_URLS[region]}/auth/access-token",
            headers={"User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded"},
            data={"username": PLAUD_EMAIL, "password": PLAUD_PASSWORD},
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        if data.get("status") == -302 and data.get("data", {}).get("domains", {}).get("api"):
            region = "eu" if "euc1" in data["data"]["domains"]["api"] else "us"
            continue
        break
    if data.get("status") != 0 or not data.get("access_token"):
        raise RuntimeError(f"Login Plaud falhou: {data.get('msg') or data}")
    _salvar_token_cache(data["access_token"], region)
    log.info(f"Login Plaud OK (regiao {region}).")
    return data["access_token"], region


class PlaudAPI:
    def __init__(self):
        cache_tok, cache_reg = _carregar_token_cache()
        if cache_tok and _jwt_exp(cache_tok) >= _jwt_exp(PLAUD_TOKEN):
            self.token, self.region = cache_tok, cache_reg
            log.info("Usando token do Plaud em cache.")
        elif PLAUD_TOKEN and _jwt_exp(PLAUD_TOKEN) - time.time() > 3600:
            self.token = PLAUD_TOKEN
            self.region = PLAUD_REGION if PLAUD_REGION in BASE_URLS else "us"
            _salvar_token_cache(self.token, self.region)
            log.info("Usando PLAUD_TOKEN colado (modo token, sem senha).")
        else:
            self.token, self.region = plaud_login()
        _avisar_expiracao(self.token)

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

    def transcricao_pronta(self, file_id):
        """Transcrição que o Plaud já fez (só plano pago). Vazia no grátis."""
        data = self._get(f"/file/detail/{file_id}")
        raw = data.get("data") or data
        melhor = ""
        for item in raw.get("pre_download_content_list", []) or []:
            c = item.get("data_content") or ""
            if len(c) > len(melhor):
                melhor = c
        return melhor

    def url_audio(self, file_id):
        for path in (f"/file/temp-url/{file_id}?is_opus=false", f"/file/temp-url/{file_id}"):
            try:
                d = self._get(path)
                u = d.get("url") or (d.get("data") or {}).get("url") if isinstance(d.get("data"), dict) else d.get("data")
                if isinstance(u, str) and u.startswith("http"):
                    return u
            except Exception:
                continue
        return None

    def baixar_audio(self, file_id):
        u = self.url_audio(file_id)
        if u:
            r = requests.get(u, timeout=120)
            r.raise_for_status()
            return r.content
        # fallback: download direto pela API
        r = requests.get(
            f"{self.base}/file/download/{file_id}",
            headers={"User-Agent": USER_AGENT, "Authorization": f"Bearer {self.token}"},
            timeout=120,
        )
        r.raise_for_status()
        return r.content


# ── helpers da gravacao ───────────────────────────────────
def id_gravacao(g):
    return str(g.get("id") or g.get("file_id") or "")


def inicio_utc_gravacao(g):
    """Plaud grava start_at/start_time em UTC."""
    for k in ("start_time", "start_at", "create_time", "created_at"):
        v = g.get(k)
        if isinstance(v, (int, float)) and v > 0:
            ms = v if v > 1e12 else v * 1000
            return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
        if isinstance(v, str) and v:
            try:
                return datetime.fromisoformat(v.replace("Z", "+00:00")).replace(tzinfo=timezone.utc) \
                    if "+" not in v and "Z" not in v else datetime.fromisoformat(v.replace("Z", "+00:00"))
            except Exception:
                pass
    return None


# ── Google Calendar (.ics) ────────────────────────────────
def _ics_unfold(texto):
    linhas = []
    for ln in texto.splitlines():
        if ln[:1] in (" ", "\t") and linhas:
            linhas[-1] += ln[1:]
        else:
            linhas.append(ln)
    return linhas


def _ics_parse_dt(valor, params):
    valor = valor.strip()
    try:
        if valor.endswith("Z"):
            return datetime.strptime(valor, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
        if "T" in valor:
            dt = datetime.strptime(valor, "%Y%m%dT%H%M%S")
            tz = params.get("TZID")
            if tz:
                try:
                    from zoneinfo import ZoneInfo
                    return dt.replace(tzinfo=ZoneInfo(tz)).astimezone(timezone.utc)
                except Exception:
                    pass
            return dt.replace(tzinfo=timezone.utc)
        return datetime.strptime(valor, "%Y%m%d").replace(tzinfo=timezone.utc)
    except Exception:
        return None


def carregar_eventos_agenda():
    if not GCAL_ICS_URL:
        return []
    r = requests.get(GCAL_ICS_URL, timeout=30)
    r.raise_for_status()
    eventos, atual = [], None
    for ln in _ics_unfold(r.text):
        if ln == "BEGIN:VEVENT":
            atual = {}
        elif ln == "END:VEVENT":
            if atual and atual.get("start") and atual.get("summary"):
                eventos.append(atual)
            atual = None
        elif atual is not None and ":" in ln:
            chave, valor = ln.split(":", 1)
            nome = chave.split(";")[0].upper()
            params = dict(
                p.split("=", 1) for p in chave.split(";")[1:] if "=" in p
            )
            if nome == "DTSTART":
                atual["start"] = _ics_parse_dt(valor, params)
            elif nome == "SUMMARY":
                atual["summary"] = valor.replace("\\,", ",").replace("\\;", ";").strip()
    return eventos


# ── convencao do titulo do EVENTO ─────────────────────────
PR_RE = re.compile(r"\(pr-[sf]\)", re.I)
APRES_RE = re.compile(r"apresenta[cç][aã]o", re.I)


def parse_evento(summary):
    """So aceita evento de venda presencial: (PR-S|PR-F) + Apresentacao +
    (Comissao|Turma). Devolve tipo, texto-da-turma e o rotulo distintivo."""
    s = (summary or "").strip()
    if not PR_RE.search(s) or not APRES_RE.search(s):
        return None

    tem_comissao = bool(re.search(r"comiss[aã]o", s, re.I))
    tem_turma = bool(re.search(r"\bturma\b", s, re.I))
    if not (tem_comissao or tem_turma):
        return None
    tipo = "Reunião Comissão" if tem_comissao else "Reunião Turma"

    # rotulo distintivo (pra diferenciar varias gravacoes da mesma turma)
    rotulo = "Comissão" if tem_comissao else "Turma"
    mturno = re.search(r"\b(matutino|noturno|vespertino)\b", s, re.I)
    mgrupo = re.search(r"\bturma\s+([A-D])\b", s, re.I)
    if mgrupo:
        rotulo = f"Turma {mgrupo.group(1).upper()}"
    elif mturno:
        rotulo = mturno.group(1).capitalize()

    # texto pra casar a turma: tira prefixos/sufixos conhecidos
    t = s
    t = re.sub(r"\(pr-[sf]\)", "", t, flags=re.I)
    t = APRES_RE.sub("", t)
    t = re.sub(r"\bturma\s+[A-D]\b", "", t, flags=re.I)
    t = re.sub(r"\b(matutino|noturno|vespertino)\b", "", t, flags=re.I)
    t = re.sub(r"^\s*[-–]\s*", "", t)
    t = re.sub(r"^\s*(comiss[aã]o|turma)\s*[-–:]?\s*", "", t, flags=re.I)
    t = re.sub(r"\s*[-–]\s*[A-Za-zÀ-ÿ ]+(e [A-Za-zÀ-ÿ]+)?\s*$", "", t)  # "- Lucas", "- Lucas e Gustavo"
    t = t.strip(" -–\u00a0")
    return {"tipo": tipo, "turma_text": t, "rotulo": rotulo}


def casar_turma(turma_text, turmas):
    txt = (turma_text or "").lower()
    cand = []
    for tr in turmas:
        campos = [tr.get("curso"), tr.get("faculdade"), tr.get("turma"), tr.get("ano_formatura")]
        campos = [str(c).lower() for c in campos if c]
        if campos and all(c in txt for c in campos):
            cand.append(tr)
    return cand[0] if len(cand) == 1 else None


def nome_completo_turma(t):
    partes = [t.get("empresa"), t.get("curso"), t.get("faculdade"),
              t.get("turma"), t.get("ano_formatura"), t.get("cidade")]
    return " ".join(str(p) for p in partes if p)


def transcrever_audio_gemini(client, nome_turma, audio_bytes):
    """Plaud grátis não transcreve — o Gemini transcreve o áudio direto.
    Chamada em TEXTO puro (não JSON) pra não quebrar num campo gigante."""
    from google.genai import types
    parte_audio = types.Part.from_bytes(data=audio_bytes, mime_type="audio/mpeg")
    prompt = (
        f'Transcreva em português o áudio desta reunião presencial de vendas de '
        f'formatura da Amor In Formaturas com a turma "{nome_turma}". Marque quem '
        'fala ("Vendedor:", "Aluno:", "Comissão:" quando der pra distinguir, senão '
        '"Speaker 1/2/3:") e ponha [mm:ss] no começo de cada fala. Transcreva do '
        'início ao fim, sem resumir. Devolva só a transcrição.'
    )
    resp = client.models.generate_content(
        model=GEMINI_MODEL, contents=[parte_audio, prompt],
        config={"max_output_tokens": 50000},
    )
    return (resp.text or "").strip()


def analisar_com_gemini(client, nome_turma, transcricao):
    prompt = (
        "Você é um analista especialista em vendas de formatura e SDR educacional.\n"
        f'Analise a transcrição de reunião abaixo referente à turma "{nome_turma}".\n\n'
        f'Transcrição:\n"""\n{transcricao[:ANALISE_MAX_CHARS]}\n"""\n\n'
        "Retorne OBRIGATORIAMENTE APENAS um JSON válido (sem markdown) neste formato:\n"
        '{"probabilidade": <inteiro 0-100>, "sentimento": "positivo|neutro|negativo", '
        '"pontosFortes": [<strings>], "pontosAtencao": [<strings>], '
        '"resumo": "<2-3 frases>", "recomendacao": "<próximo passo>"}'
    )
    resp = client.models.generate_content(
        model=GEMINI_MODEL, contents=prompt,
        config={"response_mime_type": "application/json"},
    )
    return json.loads(resp.text)


def main():
    faltando = [n for n, v in [
        ("SUPABASE_URL", SUPABASE_URL), ("SUPABASE_SERVICE_KEY", SUPABASE_KEY),
    ] if not v]
    if faltando:
        log.error(f"Faltando: {', '.join(faltando)} - abortando.")
        return
    if not (PLAUD_TOKEN or (PLAUD_EMAIL and PLAUD_PASSWORD)):
        log.error("Configure PLAUD_TOKEN OU PLAUD_EMAIL+PLAUD_PASSWORD - abortando.")
        return
    if not GCAL_ICS_URL:
        log.error("Configure GCAL_ICS_URL (endereço secreto da agenda em formato iCal) - abortando.")
        return

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    gemini_client = None
    if GEMINI_API_KEY:
        from google import genai
        gemini_client = genai.Client(api_key=GEMINI_API_KEY)
    else:
        log.warning(
            "GEMINI_API_KEY não configurado - como o Plaud grátis não transcreve, "
            "gravações sem transcrição do Plaud serão puladas."
        )

    eventos = carregar_eventos_agenda()
    log.info(f"{len(eventos)} evento(s) na agenda.")

    api = PlaudAPI()
    gravacoes = api.listar_gravacoes()
    log.info(f"{len(gravacoes)} gravação(ões) no Plaud.")

    turmas = sb.table("turmas").select(
        "id, curso, faculdade, turma, ano_formatura, cidade, empresa"
    ).execute().data or []

    limite = datetime.now(timezone.utc) - timedelta(days=JANELA_DIAS)
    criados, pulados = [], []

    for g in gravacoes:
        fid = id_gravacao(g)
        if not fid:
            continue
        inicio = inicio_utc_gravacao(g)
        if not inicio or inicio < limite:
            continue

        url_plaud = f"https://web.plaud.ai/file/{fid}"
        if sb.table("transcricoes").select("id").eq("url", url_plaud).limit(1).execute().data:
            continue  # já processado

        # evento da agenda mais perto que casa com a convenção
        melhor_ev, melhor_diff, melhor_parsed = None, None, None
        for ev in eventos:
            diff = abs((ev["start"] - inicio).total_seconds()) / 60
            if diff > JANELA_MIN:
                continue
            parsed = parse_evento(ev["summary"])
            if not parsed:
                continue
            if melhor_diff is None or diff < melhor_diff:
                melhor_ev, melhor_diff, melhor_parsed = ev, diff, parsed

        nome_grav = (g.get("filename") or g.get("name") or fid)
        if not melhor_ev:
            pulados.append((nome_grav, f"sem evento na agenda perto de {inicio:%d/%m %H:%M} UTC (convenção Apresentação + (PR-x) + Turma/Comissão)"))
            continue

        turma = casar_turma(melhor_parsed["turma_text"], turmas)
        if not turma:
            pulados.append((nome_grav, f'turma não encontrada/ambígua no evento "{melhor_ev["summary"]}"'))
            continue

        # limite de 4 gravações por turma
        ja = sb.table("transcricoes").select("id, titulo").eq("turma_id", turma["id"]) \
            .like("titulo", "[Plaud]%").execute().data or []
        if len(ja) >= MAX_GRAVACOES_POR_TURMA:
            pulados.append((nome_grav, f"turma {nome_completo_turma(turma)} já tem {len(ja)} gravações Plaud (limite {MAX_GRAVACOES_POR_TURMA})"))
            continue

        nome_turma_full = nome_completo_turma(turma)

        # 1) Transcrição: usa a do Plaud se existir (plano pago); senão o
        #    Gemini transcreve o áudio (Plaud grátis não transcreve).
        transcricao = ""
        try:
            transcricao = api.transcricao_pronta(fid)
        except Exception:
            pass
        if not transcricao.strip():
            if not gemini_client:
                pulados.append((nome_grav, "Plaud não transcreveu e não há GEMINI_API_KEY pra transcrever o áudio"))
                continue
            try:
                audio = api.baixar_audio(fid)
            except Exception as e:
                pulados.append((nome_grav, f"não consegui baixar o áudio do Plaud: {e}"))
                continue
            try:
                transcricao = transcrever_audio_gemini(gemini_client, nome_turma_full, audio)
            except Exception as e:
                pulados.append((nome_grav, f"falha ao transcrever áudio no Gemini: {e}"))
                continue
        if not transcricao.strip():
            pulados.append((nome_grav, "transcrição vazia"))
            continue

        # 2) Análise
        analise = None
        if gemini_client:
            try:
                analise = analisar_com_gemini(gemini_client, nome_turma_full, transcricao)
            except Exception as e:
                log.warning(f"Falha Gemini análise (salvo sem análise): {e}")

        rotulo = melhor_parsed["rotulo"]
        titulo = f"[Plaud] (PR-F) Apresentação {rotulo} {nome_completo_turma(turma)}"
        # evita título idêntico se já existir esse rótulo
        if any(rj["titulo"] == titulo for rj in ja):
            titulo += f" #{len(ja) + 1}"

        linha = {
            "turma_id": turma["id"],
            "tipo": melhor_parsed["tipo"],
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
        prob = f' — {analise["probabilidade"]}%' if analise and analise.get("probabilidade") is not None else ""
        criados.append(f'{titulo} (agenda: "{melhor_ev["summary"]}", Δ{melhor_diff:.0f}min){prob}')

    log.info(f"Criadas: {len(criados)}.")
    for c in criados:
        log.info(f"  criado: {c}")
    log.info(f"Pulados: {len(pulados)}.")
    for nome, motivo in pulados:
        log.info(f'  pulado ("{nome}"): {motivo}')


if __name__ == "__main__":
    main()
