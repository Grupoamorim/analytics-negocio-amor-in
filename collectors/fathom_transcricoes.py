"""
Fathom -> Transcricoes
=======================
Substitui a rotina que rodava como agente Claude na nuvem (RemoteTrigger),
que gastava tokens do Claude toda hora, 24h/dia. Este script faz a mesma
coisa como codigo puro + Gemini (so a analise de sentimento/probabilidade
usa IA - o resto e regra determinística), rodando de graca no GitHub Actions.

Fluxo:
  1. Le e-mails nao lidos do Gmail (IMAP) de no-reply@fathom.video,
     assunto "Recap for \"...\"".
  2. So processa reuniao de venda: titulo precisa conter "Apresentacao"
     E ("Comissao" ou "Turma") E "(ON)" - senao e outra coisa (reuniao
     interna, 1:1 etc) e so marca como lida sem processar.
  3. Extrai closer (Amorim -> Lucas Amorim, Daniel -> Daniel Silva) e
     nome da turma do titulo, casa com a tabela `turmas` no Supabase
     (fuzzy, curso+faculdade+turma+ano_formatura contidos no texto).
     Se nao achar exatamente uma turma, pula (nunca inventa).
  4. Busca o link https://fathom.video/calls/<id> no corpo do e-mail,
     puxa a transcricao completa via API do Fathom.
  5. Analisa com Gemini (probabilidade/sentimento/resumo/pontos).
  6. Grava em `transcricoes` (Supabase) e marca o e-mail como lido.

Reunioes presenciais (PR-S)/(PR-F) nao passam por aqui - fluxo manual
separado (upload no app).
"""

import os
import re
import json
import email
import logging
import imaplib
from email.header import decode_header
from datetime import datetime, timezone

import requests
from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("fathom_transcricoes")

GMAIL_ADDRESS      = os.getenv("GMAIL_ADDRESS", "").strip()
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD", "").strip()
FATHOM_API_KEY     = os.getenv("FATHOM_API_KEY", "").strip()
SUPABASE_URL       = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY       = os.getenv("SUPABASE_SERVICE_KEY", "")
GEMINI_API_KEY     = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL       = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

FATHOM_BASE_URL = "https://api.fathom.ai/external/v1"

CLOSER_ALIASES = {
    "amorim": "Lucas Amorim",
    "daniel": "Daniel Silva",
}

FATHOM_URL_RE = re.compile(r"https://fathom\.video/calls/(\d+)")

TRANSCRICAO_MAX_CHARS = 50000
ANALISE_MAX_CHARS = 15000


def get_supabase():
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def decode_mime_header(raw):
    partes = decode_header(raw or "")
    out = ""
    for texto, charset in partes:
        if isinstance(texto, bytes):
            out += texto.decode(charset or "utf-8", errors="replace")
        else:
            out += texto
    return out


def extrair_corpo_texto(msg):
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain" and "attachment" not in str(part.get("Content-Disposition", "")):
                charset = part.get_content_charset() or "utf-8"
                return part.get_payload(decode=True).decode(charset, errors="replace")
        for part in msg.walk():
            if part.get_content_type() == "text/html" and "attachment" not in str(part.get("Content-Disposition", "")):
                charset = part.get_content_charset() or "utf-8"
                return part.get_payload(decode=True).decode(charset, errors="replace")
        return ""
    charset = msg.get_content_charset() or "utf-8"
    payload = msg.get_payload(decode=True)
    return payload.decode(charset, errors="replace") if payload else ""


def parse_titulo(titulo_reuniao):
    """Espelha web/src/utils/meetingTitleParser.ts + regra de closer.
    So aceita reuniao de venda online: precisa ter Apresentacao + (Comissao|Turma) + (ON).
    """
    titulo = (titulo_reuniao or "").strip()

    is_online = bool(re.search(r"\(on\)", titulo, re.I))
    tem_apresentacao = bool(re.search(r"apresenta[cç][aã]o", titulo, re.I))

    tipo = None
    if re.search(r"comiss[aã]o", titulo, re.I):
        tipo = "Reunião Comissão"
    elif re.search(r"\bturma\b", titulo, re.I):
        tipo = "Reunião Turma"

    if not (is_online and tem_apresentacao and tipo):
        return None

    closer = None
    for chave, nome_completo in CLOSER_ALIASES.items():
        if re.search(chave, titulo, re.I):
            closer = nome_completo
            titulo = re.sub(chave, "", titulo, flags=re.I)
            break

    turma_text = titulo
    turma_text = re.sub(r"\((on|pr-s|pr-f)\)", "", turma_text, flags=re.I)
    turma_text = re.sub(r"^\s*apresenta[cç][aã]o\s*-\s*", "", turma_text, flags=re.I)
    turma_text = re.sub(r"^\s*(comiss[aã]o|turma)\s*-\s*", "", turma_text, flags=re.I)
    turma_text = re.sub(r"\s*-\s*$", "", turma_text).strip(" -")

    return {"tipo": tipo, "turma_text": turma_text, "closer": closer}


def buscar_turmas(sb):
    r = sb.table("turmas").select("id, curso, faculdade, turma, ano_formatura, cidade, empresa").execute()
    return r.data or []


def casar_turma(turma_text, turmas):
    texto = (turma_text or "").lower()
    candidatas = []
    for t in turmas:
        campos = [t.get("curso"), t.get("faculdade"), t.get("turma"), t.get("ano_formatura")]
        campos = [c for c in campos if c]
        if not campos:
            continue
        if all(str(c).lower() in texto for c in campos):
            candidatas.append(t)
    if len(candidatas) == 1:
        return candidatas[0]
    return None


def nome_completo_turma(t):
    partes = [t.get("empresa"), t.get("curso"), t.get("faculdade"), t.get("turma"), t.get("ano_formatura"), t.get("cidade")]
    return " ".join(str(p) for p in partes if p)


def buscar_transcricao_fathom(recording_id):
    r = requests.get(
        f"{FATHOM_BASE_URL}/recordings/{recording_id}/transcript",
        headers={"X-Api-Key": FATHOM_API_KEY},
        timeout=30,
    )
    r.raise_for_status()
    itens = r.json().get("transcript", [])
    linhas = []
    for item in itens:
        speaker = (item.get("speaker") or {}).get("display_name") or "?"
        texto = item.get("text") or ""
        ts = item.get("timestamp") or ""
        linhas.append(f"[{ts}] {speaker}: {texto}")
    return "\n".join(linhas)


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
        ("GMAIL_ADDRESS", GMAIL_ADDRESS), ("GMAIL_APP_PASSWORD", GMAIL_APP_PASSWORD),
        ("FATHOM_API_KEY", FATHOM_API_KEY), ("SUPABASE_URL", SUPABASE_URL),
        ("SUPABASE_SERVICE_KEY", SUPABASE_KEY),
    ] if not v]
    if faltando:
        log.error(f"Faltando variáveis de ambiente: {', '.join(faltando)} - abortando.")
        return

    sb = get_supabase()
    gemini_client = None
    if GEMINI_API_KEY:
        from google import genai
        gemini_client = genai.Client(api_key=GEMINI_API_KEY)
    else:
        log.warning("GEMINI_API_KEY não configurado - transcrições serão salvas sem análise de IA.")

    imap = imaplib.IMAP4_SSL("imap.gmail.com")
    imap.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
    imap.select("INBOX")

    status, dados = imap.search(None, 'UNSEEN', 'FROM', '"no-reply@fathom.video"')
    if status != "OK":
        log.error(f"Falha na busca IMAP: {status}")
        imap.logout()
        return

    ids = dados[0].split()
    log.info(f"{len(ids)} e-mail(s) não lido(s) do Fathom encontrados.")

    turmas = buscar_turmas(sb)
    criados, pulados = [], []

    for msg_id in ids:
        status, msg_data = imap.fetch(msg_id, "(RFC822)")
        if status != "OK":
            continue
        msg = email.message_from_bytes(msg_data[0][1])
        assunto = decode_mime_header(msg.get("Subject", ""))

        m = re.match(r'Recap for "(.+)"', assunto.strip())
        if not m:
            continue
        titulo_reuniao = m.group(1)

        parsed = parse_titulo(titulo_reuniao)
        if not parsed:
            imap.store(msg_id, "+FLAGS", "\\Seen")
            pulados.append((titulo_reuniao, "título fora do padrão (precisa de Apresentação + Comissão/Turma + (ON))"))
            continue

        corpo = extrair_corpo_texto(msg)
        link_match = FATHOM_URL_RE.search(corpo)
        if not link_match:
            imap.store(msg_id, "+FLAGS", "\\Seen")
            pulados.append((titulo_reuniao, "link do Fathom não encontrado no corpo"))
            continue
        recording_id = link_match.group(1)
        url_fathom = f"https://fathom.video/calls/{recording_id}"

        turma = casar_turma(parsed["turma_text"], turmas)
        if not turma:
            imap.store(msg_id, "+FLAGS", "\\Seen")
            pulados.append((titulo_reuniao, "turma não encontrada/ambígua"))
            continue

        existente = sb.table("transcricoes").select("id").eq("url", url_fathom).limit(1).execute()
        if existente.data:
            imap.store(msg_id, "+FLAGS", "\\Seen")
            pulados.append((titulo_reuniao, "já processado antes"))
            continue

        try:
            transcricao = buscar_transcricao_fathom(recording_id)
        except Exception as e:
            log.error(f"Erro buscando transcrição do Fathom (recording_id={recording_id}): {e}")
            imap.store(msg_id, "+FLAGS", "\\Seen")
            pulados.append((titulo_reuniao, f"erro Fathom: {e}"))
            continue

        analise = None
        if gemini_client:
            try:
                analise = analisar_com_gemini(gemini_client, nome_completo_turma(turma), transcricao)
            except Exception as e:
                log.warning(f"Falha na análise Gemini (salvando sem análise): {e}")

        linha = {
            "turma_id": turma["id"],
            "tipo": parsed["tipo"],
            "titulo": titulo_reuniao,
            "conteudo": transcricao[:TRANSCRICAO_MAX_CHARS],
            "url": url_fathom,
            "probabilidade": (analise or {}).get("probabilidade"),
            "sentimento": (analise or {}).get("sentimento"),
            "resumo": (analise or {}).get("resumo"),
            "pontos_fortes": "\n".join((analise or {}).get("pontosFortes", []) or []) or None,
            "pontos_atencao": "\n".join((analise or {}).get("pontosAtencao", []) or []) or None,
            "proximo_passo": (analise or {}).get("recomendacao"),
        }
        sb.table("transcricoes").insert(linha).execute()
        imap.store(msg_id, "+FLAGS", "\\Seen")

        prob = f' — probabilidade {analise["probabilidade"]}%' if analise and analise.get("probabilidade") is not None else ""
        closer_info = f' (closer: {parsed["closer"]})' if parsed["closer"] else ""
        criados.append(f'{nome_completo_turma(turma)} — {parsed["tipo"]}{closer_info}{prob}')

    imap.logout()

    log.info(f"Criadas: {len(criados)} transcrição(ões).")
    for c in criados:
        log.info(f"  criado: {c}")
    log.info(f"Pulados: {len(pulados)}.")
    for titulo, motivo in pulados:
        log.info(f'  pulado ("{titulo}"): {motivo}')


if __name__ == "__main__":
    main()
