"""
Classificador de despesas por IA (Gemini)
==========================================
Roda depois do coletor SGE (mesma execucao horaria do GitHub Actions).
Classifica cada lancamento NOVO de contas_pagar no grupo contabil do
DRE e salva o resultado na propria linha (grupo_dre) - so classifica
uma vez por lancamento, nunca reprocessa o que ja tem classificacao.

Se GEMINI_API_KEY nao estiver configurado, ou a chamada falhar, o
script sai sem erro - o DRE cai de volta pro classificador por
palavras-chave (dashboard/pages/05_dre.py) para os itens sem grupo_dre.
"""

import os
import json
import logging
from datetime import datetime, timezone
from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("ia_classificador")

SUPABASE_URL   = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY   = os.getenv("SUPABASE_SERVICE_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL   = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

GRUPOS_DRE = [
    "Impostos e Taxas sobre Vendas",
    "Custos Diretos (Produção/Serviços)",
    "Despesas Comerciais e Marketing",
    "Despesas com Pessoal e Administrativas",
    "Despesas Financeiras",
    "Outras Despesas Operacionais",
]

LOTE = 100


def get_supabase():
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def buscar_pendentes(sb, limite=LOTE):
    r = (
        sb.table("contas_pagar")
        .select("id, descricao, fornecedor, categoria, valor")
        .is_("grupo_dre", "null")
        .limit(limite)
        .execute()
    )
    return r.data or []


def classificar_lote(client, lancamentos):
    itens = [
        {
            "id": l["id"],
            "categoria": l.get("categoria") or "",
            "descricao": l.get("descricao") or "",
            "fornecedor": l.get("fornecedor") or "",
        }
        for l in lancamentos
    ]
    prompt = (
        "Você é um contador classificando despesas de uma empresa de fotografia "
        "de formaturas (pacotes fotográficos para turmas de faculdade) dentro de "
        "um DRE (Demonstrativo de Resultado). Para cada lançamento da lista "
        f"abaixo, escolha EXATAMENTE um destes grupos contábeis:\n{json.dumps(GRUPOS_DRE, ensure_ascii=False)}\n\n"
        f"Lançamentos (JSON):\n{json.dumps(itens, ensure_ascii=False)}\n\n"
        'Responda SOMENTE com um JSON no formato [{"id": "...", "grupo_dre": "..."}, ...], '
        "um item para cada lançamento da lista, na mesma ordem, sem nenhum texto adicional."
    )
    resp = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
        config={"response_mime_type": "application/json"},
    )
    return json.loads(resp.text)


def main():
    if not GEMINI_API_KEY:
        log.warning("GEMINI_API_KEY não configurado — pulando classificação por IA (DRE usa palavras-chave).")
        return
    if not SUPABASE_URL or not SUPABASE_KEY:
        log.error("SUPABASE_URL / SUPABASE_SERVICE_KEY não configurados.")
        return

    from google import genai
    client = genai.Client(api_key=GEMINI_API_KEY)
    sb = get_supabase()

    total = 0
    while True:
        try:
            pendentes = buscar_pendentes(sb)
        except Exception as e:
            log.error(f"Erro buscando lançamentos pendentes (tabela/coluna ausente?): {e}")
            return
        if not pendentes:
            break
        try:
            resultado = classificar_lote(client, pendentes)
        except Exception as e:
            log.error(f"Erro classificando lote via Gemini: {e}")
            break

        por_id = {
            str(r.get("id")): r.get("grupo_dre")
            for r in resultado
            if isinstance(r, dict) and r.get("grupo_dre") in GRUPOS_DRE
        }
        agora = datetime.now(timezone.utc).isoformat()
        linhas = [
            {"id": l["id"], "grupo_dre": por_id[str(l["id"])], "grupo_dre_classificado_em": agora}
            for l in pendentes
            if str(l["id"]) in por_id
        ]
        if linhas:
            try:
                sb.table("contas_pagar").upsert(linhas, on_conflict="id").execute()
                total += len(linhas)
                log.info(f"  Classificados {len(linhas)} lançamentos neste lote.")
            except Exception as e:
                log.error(f"Erro salvando classificação no Supabase: {e}")
                break

        if len(pendentes) < LOTE or not linhas:
            break

    log.info(f"OK: {total} lançamentos classificados por IA nesta execução.")


if __name__ == "__main__":
    main()
