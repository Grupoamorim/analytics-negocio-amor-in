"""
Página: CRM / Notion
Visualiza leads e oportunidades sincronizadas do Notion.
"""

import streamlit as st
import pandas as pd
import plotly.express as px
import os
from supabase import create_client

st.set_page_config(page_title="CRM", page_icon="👥", layout="wide")
st.title("👥 CRM — Leads & Oportunidades")
st.caption("Sincronizado automaticamente do seu Notion")

@st.cache_resource
def get_supabase():
    url = os.getenv("SUPABASE_URL") or st.secrets.get("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_ANON_KEY") or st.secrets.get("SUPABASE_ANON_KEY", "")
    return create_client(url, key)

@st.cache_data(ttl=300)
def carregar_crm():
    sb = get_supabase()
    r = sb.table("crm_notion").select("notion_id, nome, email, telefone, status, turma_interesse, valor_estimado, data_contato, responsavel").execute()
    return pd.DataFrame(r.data) if r.data else pd.DataFrame()

def brl(v): return f"R$ {float(v or 0):,.0f}".replace(",", ".")

df = carregar_crm()

if df.empty:
    st.info("🔄 Aguardando sincronização do Notion. Configure NOTION_TOKEN e NOTION_DB_CRM.")
    st.stop()

# KPIs
c1, c2, c3, c4 = st.columns(4)
c1.metric("👥 Total de Leads", len(df))
if "status" in df.columns:
    fechados = len(df[df["status"].str.lower().str.contains("fecha|ganho|won|fechado", na=False)])
    c2.metric("✅ Fechados", fechados)
    taxa = f"{fechados/len(df)*100:.0f}%" if len(df) > 0 else "0%"
    c3.metric("📈 Taxa Conversão", taxa)
if "valor_estimado" in df.columns:
    pipeline = df["valor_estimado"].sum()
    c4.metric("💰 Pipeline Total", brl(pipeline))

st.divider()

# Filtros
col_f1, col_f2 = st.columns(2)
with col_f1:
    if "status" in df.columns:
        status_ops = ["Todos"] + sorted(df["status"].dropna().unique().tolist())
        status_sel = st.selectbox("Status", status_ops)
        if status_sel != "Todos":
            df = df[df["status"] == status_sel]
with col_f2:
    busca = st.text_input("🔍 Buscar por nome ou email")
    if busca:
        mask = df["nome"].str.contains(busca, case=False, na=False)
        if "email" in df.columns:
            mask |= df["email"].str.contains(busca, case=False, na=False)
        df = df[mask]

# Tabela
st.subheader(f"📋 {len(df)} registros")
cols_show = [c for c in ["nome", "email", "telefone", "status", "turma_interesse", "valor_estimado", "responsavel", "data_contato"] if c in df.columns]
df_show = df[cols_show].copy()
if "valor_estimado" in df_show.columns:
    df_show["valor_estimado"] = df_show["valor_estimado"].apply(brl)
st.dataframe(df_show, use_container_width=True, hide_index=True)

# Gráfico de funil
if "status" in carregar_crm().columns:
    st.subheader("🔻 Funil de Vendas")
    df_funil = carregar_crm()["status"].value_counts().reset_index()
    df_funil.columns = ["Status", "Quantidade"]
    fig = px.funnel(df_funil, x="Quantidade", y="Status",
                   color_discrete_sequence=["#6366F1"])
    fig.update_layout(height=300)
    st.plotly_chart(fig, use_container_width=True)
