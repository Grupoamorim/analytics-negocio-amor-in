"""
Página: Projeções com IA
Usa Prophet (Meta) para prever faturamento futuro com base nos dados históricos.
"""

import streamlit as st
import pandas as pd
import plotly.graph_objects as go
from datetime import date
import os
from supabase import create_client

st.set_page_config(page_title="Projeções IA", page_icon="🔮", layout="wide")
st.title("🔮 Projeções com Inteligência Artificial")
st.caption("Previsão baseada nos seus dados históricos reais")

@st.cache_resource
def get_supabase():
    url = os.getenv("SUPABASE_URL") or st.secrets.get("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_ANON_KEY") or st.secrets.get("SUPABASE_ANON_KEY", "")
    return create_client(url, key)

@st.cache_data(ttl=300)
def carregar_historico():
    sb = get_supabase()
    result = sb.table("vw_faturamento_mensal").select("*").order("mes").execute()
    return pd.DataFrame(result.data) if result.data else pd.DataFrame()

df = carregar_historico()

if df.empty or len(df) < 3:
    st.warning("⏳ São necessários pelo menos 3 meses de dados para gerar projeções. Continue usando o sistema e as projeções aparecerão automaticamente.")
    st.info("💡 Enquanto isso, o sistema já está coletando e armazenando seus dados históricos a cada hora.")
    st.stop()

try:
    from prophet import Prophet
    PROPHET_OK = True
except ImportError:
    PROPHET_OK = False

# Prepara dados
df["mes"] = pd.to_datetime(df["mes"])
df_agg = df.groupby("mes")["faturamento_bruto"].sum().reset_index()
df_agg.columns = ["ds", "y"]

meses_projetar = st.slider("Quantos meses projetar?", min_value=1, max_value=12, value=3)

if PROPHET_OK:
    # Treina modelo Prophet
    with st.spinner("🤖 Calculando projeções..."):
        modelo = Prophet(
            yearly_seasonality=True,
            weekly_seasonality=False,
            daily_seasonality=False,
            changepoint_prior_scale=0.05
        )
        modelo.fit(df_agg)
        futuro = modelo.make_future_dataframe(periods=meses_projetar, freq="MS")
        previsao = modelo.predict(futuro)

    # Gráfico
    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=df_agg["ds"], y=df_agg["y"],
        mode="lines+markers", name="Faturamento Real",
        line=dict(color="#6366F1", width=3),
        marker=dict(size=8)
    ))
    prev_futuro = previsao[previsao["ds"] > df_agg["ds"].max()]
    fig.add_trace(go.Scatter(
        x=prev_futuro["ds"], y=prev_futuro["yhat"],
        mode="lines+markers", name="Projeção IA",
        line=dict(color="#10B981", width=2, dash="dash"),
        marker=dict(size=8, symbol="diamond")
    ))
    fig.add_trace(go.Scatter(
        x=pd.concat([prev_futuro["ds"], prev_futuro["ds"].iloc[::-1]]),
        y=pd.concat([prev_futuro["yhat_upper"], prev_futuro["yhat_lower"].iloc[::-1]]),
        fill="toself", fillcolor="rgba(16,185,129,0.1)",
        line=dict(color="rgba(255,255,255,0)"),
        name="Intervalo de Confiança"
    ))
    fig.update_layout(
        title="Projeção de Faturamento",
        xaxis_title="Mês", yaxis_title="R$",
        height=400, plot_bgcolor="white",
        legend=dict(orientation="h", yanchor="bottom", y=1.02)
    )
    st.plotly_chart(fig, use_container_width=True)

    # Tabela de projeção
    st.subheader("📋 Valores Projetados")
    df_proj = prev_futuro[["ds", "yhat", "yhat_lower", "yhat_upper"]].copy()
    df_proj.columns = ["Mês", "Projeção", "Mínimo Estimado", "Máximo Estimado"]
    df_proj["Mês"] = df_proj["Mês"].dt.strftime("%B/%Y")
    for col in ["Projeção", "Mínimo Estimado", "Máximo Estimado"]:
        df_proj[col] = df_proj[col].apply(lambda x: f"R$ {max(x,0):,.0f}".replace(",", "."))
    st.dataframe(df_proj, use_container_width=True, hide_index=True)

else:
    # Fallback: regressão linear simples
    st.info("📊 Usando projeção por tendência linear (instale prophet para projeções mais precisas)")
    import numpy as np
    x = np.arange(len(df_agg))
    y = df_agg["y"].values
    z = np.polyfit(x, y, 1)
    p = np.poly1d(z)
    x_fut = np.arange(len(df_agg), len(df_agg) + meses_projetar)
    y_fut = p(x_fut)
    last_date = df_agg["ds"].max()
    datas_fut = pd.date_range(start=last_date + pd.DateOffset(months=1), periods=meses_projetar, freq="MS")

    fig = go.Figure()
    fig.add_trace(go.Bar(x=df_agg["ds"], y=df_agg["y"], name="Real", marker_color="#6366F1"))
    fig.add_trace(go.Bar(x=datas_fut, y=y_fut, name="Projeção", marker_color="#10B981", opacity=0.7))
    fig.update_layout(height=350, plot_bgcolor="white", barmode="overlay")
    st.plotly_chart(fig, use_container_width=True)
