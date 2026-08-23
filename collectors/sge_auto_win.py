"""
SGE Auto-Win - Deteccao automatica de turma fechada
=====================================================
Ate aqui essa deteccao so acontecia quando alguem clicava manualmente em
"Sincronizar SGE" na pagina Turmas (web/src/pages/Leads.tsx, handleSyncSGE).
Este script replica exatamente a mesma logica (mesma janela de 90 dias,
mesmo algoritmo de normalizacao/match de nome de turma, mesmo criterio de
Auto-Win) e roda sozinho via GitHub Actions, sem precisar de ninguem
clicar em nada.

Logica portada 1:1 de:
  - web/src/utils/sgeIntegration.ts (extractTurmaNameFromVenda,
    extractCodeFromVenda, normalizeNameForComparison, fetchSGEVendas)
  - web/src/pages/Leads.tsx (handleSyncSGE)
  - web/src/types/crm.ts (getTurmaDisplayName)

Diferenca proposital: alem dos campos de topo que o botao manual olhava,
aqui tambem verificamos os sub-objetos "Cliente"/"Projeto" da venda (mesma
descoberta feita em sge_collector.py: a API do SGE quase sempre devolve o
nome real da turma aninhado em Projeto.Descricao, nao no campo de topo).
Isso so aumenta a taxa de match - nunca marca algo que o botao manual nao
marcaria.
"""

import os
import re
import time
import base64
import logging
import unicodedata
from datetime import date, datetime, timedelta

import requests
from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sge_auto_win")

SGE_CNPJ = os.getenv("SGE_CNPJ", "").strip()
SGE_TOKEN = os.getenv("SGE_TOKEN", "").strip()
SGE_BASE_URL = "https://e-api.sge.com.br"
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

STAGE_FECHOU = "fechou-ou-perdeu"  # mesmo valor usado por STAGE_NAME_TO_ID['stage-6'] no front


def get_headers():
    cred = base64.b64encode(f"{SGE_CNPJ}:{SGE_TOKEN}".encode()).decode()
    return {"Authorization": f"Basic {cred}", "Accept": "application/json"}


def fetch_sge_vendas(data_ini: date, data_fim: date):
    url = f"{SGE_BASE_URL}/api/emp/venda/listar-vendas-por-periodo"
    params = {"PeriodoInicial": data_ini.strftime("%Y-%m-%d"), "PeriodoFinal": data_fim.strftime("%Y-%m-%d")}
    for tentativa in range(3):
        try:
            r = requests.get(url, headers=get_headers(), params=params, timeout=20)
            if r.status_code == 200:
                dados = r.json()
                if isinstance(dados, list):
                    return dados
                if isinstance(dados, dict):
                    for chave in ("items", "data", "Vendas", "vendas"):
                        if isinstance(dados.get(chave), list):
                            return dados[chave]
                return []
            if r.status_code in (401, 403):
                raise RuntimeError("Credenciais SGE invalidas (401/403).")
            log.warning(f"  HTTP {r.status_code} ao buscar vendas (tent {tentativa + 1})")
            time.sleep(10)
        except requests.RequestException as e:
            log.warning(f"  Erro de rede ao buscar vendas: {e} (tent {tentativa + 1})")
            time.sleep(10)
    raise RuntimeError("Falha ao buscar vendas do SGE apos 3 tentativas.")


def sub(item, chave):
    valor = item.get(chave) if isinstance(item, dict) else None
    return valor if isinstance(valor, dict) else {}


def extract_turma_name_from_venda(venda: dict) -> str:
    # Mesma ordem de prioridade de campos de topo que extractTurmaNameFromVenda (sgeIntegration.ts)
    for chave in (
        "Turma/Evento/Projeto", "Turma / Evento / Projeto", "Turma", "Evento",
        "Projeto", "turma", "evento", "projeto", "Descricao", "Nome",
    ):
        valor = venda.get(chave)
        if isinstance(valor, str) and valor.strip():
            return valor.strip()
    # Fallback: nome real costuma estar aninhado em Projeto.Descricao (ver sge_collector.py)
    p = sub(venda, "Projeto")
    valor = p.get("Descricao") or p.get("Nome")
    if isinstance(valor, str) and valor.strip():
        return valor.strip()
    return ""


def extract_code_from_venda(venda: dict) -> str:
    for chave in ("Codigo", "Id", "codigo", "id", "CodigoProjeto", "IdProjeto"):
        valor = venda.get(chave)
        if valor not in (None, ""):
            return str(valor).strip()
    return ""


def normalize_for_comparison(nome: str) -> str:
    if not nome:
        return ""
    n = nome.lower()
    n = unicodedata.normalize("NFD", n)
    n = "".join(c for c in n if unicodedata.category(c) != "Mn")
    n = re.sub(r"[^a-z0-9]", " ", n)
    n = re.sub(r"\s+", " ", n).strip()
    return n


def get_turma_display_name(curso: str, faculdade: str, turma: str) -> str:
    curso = (curso or "").strip()
    faculdade = (faculdade or "").strip()
    turma_num = re.sub(r"^Turma\s+", "", turma or "", flags=re.IGNORECASE).strip()
    curso_curto = curso[:13] + "." if len(curso) > 14 else curso
    fac_curta = faculdade[:9] + "." if len(faculdade) > 10 else faculdade
    turma_sufixo = f" T{turma_num}" if turma_num else ""
    base = " ".join(x for x in [curso_curto, fac_curta] if x)
    resultado = f"{base}{turma_sufixo}".strip()
    return resultado or "Turma sem nome"


def fetch_all_rows(sb, tabela: str, colunas: str, order_col: str = None, desc: bool = False):
    todos = []
    inicio = 0
    tamanho_pagina = 1000
    while True:
        q = sb.table(tabela).select(colunas)
        if order_col:
            q = q.order(order_col, desc=desc)
        q = q.range(inicio, inicio + tamanho_pagina - 1)
        res = q.execute()
        linhas = res.data or []
        todos.extend(linhas)
        if len(linhas) < tamanho_pagina:
            break
        inicio += tamanho_pagina
    return todos


def build_turma_variations(turma: dict) -> list:
    curso = turma.get("curso") or ""
    faculdade = turma.get("faculdade") or ""
    turma_num = turma.get("turma") or ""
    ano = turma.get("ano_formatura") or ""
    cidade = turma.get("cidade") or ""
    empresa = turma.get("empresa") or ""

    full1 = f"{empresa} {curso} {faculdade} {turma_num} {ano} {cidade}".strip()
    full2 = f"{curso} {faculdade} {turma_num} {ano} {cidade}".strip()
    full3 = f"{curso} {faculdade} {turma_num}".strip()
    full4 = get_turma_display_name(curso, faculdade, turma_num)

    return [normalize_for_comparison(v) for v in (full1, full2, full3, full4)]


def main():
    inicio_exec = time.time()
    log.info("=" * 50)
    log.info("SGE Auto-Win - Deteccao automatica de turma fechada")
    log.info(f"Horario: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    log.info("=" * 50)

    if not SGE_CNPJ or not SGE_TOKEN:
        log.error("SGE_CNPJ e SGE_TOKEN sao obrigatorios!")
        return

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    status_final = "sucesso"
    msg_final = ""
    novas_convertidas = 0
    deals_movidos = 0
    unmatched = 0
    vendas_total = 0

    try:
        turmas = fetch_all_rows(
            sb, "turmas",
            "id,curso,faculdade,turma,ano_formatura,cidade,empresa,funil_status,fechamento_contrato",
            order_col="created_at", desc=True,
        )
        deals = fetch_all_rows(sb, "deals", "id,turma_id,stage")
        deal_por_turma = {d["turma_id"]: d for d in deals if d.get("turma_id")}

        log.info(f"  {len(turmas)} turmas e {len(deals)} deals carregados do Supabase")

        turma_variacoes = [(t, build_turma_variations(t)) for t in turmas]

        hoje = date.today()
        vendas = fetch_sge_vendas(hoje - timedelta(days=90), hoje)
        vendas_total = len(vendas)
        log.info(f"  {vendas_total} vendas retornadas pela API SGE (ultimos 90 dias)")

        today_br = hoje.strftime("%d/%m/%Y")
        now_iso = datetime.now().isoformat()

        for venda in vendas:
            nome_bruto = extract_turma_name_from_venda(venda)
            sge_code = extract_code_from_venda(venda)
            if not nome_bruto or not sge_code:
                continue

            norm_venda = normalize_for_comparison(nome_bruto)
            if not norm_venda:
                continue

            matched = None
            for turma, variacoes in turma_variacoes:
                if norm_venda in variacoes:
                    matched = turma
                    break
                if len(norm_venda) > 5 and any(
                    (v and (v in norm_venda or norm_venda in v)) for v in variacoes
                ):
                    matched = turma
                    break

            if not matched:
                unmatched += 1
                continue

            precisa_atualizar_turma = matched.get("funil_status") != "Convertido"
            deal = deal_por_turma.get(matched["id"])

            if deal and deal.get("stage") != STAGE_FECHOU:
                sb.table("deals").update({
                    "stage": STAGE_FECHOU,
                    "outcome": "ganho",
                    "probabilidade": 100,
                    "updated_at": now_iso,
                }).eq("id", deal["id"]).execute()
                sb.table("stage_transitions").insert({
                    "deal_id": deal["id"],
                    "from_stage": deal.get("stage"),
                    "to_stage": STAGE_FECHOU,
                    "changed_at": now_iso,
                }).execute()
                deals_movidos += 1

            if precisa_atualizar_turma:
                sb.table("turmas").update({
                    "funil_status": "Convertido",
                    "fechamento_contrato": matched.get("fechamento_contrato") or today_br,
                }).eq("id", matched["id"]).execute()
                matched["funil_status"] = "Convertido"  # evita reprocessar a mesma turma 2x nesta execucao
                novas_convertidas += 1

        msg_final = (
            f"{vendas_total} vendas verificadas | {novas_convertidas} turmas marcadas como Convertido | "
            f"{deals_movidos} negocios movidos para Fechou (Auto-Win) | {unmatched} sem match"
        )
        log.info(f"  {msg_final}")

    except Exception as e:
        status_final = "erro"
        msg_final = str(e)
        log.error(f"ERRO GERAL: {e}")

    finally:
        duracao = time.time() - inicio_exec
        try:
            sb.table("sync_log").insert({
                "fonte": "sge_funil_auto_win",
                "status": status_final,
                "registros_atualizados": novas_convertidas + deals_movidos,
                "mensagem": msg_final,
                "duracao_segundos": round(duracao, 2),
            }).execute()
        except Exception:
            pass
        log.info(f"\n{'OK' if status_final == 'sucesso' else 'ERRO'} {msg_final}")
        log.info(f"Tempo total: {duracao:.1f}s")


if __name__ == "__main__":
    main()
