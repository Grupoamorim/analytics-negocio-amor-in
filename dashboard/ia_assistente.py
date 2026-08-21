"""
Widget de IA - importado e chamado no topo de TODAS as páginas (não é
uma página separada no menu). Renderiza um botão flutuante no canto
inferior direito da tela; clicar abre uma abinha (popover, não modal)
com o chat do Gemini - a página continua interativa por trás, como um
widget de chat do WhatsApp Web, não uma tela cheia.

O Gemini tem acesso de leitura ao banco (tabelas e views) via
`consultar_tabela`, e atua com postura de analista financeiro/de
mercado, não só de "leitor de números".
"""

import os
import json
import streamlit as st
from supabase import create_client


def _get_secret(nome):
    return os.getenv(nome) or st.secrets.get(nome, "")


GEMINI_API_KEY = _get_secret("GEMINI_API_KEY")
GEMINI_MODEL = _get_secret("GEMINI_MODEL") or "gemini-2.5-flash"

TABELAS_PERMITIDAS = [
    "pagamentos", "contas_pagar", "vendas", "turmas", "clientes",
    "vw_resumo_turmas", "vw_totais_negocio", "vw_inadimplencia", "vw_faturamento_mensal",
]

SYSTEM_PROMPT = """Você é um analista financeiro sênior e de mercado, atuando como consultor do
dono de uma empresa de fotografia de formaturas (Amor In Formaturas, Bahia/Brasil). Seu trabalho
não é só relatar números — é interpretá-los como um CFO/consultor faria.

Seu papel tem 3 frentes:

1) ANÁLISE FINANCEIRA: ao responder sobre faturamento, DRE, margens, inadimplência ou fluxo de
   caixa, aponte tendências, riscos e oportunidades, compare períodos quando fizer sentido, e dê
   uma leitura (bom/ruim/atenção) além do valor bruto — não apenas devolva o número.

2) CONTEXTO TRIBUTÁRIO E LEGAL (Brasil): tenha em mente os regimes tributários comuns pra esse
   porte de empresa (Simples Nacional, MEI, Lucro Presumido), os tributos que incidem sobre
   serviços (ISS municipal, PIS, COFINS) e obrigações usuais (emissão de nota fiscal, guia DAS).
   Alíquotas e faixas mudam com frequência e variam por município — quando o usuário precisar de
   um número tributário exato ou de uma decisão fiscal, dê a orientação geral mas deixe claro que
   ele deve confirmar o valor exato com o contador do negócio antes de agir. Nunca invente uma
   alíquota específica como se fosse certeza.

3) ANÁLISE DE MERCADO: quando fizer sentido, contextualize os números com boas práticas do
   mercado de fotografia de formaturas e de vendas em geral (sazonalidade — vendas concentram em
   certas épocas do calendário acadêmico, ticket médio por turma, taxa de conversão de leads,
   nível de inadimplência típico do setor) pra ajudar o dono a entender se os números estão bons
   ou ruins frente ao esperado, não só em termos absolutos.

Você responde perguntas sobre o negócio consultando o banco de dados ao vivo através da
ferramenta `consultar_tabela` — nunca invente valores financeiros, sempre consulte antes de
responder com um número.

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
- SEMPRE que precisar de um número do negócio, consulte o banco com `consultar_tabela`.
- Lançamentos com status = 'cancelado' já deveriam ser ignorados nas suas contas de receita/despesa
  a não ser que o usuário peça especificamente por cancelados.
- Responda sempre em português, de forma direta, com os valores em R$ formatados — mas não hesite
  em dar sua opinião analítica quando perguntado "isso é bom?", "o que eu devo fazer?".
- Se uma pergunta exigir somar/agrupar dados, você pode fazer várias chamadas a
  `consultar_tabela` e calcular o resultado você mesmo a partir dos dados retornados.
"""


@st.cache_resource
def _get_supabase():
    url = _get_secret("SUPABASE_URL")
    key = _get_secret("SUPABASE_ANON_KEY")
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
        sb = _get_supabase()
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


def _get_chat():
    if "chat_ia" not in st.session_state:
        from google import genai
        from google.genai import types
        client = genai.Client(api_key=GEMINI_API_KEY)
        st.session_state.chat_ia = client.chats.create(
            model=GEMINI_MODEL,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                tools=[consultar_tabela],
            ),
        )
        st.session_state.historico_ia = []
    return st.session_state.chat_ia


def _conteudo_chat():
    st.markdown("**🤖 Pergunte à IA**")
    st.caption("Analista financeiro com acesso ao seu banco de dados, ao vivo.")
    for autor, texto in st.session_state.get("historico_ia", []):
        with st.chat_message(autor):
            st.markdown(texto)

    pergunta = st.chat_input("Ex: o faturamento desse mês está bom?")
    if pergunta:
        chat = _get_chat()
        st.session_state.historico_ia.append(("user", pergunta))
        with st.chat_message("user"):
            st.markdown(pergunta)
        with st.chat_message("assistant"):
            with st.spinner("Consultando o banco de dados..."):
                try:
                    resposta = chat.send_message(pergunta)
                    texto_resposta = resposta.text or "Não consegui gerar uma resposta."
                except Exception as e:
                    texto_resposta = f"⚠️ Erro ao consultar a IA: {e}"
            st.markdown(texto_resposta)
        st.session_state.historico_ia.append(("assistant", texto_resposta))


_CSS_WIDGET = """
<style>
div[data-testid="stPopover"] button {
    border-radius: 50% !important;
    width: 46px !important;
    height: 46px !important;
    font-size: 20px !important;
    background: #F97316 !important;
    color: #16181D !important;
    border: none !important;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    padding: 0 !important;
}
div[data-testid="stPopover"] button:hover { background: #EA580C !important; }
[data-testid="stPopoverBody"] {
    width: 380px !important;
    max-width: 90vw;
}
</style>
"""


def render_botao_flutuante():
    """Chame no topo de cada página (depois do st.set_page_config) para
    mostrar o botão de IA alinhado à direita, no topo da página, em
    todas as páginas. Clicar abre uma abinha (popover) com o chat -
    não bloqueia o resto da página, dá pra continuar mexendo no
    dashboard com o chat aberto. Não faz nada se GEMINI_API_KEY não
    estiver configurado.

    Nota técnica: tentamos deixar o botão fixo/flutuante (visível ao
    rolar a página) via CSS position:fixed, mas o Streamlit encapsula
    os elementos de um jeito que prende a posição fixa dentro de um
    contêiner interno em vez do canto real da tela - ficava no lugar
    errado. Por isso usamos colunas do Streamlit pra empurrar o botão
    pra direita de forma confiável, mesmo não sendo "flutuante" ao
    rolar."""
    if not GEMINI_API_KEY:
        return
    st.markdown(_CSS_WIDGET, unsafe_allow_html=True)
    _, col_btn = st.columns([20, 1])
    with col_btn:
        with st.popover("🤖"):
            _conteudo_chat()
