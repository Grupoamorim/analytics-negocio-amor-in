"""
Estudo de aprendizado por curso / faculdade
============================================
Roda 1x/semana (GitHub Actions). Para cada curso e cada faculdade com
dados reais (turmas com desfecho ou reunioes analisadas), recalcula os
agregados deterministicos e pede ao Gemini uma sintese pratica de pitch
e estrutura de apresentacao. Grava tudo em `aprendizado_estudo`.

Nunca inventa: se a amostra e pequena, o proprio prompt manda o Gemini
tratar como indicio. Se GEMINI_API_KEY nao estiver configurado, o script
ainda salva os agregados (gerado_por='regras') e sai sem erro.
"""

import os
import json
import logging
from collections import Counter, defaultdict
from datetime import datetime, timezone

from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("aprendizado_estudo")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

STAGE_NAMES = {
    "stage-1": "Prospeccao",
    "stage-2": "Qualificacao/Contato",
    "stage-3": "Reuniao Comissao",
    "stage-4": "Reuniao Turma",
    "stage-5": "Decisao",
    "stage-6": "Fechou ou Perdeu",
}


def sb():
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def fetch_all(client, table, select="*"):
    rows, frm, size = [], 0, 1000
    while True:
        r = client.table(table).select(select).range(frm, frm + size - 1).execute()
        batch = r.data or []
        rows.extend(batch)
        if len(batch) < size:
            break
        frm += size
    return rows


def norm(s):
    return (s or "").strip().lower()


def split_linhas(t):
    return [l.strip().lstrip("-•* ").strip() for l in (t or "").split("\n") if l.strip()]


def top(counter, n=8):
    return [{"texto": t, "n": c} for t, c in counter.most_common(n)]


def agregar(escopo, curso, faculdade, deals, turma_by_id, transcricoes, eventos, materiais):
    def match(c, f):
        if escopo == "curso":
            return norm(c) == norm(curso)
        if escopo == "faculdade":
            return norm(f) == norm(faculdade)
        return True

    deals_esc = []
    lead_ids = set()
    for d in deals:
        t = turma_by_id.get(d.get("turma_id")) or {}
        if match(t.get("curso"), t.get("faculdade")):
            deals_esc.append(d)
            if d.get("turma_id"):
                lead_ids.add(d["turma_id"])

    resolvidos = [d for d in deals_esc if d.get("outcome") in ("ganho", "perdido")]
    ganhos = sum(1 for d in resolvidos if d["outcome"] == "ganho")
    taxa = (ganhos / len(resolvidos)) if resolvidos else None

    trs = [t for t in transcricoes if t.get("turma_id") in lead_ids]
    evs = []
    for e in eventos:
        if e.get("deal_id") in {d["id"] for d in deals_esc} or match(e.get("curso"), e.get("faculdade")):
            evs.append(e)
    mats = [m for m in materiais if match(m.get("curso"), m.get("faculdade"))]

    tempo = defaultdict(list)
    portao = Counter()
    for e in evs:
        if e.get("tipo") == "transicao" and e.get("from_stage") and e.get("to_stage"):
            portao[f"{e['from_stage']}->{e['to_stage']}"] += 1
            if e.get("dias_no_estagio_origem") is not None:
                tempo[e["from_stage"]].append(e["dias_no_estagio_origem"])
    tempo_medio = {k: round(sum(v) / len(v)) for k, v in tempo.items() if v}

    objecoes = Counter()
    fortes = Counter()
    for t in trs:
        for x in split_linhas(t.get("pontos_atencao")):
            objecoes[x] += 1
        for x in split_linhas(t.get("pontos_fortes")):
            fortes[x] += 1
    for m in mats:
        for x in split_linhas(m.get("pontos_atencao")):
            objecoes[x] += 1
        for x in split_linhas(m.get("pontos_fortes")):
            fortes[x] += 1

    motivos = Counter()
    for d in resolvidos:
        if d["outcome"] == "perdido" and d.get("lost_reason"):
            motivos[d["lost_reason"]] += 1
    for e in evs:
        if e.get("outcome") == "perdido" and e.get("motivo_perda"):
            motivos[e["motivo_perda"]] += 1

    return {
        "escopo": escopo,
        "curso": curso or "",
        "faculdade": faculdade or "",
        "amostra_turmas": len(resolvidos),
        "amostra_reunioes": len(trs),
        "taxa_fechamento": taxa,
        "taxa_avanco_por_portao": dict(portao),
        "tempo_medio_por_estagio": tempo_medio,
        "objecoes_comuns": top(objecoes),
        "pontos_fortes_comuns": top(fortes),
        "motivos_perda_comuns": top(motivos),
    }, trs, mats


def montar_corpus(agg, trs, mats):
    L = []
    L.append("## Numeros reais (amostra pequena - trate como indicio)")
    L.append(f"- Turmas com desfecho: {agg['amostra_turmas']}")
    L.append(
        "- Taxa de fechamento: "
        + (f"{round(agg['taxa_fechamento'] * 100)}%" if agg["taxa_fechamento"] is not None else "sem dados")
    )
    L.append(f"- Reunioes analisadas: {agg['amostra_reunioes']}")
    if agg["tempo_medio_por_estagio"]:
        L.append(
            "- Tempo medio por fase (dias): "
            + ", ".join(f"{STAGE_NAMES.get(k, k)}={v}" for k, v in agg["tempo_medio_por_estagio"].items())
        )
    if agg["objecoes_comuns"]:
        L.append("\n## Objecoes mais citadas")
        L += [f"- ({o['n']}x) {o['texto']}" for o in agg["objecoes_comuns"]]
    if agg["pontos_fortes_comuns"]:
        L.append("\n## Pontos fortes mais citados")
        L += [f"- ({o['n']}x) {o['texto']}" for o in agg["pontos_fortes_comuns"]]
    if agg["motivos_perda_comuns"]:
        L.append("\n## Motivos de perda")
        L += [f"- ({o['n']}x) {o['texto']}" for o in agg["motivos_perda_comuns"]]
    if trs:
        L.append("\n## Resumos de reunioes reais")
        for t in trs[:12]:
            L.append(
                f"- prob {t.get('probabilidade')}%. Resumo: {t.get('resumo') or '(sem resumo)'} "
                f"Objecoes: {'; '.join(split_linhas(t.get('pontos_atencao'))) or 'nenhuma'}."
            )
    if mats:
        L.append("\n## Material de aprendizado (fora do funil) e treinamentos")
        for m in mats[:15]:
            L.append(
                f"- [{m.get('categoria')}] {m.get('titulo')}. Licoes: {m.get('licoes') or '-'}. "
                f"Taticas: {m.get('taticas') or '-'}."
            )
    return "\n".join(L)


def gerar_ia(client, alvo, corpus):
    prompt = (
        "Voce e head de vendas de formatura da Amor In Formaturas. Abaixo esta TODO o "
        f"material real sobre o recorte: \"{alvo}\". A amostra e pequena - use como indicio "
        "e nao invente nada que nao esteja no material.\n\nMATERIAL:\n\"\"\"\n"
        + corpus[:18000]
        + "\n\"\"\"\n\nRetorne SOMENTE um JSON com as chaves: oQueFunciona, oQueEvitar, "
        "pitchRecomendado, estruturaApresentacao, preferenciasFormandos (todas string)."
    )
    resp = client.models.generate_content(
        model=GEMINI_MODEL, contents=prompt, config={"response_mime_type": "application/json"}
    )
    return json.loads(resp.text)


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        log.error("SUPABASE_URL / SUPABASE_SERVICE_KEY nao configurados.")
        return

    client = sb()
    turmas = fetch_all(client, "turmas", "id, curso, faculdade")
    turma_by_id = {t["id"]: t for t in turmas}
    deals = fetch_all(client, "deals", "id, turma_id, outcome, stage, lost_reason")
    transcricoes = fetch_all(
        client, "transcricoes", "turma_id, probabilidade, resumo, pontos_fortes, pontos_atencao"
    )
    eventos = fetch_all(client, "funil_eventos")
    materiais = fetch_all(client, "aprendizado_material")

    cursos = sorted({norm(t.get("curso")) and t["curso"] for t in turmas if t.get("curso")})
    faculdades = sorted({t["faculdade"] for t in turmas if t.get("faculdade")})

    genai_client = None
    if GEMINI_API_KEY:
        from google import genai

        genai_client = genai.Client(api_key=GEMINI_API_KEY)
    else:
        log.warning("GEMINI_API_KEY nao configurado - salvando so os agregados.")

    alvos = [("curso", c, None) for c in cursos] + [("faculdade", None, f) for f in faculdades]
    agora = datetime.now(timezone.utc).isoformat()
    n_ok = 0

    for escopo, curso, faculdade in alvos:
        agg, trs, mats = agregar(
            escopo, curso, faculdade, deals, turma_by_id, transcricoes, eventos, materiais
        )
        if agg["amostra_turmas"] == 0 and agg["amostra_reunioes"] == 0 and not mats:
            continue

        row = dict(agg)
        row["gerado_em"] = agora
        row["gerado_por"] = "regras"
        row["updated_at"] = agora

        if genai_client:
            alvo = curso or faculdade
            try:
                ia = gerar_ia(genai_client, alvo, montar_corpus(agg, trs, mats))
                row.update(
                    {
                        "o_que_funciona": ia.get("oQueFunciona"),
                        "o_que_evitar": ia.get("oQueEvitar"),
                        "pitch_recomendado": ia.get("pitchRecomendado"),
                        "estrutura_apresentacao": ia.get("estruturaApresentacao"),
                        "preferencias_formandos": ia.get("preferenciasFormandos"),
                        "gerado_por": "gemini",
                    }
                )
            except Exception as e:
                log.error(f"  Falha Gemini para {escopo} {curso or faculdade}: {e}")

        try:
            client.table("aprendizado_estudo").upsert(
                row, on_conflict="escopo,curso,faculdade"
            ).execute()
            n_ok += 1
        except Exception as e:
            log.error(f"  Erro salvando estudo {escopo} {curso or faculdade}: {e}")

    log.info(f"OK: {n_ok} estudos atualizados.")


if __name__ == "__main__":
    main()
