"""
Página: Gestão de Turmas
Visualiza performance de cada turma: faturamento, meta, custos, inadimplência.
"""

import streamlit as st
import pandas as pd
import plotly.express as px
import os
from supabase import create_client

from ia_assistente import render_botao_flutuante

st.set_page_config(page_title="Turmas", page_icon="🎓", layout="wide")
render_botao_flutuante()
st.title("🎓 Gestão de Turmas")

@st.cache_resource
def get_supabase():
    url = os.getenv("SUPABASE_URL") or st.secrets.get("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_ANON_KEY") or st.secrets.get("SUPABASE_ANON_KEY", "")
    return create_client(url, key)

@st.cache_data(ttl=300)
def carregar_turmas():
    sb = get_supabase()
    result = sb.table("vw_resumo_turmas").select("*").execute()
    return pd.DataFrame(result.data) if result.data else pd.DataFrame()

def brl(v): return f"R$ {float(v or 0):,.0f}".replace(",", ".")

df = carregar_turmas()

if df.empty:
    st.info("🔄 Aguardando dados do SGE...")
    st.stop()

# Filtros
status_op = ["Todas"] + df["status"].unique().tolist()
status_sel = st.selectbox("Status", status_op)
if status_sel != "Todas":
    df = df[df["status"] == status_sel]

# Tabela resumo
st.subheader(f"📋 {len(df)} turmas encontradas")
df_show = df.copy()
for col in ["total_vendido", "total_recebido", "total_a_receber", "total_inadimplente", "total_custos", "meta_vendas"]:
    if col in df_show.columns:
        df_show[col] = df_show[col].apply(brl)

colunas = {
    "nome": "Turma", "curso": "Curso", "status": "Status",
    "total_alunos": "Alunos", "meta_vendas": "Meta",
    "total_vendido": "Faturado", "total_recebido": "Recebido",
    "total_custos": "Custos", "total_inadimplente": "Inadimpl.", "pct_meta": "% Meta"
}
cols_disp = [c for c in colunas if c in df_show.columns]
st.dataframe(df_show[cols_disp].rename(columns=colunas), use_container_width=True, hide_index=True)

# Gráfico comparativo
st.subheader("📊 Faturado vs Meta por Turma")
df_orig = carregar_turmas()
if "total_vendido" in df_orig.columns and "meta_vendas" in df_orig.columns:
    fig = px.bar(
        df_orig.head(10), x="nome",
        y=["total_vendido", "meta_vendas"],
        barmode="group",
        labels={"nome": "Turma", "value": "R$", "variable": ""},
        color_discrete_map={"total_vendido": "#818CF8", "meta_vendas": "#4B5563"}
    )
    fig.update_layout(
        height=350,
        plot_bgcolor="rgba(0,0,0,0)", paper_bgcolor="rgba(0,0,0,0)",
        font_color="#E5E7EB",
        legend=dict(orientation="h", yanchor="bottom", y=1.02)
    )
    st.plotly_chart(fig, use_container_width=True)
