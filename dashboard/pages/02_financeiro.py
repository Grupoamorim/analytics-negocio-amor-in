"""
Página: Financeiro
Contas a pagar, a receber, fluxo de caixa e inadimplência detalhada.
"""

import streamlit as st
import pandas as pd
import plotly.express as px
import os
from supabase import create_client
from datetime import date

st.set_page_config(page_title="Financeiro", page_icon="💰", layout="wide")
st.title("💰 Painel Financeiro")

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

def brl(v): return f"R$ {float(v or 0):,.0f}".replace(",", ".")

df_pgto = carregar_pagamentos()
df_pagar = carregar_contas_pagar()

# KPIs
c1, c2, c3, c4 = st.columns(4)
if not df_pgto.empty and "status" in df_pgto.columns:
    recebido = df_pgto[df_pgto["status"] == "pago"]["valor_pago"].sum()
    a_receber = df_pgto[df_pgto["status"] == "pendente"]["valor"].sum()
    atrasado = df_pgto[df_pgto["status"] == "atrasado"]["valor"].sum()
else:
    recebido = a_receber = atrasado = 0

if not df_pagar.empty and "status" in df_pagar.columns:
    a_pagar = df_pagar[df_pagar["status"] == "pendente"]["valor"].sum()
else:
    a_pagar = 0

c1.metric("✅ Recebido", brl(recebido))
c2.metric("📋 A Receber", brl(a_receber))
c3.metric("⚠️ Em Atraso", brl(atrasado))
c4.metric("📑 A Pagar", brl(a_pagar))

st.divider()

# Tabs
tab1, tab2, tab3 = st.tabs(["📥 Contas a Receber", "📤 Contas a Pagar", "📊 Fluxo de Caixa"])

with tab1:
    st.subheader("Contas a Receber")
    if not df_pgto.empty:
        status_op = st.multiselect("Filtrar status", ["pendente", "pago", "atrasado"], default=["pendente", "atrasado"])
        df_f = df_pgto[df_pgto["status"].isin(status_op)] if status_op else df_pgto
        if "data_vencimento" in df_f.columns:
            df_f = df_f.sort_values("data_vencimento")
        st.dataframe(df_f.head(50), use_container_width=True, hide_index=True)
    else:
        st.info("Sem dados de recebimentos.")

with tab2:
    st.subheader("Contas a Pagar")
    if not df_pagar.empty:
        cat_op = ["Todas"] + (df_pagar["categoria"].dropna().unique().tolist() if "categoria" in df_pagar.columns else [])
        cat_sel = st.selectbox("Categoria", cat_op)
        df_f = df_pagar if cat_sel == "Todas" else df_pagar[df_pagar["categoria"] == cat_sel]
        st.dataframe(df_f.head(50), use_container_width=True, hide_index=True)

        # Gráfico por categoria
        if "categoria" in df_pagar.columns and "valor" in df_pagar.columns:
            df_cat = df_pagar.groupby("categoria")["valor"].sum().reset_index()
            fig = px.pie(df_cat, names="categoria", values="valor",
                        title="Custos por Categoria", hole=0.4,
                        color_discrete_sequence=px.colors.qualitative.Set3)
            fig.update_layout(height=300)
            st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("Sem dados de contas a pagar.")

with tab3:
    st.subheader("Fluxo de Caixa")
    if not df_pgto.empty and "data_vencimento" in df_pgto.columns:
        df_pgto["mes"] = pd.to_datetime(df_pgto["data_vencimento"], errors="coerce").dt.to_period("M").astype(str)
        df_rec = df_pgto[df_pgto["status"] == "pago"].groupby("mes")["valor_pago"].sum()
        df_prev = df_pgto[df_pgto["status"] != "cancelado"].groupby("mes")["valor"].sum()

        df_fluxo = pd.DataFrame({"Recebido": df_rec, "Previsto": df_prev}).fillna(0).tail(12)
        fig = px.line(df_fluxo, labels={"value": "R$", "variable": ""},
                     title="Recebido vs Previsto (últimos 12 meses)",
                     color_discrete_map={"Recebido": "#10B981", "Previsto": "#6366F1"})
        fig.update_layout(height=350, plot_bgcolor="white")
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("Sem dados de fluxo de caixa ainda.")
