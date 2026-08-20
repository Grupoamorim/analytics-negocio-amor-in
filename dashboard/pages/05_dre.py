"""
Página: DRE (Demonstrativo de Resultado do Exercício)
Monta automaticamente um DRE a partir dos lançamentos de contas a pagar e
contas a receber sincronizados do SGE, classificando cada categoria nas
linhas contábeis corretas por meio de um classificador inteligente baseado
em reconhecimento de palavras-chave. Também apresenta o custo por turma.
"""

import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import os
import unicodedata
from datetime import date
from supabase import create_client

st.set_page_config(page_title="DRE", page_icon="🧾", layout="wide")
st.title("🧾 DRE — Demonstrativo de Resultado do Exercício")
st.caption("Montado automaticamente a partir dos lançamentos sincronizados, com classificação inteligente das categorias")


# ──────────────────────────────────────────────────────────────
# Conexão e dados
# ──────────────────────────────────────────────────────────────
@st.cache_resource
def get_supabase():
    url = os.getenv("SUPABASE_URL") or st.secrets.get("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_ANON_KEY") or st.secrets.get("SUPABASE_ANON_KEY", "")
    return create_client(url, key)


@st.cache_data(ttl=300)
def carregar_pagamentos():
    sb = get_supabase()
    r = sb.table("pagamentos").select("*, turmas(nome)").execute()
    return pd.DataFrame(r.data) if r.data else pd.DataFrame()


@st.cache_data(ttl=300)
def carregar_contas_pagar():
    sb = get_supabase()
    r = sb.table("contas_pagar").select("*, turmas(nome)").execute()
    return pd.DataFrame(r.data) if r.data else pd.DataFrame()


def brl(v):
    return f"R$ {float(v or 0):,.2f}".replace(",", "§").replace(".", ",").replace("§", ".")


# ──────────────────────────────────────────────────────────────
# Classificação inteligente: cada lançamento de despesa é varrido
# (categoria + descrição + fornecedor) e enquadrado automaticamente
# em um grupo contábil do DRE — uma forma leve de "IA por regras
# semânticas" que dispensa configuração manual e se adapta sozinha
# conforme novas categorias chegam do SGE.
# ──────────────────────────────────────────────────────────────
REGRAS_DRE = [
    ("Impostos e Taxas sobre Vendas", [
        "imposto", "tribut", "iss", "icms", "simples nacional",
        "das ", "darf", "nota fiscal", "pis", "cofins"
    ]),
    ("Custos Diretos (Produção/Serviços)", [
        "fotograf", "filmagem", "video", "vídeo", "produc", "produç",
        "material", "insumo", "equipamento", "aluguel de equip",
        "fornecedor", "freelancer", "diagram", "impress", "album", "álbum",
        "edicao", "edição", "estudio", "estúdio", "formatura", "festa",
        "convite", "brinde", "cenografia", "som e luz", "buffet", "grafica", "gráfica"
    ]),
    ("Despesas Comerciais e Marketing", [
        "marketing", "publicidade", "anuncio", "anúncio", "comissao",
        "comissão", "vendedor", "trafego", "tráfego", "ads", "divulga",
        "social media", "agencia de", "agência de"
    ]),
    ("Despesas com Pessoal e Administrativas", [
        "salario", "salário", "folha", "pro-labore", "pró-labore",
        "administrat", "escritorio", "escritório", "aluguel", "agua",
        "água", "energia eletrica", "energia elétrica", "luz", "internet",
        "telefone", "celular", "contabil", "contábil", "contador",
        "software", "assinatura", "sistema", "limpeza", "papelaria"
    ]),
    ("Despesas Financeiras", [
        "juros", "tarifa banc", "tarifa bancaria", "tarifa bancária", "banco",
        "cartao", "cartão", "emprestimo", "empréstimo", "financiamento",
        "iof", "anuidade", "boleto"
    ]),
]

GRUPOS_ORDEM = [g for g, _ in REGRAS_DRE] + ["Outras Despesas Operacionais"]


def _normalizar(txt) -> str:
    if not txt:
        return ""
    txt = str(txt).lower()
    txt = unicodedata.normalize("NFKD", txt).encode("ascii", "ignore").decode("ascii")
    return txt


def classificar_lancamento(categoria, descricao, fornecedor) -> str:
    """Classifica um lançamento de contas a pagar em um grupo de DRE,
    procurando palavras-chave na categoria, descrição e fornecedor."""
    base = _normalizar(f"{categoria or ''} {descricao or ''} {fornecedor or ''}")
    for grupo, palavras in REGRAS_DRE:
        for p in palavras:
            if _normalizar(p) in base:
                return grupo
    return "Outras Despesas Operacionais"


def classificar_linha(row) -> str:
    """Usa a classificação feita pela IA (Gemini, salva em `grupo_dre` na
    sincronização) quando existe; só cai nas palavras-chave como reserva
    para lançamentos que a IA ainda não processou."""
    grupo_ia = row.get("grupo_dre")
    if isinstance(grupo_ia, str) and grupo_ia in GRUPOS_ORDEM:
        return grupo_ia
    return classificar_lancamento(row.get("categoria"), row.get("descricao"), row.get("fornecedor"))


# ──────────────────────────────────────────────────────────────
# Carrega e prepara os dados
# ──────────────────────────────────────────────────────────────
df_receitas = carregar_pagamentos()
df_despesas = carregar_contas_pagar()

# Lançamentos cancelados/estornados não entram no DRE (nem receita, nem despesa)
if not df_receitas.empty and "status" in df_receitas.columns:
    df_receitas = df_receitas[df_receitas["status"] != "cancelado"]
if not df_despesas.empty and "status" in df_despesas.columns:
    df_despesas = df_despesas[df_despesas["status"] != "cancelado"]

if df_receitas.empty and df_despesas.empty:
    st.info("🔄 Aguardando sincronização de dados financeiros para montar o DRE.")
    st.stop()

for _df in (df_receitas, df_despesas):
    if not _df.empty and "turmas" in _df.columns:
        _df["turma_nome"] = _df["turmas"].apply(lambda t: (t or {}).get("nome") if isinstance(t, dict) else None)

with st.expander("ℹ️ Como este DRE é montado automaticamente"):
    st.markdown(
        "Este demonstrativo é gerado a partir dos lançamentos sincronizados do SGE "
        "(contas a receber e contas a pagar). Cada lançamento de despesa é classificado por "
        "**IA (Gemini)** uma única vez, quando chega do SGE — ela analisa a categoria, a "
        "descrição e o fornecedor e decide em qual grupo contábil do DRE ele se encaixa "
        "(custos diretos, despesas comerciais, administrativas, financeiras, impostos, etc.), "
        "e o resultado fica salvo permanentemente no lançamento. Enquanto a IA não processa um "
        "lançamento novo, ele usa temporariamente um classificador por palavras-chave como "
        "reserva.\n\n"
        "Você pode revisar como cada lançamento foi classificado na seção "
        "**'Ver lançamentos e como cada um foi classificado'** mais abaixo."
    )

# ── Filtro de período ──────────────────────────────────────────
st.subheader("📅 Período de Apuração")
hoje = date.today()

datas_disp = []
if not df_receitas.empty and "data_vencimento" in df_receitas.columns:
    datas_disp += pd.to_datetime(df_receitas["data_vencimento"], errors="coerce").dropna().tolist()
if not df_despesas.empty and "data_vencimento" in df_despesas.columns:
    datas_disp += pd.to_datetime(df_despesas["data_vencimento"], errors="coerce").dropna().tolist()

if datas_disp:
    data_min = min(datas_disp).date()
    data_max = max(datas_disp).date()
else:
    data_min, data_max = hoje.replace(month=1, day=1), hoje

if data_min > data_max:
    data_min = data_max

col_p1, col_p2 = st.columns(2)
with col_p1:
    dt_ini = st.date_input("De", value=data_min, min_value=data_min, max_value=data_max)
with col_p2:
    dt_fim = st.date_input("Até", value=data_max, min_value=data_min, max_value=data_max)


def _filtra_periodo(df, col="data_vencimento"):
    if df.empty or col not in df.columns:
        return df
    d = pd.to_datetime(df[col], errors="coerce")
    return df[(d.dt.date >= dt_ini) & (d.dt.date <= dt_fim)]


df_rec_periodo = _filtra_periodo(df_receitas)
df_desp_periodo = _filtra_periodo(df_despesas)

st.divider()

# ──────────────────────────────────────────────────────────────
# Monta a estrutura do DRE
# ──────────────────────────────────────────────────────────────
receita_bruta = float(df_rec_periodo["valor"].sum()) if "valor" in df_rec_periodo.columns else 0.0

totais_grupo = {}
if not df_desp_periodo.empty:
    df_desp_periodo = df_desp_periodo.copy()
    df_desp_periodo["grupo_dre"] = df_desp_periodo.apply(classificar_linha, axis=1)
    totais_grupo = df_desp_periodo.groupby("grupo_dre")["valor"].sum().to_dict()

impostos_vendas  = float(totais_grupo.get("Impostos e Taxas sobre Vendas", 0))
custos_diretos   = float(totais_grupo.get("Custos Diretos (Produção/Serviços)", 0))
desp_comerciais  = float(totais_grupo.get("Despesas Comerciais e Marketing", 0))
desp_admin       = float(totais_grupo.get("Despesas com Pessoal e Administrativas", 0))
desp_financeiras = float(totais_grupo.get("Despesas Financeiras", 0))
outras_despesas  = float(totais_grupo.get("Outras Despesas Operacionais", 0))

receita_liquida   = receita_bruta - impostos_vendas
lucro_bruto       = receita_liquida - custos_diretos
despesas_operac   = desp_comerciais + desp_admin + desp_financeiras + outras_despesas
resultado_operac  = lucro_bruto - despesas_operac
resultado_liquido = resultado_operac  # IR/CSLL não identificável automaticamente nos lançamentos


# ──────────────────────────────────────────────────────────────
# Exibição do DRE
# ──────────────────────────────────────────────────────────────
st.subheader("🧾 Demonstrativo de Resultado do Exercício")

linhas = [
    ("Receita Operacional Bruta",                   receita_bruta,      0, False),
    ("(–) Impostos e Taxas sobre Vendas",          -impostos_vendas,    1, False),
    ("(=) Receita Operacional Líquida",             receita_liquida,    0, True),
    ("(–) Custos Diretos (Produção/Serviços)",     -custos_diretos,     1, False),
    ("(=) Lucro Bruto",                             lucro_bruto,        0, True),
    ("(–) Despesas Comerciais e Marketing",        -desp_comerciais,    1, False),
    ("(–) Despesas com Pessoal e Administrativas", -desp_admin,         1, False),
    ("(–) Despesas Financeiras",                   -desp_financeiras,   1, False),
    ("(–) Outras Despesas Operacionais",           -outras_despesas,    1, False),
    ("(=) Resultado Operacional",                   resultado_operac,   0, True),
    ("(=) Resultado Líquido do Período",            resultado_liquido,  0, True),
]

for rotulo, valor, nivel, destaque in linhas:
    cor = "#34D399" if valor >= 0 else "#F87171"
    indent = "&nbsp;" * (nivel * 6)
    peso = "700" if destaque else "400"
    tam = "1.05rem" if destaque else "0.95rem"
    fundo = "rgba(129,140,248,0.12)" if destaque else "transparent"
    st.markdown(
        f"""
        <div style="display:flex; justify-content:space-between; align-items:center;
                    padding:8px 14px; margin-bottom:2px; border-radius:8px; background:{fundo};">
            <span style="font-size:{tam}; font-weight:{peso}; color:#E5E7EB;">{indent}{rotulo}</span>
            <span style="font-size:{tam}; font-weight:{peso}; color:{cor};">{brl(valor)}</span>
        </div>
        """,
        unsafe_allow_html=True
    )

st.divider()

# ── Margens ────────────────────────────────────────────────────
col_m1, col_m2, col_m3 = st.columns(3)
margem_bruta   = (lucro_bruto / receita_bruta * 100) if receita_bruta else 0
margem_operac  = (resultado_operac / receita_bruta * 100) if receita_bruta else 0
margem_liquida = (resultado_liquido / receita_bruta * 100) if receita_bruta else 0
col_m1.metric("📐 Margem Bruta", f"{margem_bruta:.1f}%")
col_m2.metric("📐 Margem Operacional", f"{margem_operac:.1f}%")
col_m3.metric("📐 Margem Líquida", f"{margem_liquida:.1f}%")

st.divider()

# ── Composição das despesas ────────────────────────────────────
st.subheader("📊 Composição das Despesas no Período")
df_grupos = pd.DataFrame(
    [(g, totais_grupo.get(g, 0)) for g in GRUPOS_ORDEM if totais_grupo.get(g, 0) > 0],
    columns=["Grupo", "Valor"]
)

if not df_grupos.empty:
    col_g1, col_g2 = st.columns([2, 3])
    with col_g1:
        fig_pizza = px.pie(
            df_grupos, names="Grupo", values="Valor", hole=0.45,
            color_discrete_sequence=px.colors.qualitative.Set2
        )
        fig_pizza.update_layout(
            height=320, paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
            font_color="#E5E7EB", margin=dict(l=10, r=10, t=10, b=10),
            legend=dict(orientation="h", yanchor="bottom", y=-0.3)
        )
        st.plotly_chart(fig_pizza, use_container_width=True)
    with col_g2:
        df_grupos_show = df_grupos.copy()
        df_grupos_show["Valor"] = df_grupos_show["Valor"].apply(brl)
        st.dataframe(df_grupos_show, use_container_width=True, hide_index=True, height=320)
else:
    st.info("Sem despesas classificadas no período selecionado.")

with st.expander("🔍 Ver lançamentos e como cada um foi classificado"):
    if not df_desp_periodo.empty:
        cols_show = [c for c in ["data_vencimento", "fornecedor", "categoria", "descricao", "valor", "grupo_dre"] if c in df_desp_periodo.columns]
        df_class = df_desp_periodo[cols_show].copy()
        if "data_vencimento" in df_class.columns:
            df_class = df_class.sort_values("data_vencimento")
            df_class["data_vencimento"] = pd.to_datetime(df_class["data_vencimento"], errors="coerce").dt.strftime("%d/%m/%Y")
        df_class["valor"] = df_class["valor"].apply(brl)
        df_class = df_class.rename(columns={
            "data_vencimento": "Vencimento", "fornecedor": "Fornecedor",
            "categoria": "Categoria (original)", "descricao": "Descrição",
            "valor": "Valor", "grupo_dre": "Classificado como (DRE)"
        })
        st.dataframe(df_class, use_container_width=True, hide_index=True)
        st.caption(
            "💡 A classificação é automática, baseada em palavras-chave da categoria, "
            "descrição e fornecedor. Se algum item aparecer no grupo errado, ajuste o nome "
            "da categoria/descrição no SGE para refinar as próximas sincronizações."
        )
    else:
        st.info("Sem lançamentos de contas a pagar no período selecionado.")

st.divider()

# ──────────────────────────────────────────────────────────────
# Custo por Turma
# ──────────────────────────────────────────────────────────────
st.subheader("🎓 Custo por Turma")

df_receita_turma = pd.DataFrame(columns=["Turma", "Receita Total"])
if not df_rec_periodo.empty and "turma_id" in df_rec_periodo.columns and "turma_nome" in df_rec_periodo.columns:
    df_receita_turma = (
        df_rec_periodo[df_rec_periodo["turma_id"].notna()]
        .groupby("turma_nome")["valor"].sum()
        .reset_index()
        .rename(columns={"turma_nome": "Turma", "valor": "Receita Total"})
    )

df_custo_direto = pd.DataFrame(columns=["Turma", "Custo Direto"])
if not df_desp_periodo.empty and "turma_id" in df_desp_periodo.columns and "turma_nome" in df_desp_periodo.columns:
    df_custo_direto = (
        df_desp_periodo[df_desp_periodo["turma_id"].notna()]
        .groupby("turma_nome")["valor"].sum()
        .reset_index()
        .rename(columns={"turma_nome": "Turma", "valor": "Custo Direto"})
    )

usa_custo_direto = not df_custo_direto.empty and df_custo_direto["Custo Direto"].sum() > 0

if usa_custo_direto:
    st.caption("Custos com a turma identificada diretamente nos lançamentos sincronizados do SGE.")
    df_turma_final = pd.merge(df_receita_turma, df_custo_direto, on="Turma", how="outer").fillna(0)
    col_custo = "Custo Direto"
else:
    st.info(
        "📌 Os lançamentos de contas a pagar recebidos do SGE ainda não trazem a turma associada "
        "a cada despesa — por isso não dá para apurar o custo direto de cada turma. Para te dar "
        "uma visão útil mesmo assim, **estimamos o custo de cada turma por rateio proporcional**: "
        "o total de despesas do período é distribuído entre as turmas de acordo com a participação "
        "de cada uma na receita total. Assim que o SGE passar a vincular a turma em cada conta a "
        "pagar, esta seção passa a mostrar o custo direto, automaticamente."
    )
    total_despesas_periodo = impostos_vendas + custos_diretos + despesas_operac
    df_turma_final = df_receita_turma.copy()
    if receita_bruta > 0 and not df_turma_final.empty:
        df_turma_final["Custo Estimado (rateio)"] = (
            df_turma_final["Receita Total"] / receita_bruta * total_despesas_periodo
        )
    elif not df_turma_final.empty:
        df_turma_final["Custo Estimado (rateio)"] = 0.0
    col_custo = "Custo Estimado (rateio)"

if not df_turma_final.empty and "Receita Total" in df_turma_final.columns and col_custo in df_turma_final.columns:
    df_turma_final["Resultado"] = df_turma_final["Receita Total"] - df_turma_final[col_custo]
    df_turma_final["Margem %"] = df_turma_final.apply(
        lambda r: (r["Resultado"] / r["Receita Total"] * 100) if r["Receita Total"] else 0, axis=1
    )
    df_turma_final = df_turma_final.sort_values(col_custo, ascending=False)

    col_t1, col_t2 = st.columns([3, 2])
    with col_t1:
        top = df_turma_final.head(12)
        fig_turma = go.Figure()
        fig_turma.add_trace(go.Bar(x=top["Turma"], y=top["Receita Total"], name="Receita", marker_color="#818CF8"))
        fig_turma.add_trace(go.Bar(x=top["Turma"], y=top[col_custo], name="Custo", marker_color="#F87171"))
        fig_turma.update_layout(
            barmode="group", height=380,
            paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
            font_color="#E5E7EB", yaxis_title="R$",
            legend=dict(orientation="h", yanchor="bottom", y=1.02),
            margin=dict(l=10, r=10, t=30, b=80)
        )
        fig_turma.update_xaxes(tickangle=-40)
        st.plotly_chart(fig_turma, use_container_width=True)
    with col_t2:
        df_show_turma = df_turma_final.copy()
        for c in ["Receita Total", col_custo, "Resultado"]:
            df_show_turma[c] = df_show_turma[c].apply(brl)
        df_show_turma["Margem %"] = df_show_turma["Margem %"].apply(lambda x: f"{x:.1f}%")
        df_show_turma = df_show_turma.rename(columns={col_custo: "Custo"})
        st.dataframe(df_show_turma, use_container_width=True, hide_index=True, height=380)
else:
    st.info("Sem dados de receita por turma suficientes para montar essa análise no período selecionado.")

st.caption(
    "ℹ️ O DRE acima considera 100% dos lançamentos do período, independentemente de estarem "
    "vinculados a uma turma. Já a seção de custo por turma depende de essa vinculação existir "
    "(diretamente) ou é estimada por rateio proporcional à receita (quando não existe)."
)
