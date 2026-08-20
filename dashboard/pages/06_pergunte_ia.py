"""
Página: Pergunte à IA
Chat com Gemini que tem acesso de leitura ao banco de dados (tabelas e
views do dashboard) para responder qualquer pergunta sobre os números
do negócio. Usa a mesma chave "anon" das outras páginas — o banco só
permite leitura (SELECT) pra essa chave, então a IA nunca consegue
alterar ou apagar nada, mesmo tendo "acesso livre" às consultas.
"""

import os
import json
import streamlit as st
from supabase import create_client

st.set_page_config(page_title="Pergunte à IA", page_icon="🤖", layout="wide")
st.title("🤖 Pergunte à IA sobre o negócio")
st.caption("Faça perguntas em português sobre vendas, financeiro, turmas ou o DRE — a IA consulta o banco ao vivo pra responder.")


def get_secret(nome):
    return os.getenv(nome) or st.secrets.get(nome, "")


GEMINI_API_KEY = get_secret("GEMINI_API_KEY")
GEMINI_MODEL = get_secret("GEMINI_MODEL") or "gemini-2.5-flash"

TABELAS_PERMITIDAS = [
    "pagamentos", "contas_pagar", "vendas", "turmas", "clientes",
    "vw_resumo_turmas", "vw_totais_negocio", "vw_inadimplencia", "vw_faturamento_mensal",
]

SYSTEM_PROMPT = f"""Você é um analista financeiro assistente do dono de uma empresa de
fotografia de formaturas (Amor In Formaturas). Você responde perguntas sobre o negócio
consultando o banco de dados ao vivo através da ferramenta `consultar_tabela`.

Tabelas e views disponíveis (só leitura) e o que cada uma contém:
- pagamentos: parcelas de contas a receber (colunas: valor, valor_pago, status
  [pendente/pago/atrasado/cancelado], data_vencimento, data_pagamento, turma_id, cliente_id)
- contas_pagar: despesas/custos (colunas: descricao, fornecedor, categoria, valor, status,
  data_vencimento, data_pagamento, turma_id, grupo_dre [grupo do DRE já classificado por IA])
- vendas: vendas/contratos fechados (colunas: valor_total, valor_entrada, status, data_venda, turma_id)
- turmas: turmas/eventos de formatura (colunas: nome, curso, status, meta_vendas, total_alunos)
- vw_resumo_turmas: resumo financeiro por turma (já pronto, uma linha por turma)
- vw_totais_negocio: totais gerais do negócio inteiro (uma única linha: total_faturado,
  total_recebido, total_a_receber, total_inadimplente, total_custos)
- vw_inadimplencia: clientes em atraso, já com dias_atraso calculado
- vw_faturamento_mensal: faturamento e recebido agregados por mês

Regras importantes:
- SEMPRE que precisar de um número, consulte o banco com `consultar_tabela` — nunca invente
  valores.
- Lançamentos com status = 'cancelado' já deveriam ser ignorados nas suas contas de receita/despesa
  a não ser que o usuário peça especificamente por cancelados.
- Responda sempre em português, de forma direta, com os valores em R$ formatados.
- Se uma pergunta exigir somar/agrupar dados, você pode fazer várias chamadas a
  `consultar_tabela` e calcular o resultado você mesmo a partir dos dados retornados.
"""


@st.cache_resource
def get_supabase():
    url = get_secret("SUPABASE_URL")
    key = get_secret("SUPABASE_ANON_KEY")
    return create_client(url, key)


def consultar_tabela(tabela: str, colunas: str = "*", filtros: str = "", ordenar_por: str = "", ordem_desc: bool = False, limite: int = 200) -> str:
    """Consulta uma tabela ou view do banco de dados (somente leitura) e retorna as linhas em JSON.

    Args:
        tabela: nome exato da tabela/view (uma das permitidas: pagamentos, contas_pagar,
            vendas, turmas, clientes, vw_resumo_turmas, vw_totais_negocio, vw_inadimplencia,
            vw_faturamento_mensal).
        colunas: colunas a retornar, separadas por vírgula, ou "*" para todas.
        filtros: filtros no formato PostgREST separados por vírgula, ex:
            "status=eq.pendente,valor=gte.100". Operadores comuns: eq, neq, gt, gte, lt, lte,
            like, is. Deixe vazio para não filtrar.
        ordenar_por: nome da coluna para ordenar o resultado. Deixe vazio para não ordenar.
        ordem_desc: True para ordenar do maior para o menor, False para o menor pro maior.
        limite: número máximo de linhas a retornar (máximo 500).

    Returns:
        JSON (string) com a lista de linhas encontradas, ou um objeto {"erro": "..."} se algo falhar.
    """
    if tabela not in TABELAS_PERMITIDAS:
        return json.dumps({"erro": f"Tabela '{tabela}' não permitida. Use uma de: {TABELAS_PERMITIDAS}"})
    try:
        sb = get_supabase()
        q = sb.table(tabela).select(colunas or "*")
        if filtros:
            for parte in filtros.split(","):
                parte = parte.strip()
                if not parte or "=" not in parte:
                    continue
                coluna, resto = parte.split("=", 1)
                if "." not in resto:
                    continue
                operador, valor = resto.split(".", 1)
                q = q.filter(coluna.strip(), operador.strip(), valor.strip())
        if ordenar_por:
            q = q.order(ordenar_por, desc=bool(ordem_desc))
        q = q.limit(min(int(limite or 200), 500))
        r = q.execute()
        return json.dumps(r.data or [], ensure_ascii=False, default=str)
    except Exception as e:
        return json.dumps({"erro": str(e)})


if not GEMINI_API_KEY:
    st.warning(
        "⚠️ A chave `GEMINI_API_KEY` ainda não foi configurada nos Secrets do Streamlit Cloud. "
        "Vá em **Settings → Secrets** do app e adicione `GEMINI_API_KEY = \"...\"` pra ativar o chat."
    )
    st.stop()

from google import genai
from google.genai import types

if "chat_ia" not in st.session_state:
    client = genai.Client(api_key=GEMINI_API_KEY)
    st.session_state.chat_ia = client.chats.create(
        model=GEMINI_MODEL,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            tools=[consultar_tabela],
        ),
    )
    st.session_state.historico_ia = []

for autor, texto in st.session_state.historico_ia:
    with st.chat_message(autor):
        st.markdown(texto)

pergunta = st.chat_input("Ex: qual foi o faturamento de julho? quais turmas estão inadimplentes?")
if pergunta:
    st.session_state.historico_ia.append(("user", pergunta))
    with st.chat_message("user"):
        st.markdown(pergunta)
    with st.chat_message("assistant"):
        with st.spinner("Consultando o banco de dados..."):
            try:
                resposta = st.session_state.chat_ia.send_message(pergunta)
                texto_resposta = resposta.text or "Não consegui gerar uma resposta."
            except Exception as e:
                texto_resposta = f"⚠️ Erro ao consultar a IA: {e}"
        st.markdown(texto_resposta)
    st.session_state.historico_ia.append(("assistant", texto_resposta))
