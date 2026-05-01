"""
Dashboard Analytics do Negócio
================================
Dashboard principal com login, KPIs e visão geral.
Acesse em: https://seu-app.streamlit.app
"""

import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, date, timedelta
import os

from supabase import create_client, Client
import streamlit_authenticator as stauth
import yaml
from yaml.loader import SafeLoader

# ── Configuração da página ──────────────────────────────────
st.set_page_config(
    page_title="Analytics do Negócio",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded"
)

# ── CSS customizado ─────────────────────────────────────────
st.markdown("""
<style>
    .metric-card {
        background: white;
        padding: 20px;
        border-radius: 12px;
        border-left: 4px solid #6366F1;
        box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    .metric-value { font-size: 2rem; font-weight: 700; color: #1e1b4b; }
    .metric-label { font-size: 0.85rem; color: #6b7280; margin-top: 4px; }
    .metric-delta { font-size: 0.85rem; margin-top: 4px; }
    .delta-up { color: #10B981; }
    .delta-down { color: #EF4444; }
    [data-testid="metric-container"] {
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        padding: 16px;
        box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    }
</style>
""", unsafe_allow_html=True)


# ══════════════════════════════════════════════════════════════
# AUTENTICAÇÃO
# ══════════════════════════════════════════════════════════════
def carregar_config_auth():
    """Carrega configuração de usuários"""
    config_path = os.path.join(os.path.dirname(__file__), "auth_config.yaml")

    if not os.path.exists(config_path):
        # Configuração padrão (altere a senha depois!)
        config = {
            "credentials": {
                "usernames": {
                    "admin": {
                        "email": "adm@lucasamorim.com.br",
                        "name": "Administrador",
                        "password": stauth.Hasher(["admin123"]).generate()[0]
                    }
                }
            },
            "cookie": {
                "expiry_days": 30,
                "key": "analytics_negocio_v1",
                "name": "analytics_auth"
            },
            "preauthorized": {"emails": []}
        }
        with open(config_path, "w") as f:
            yaml.dump(config, f)

    with open(config_path) as f:
        return yaml.load(f, Loader=SafeLoader)


# ══════════════════════════════════════════════════════════════
# CONEXÃO SUPABASE
# ══════════════════════════════════════════════════════════════
@st.cache_resource
def get_supabase() -> Client:
    url = os.getenv("SUPABASE_URL") or st.secrets.get("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_ANON_KEY") or st.secrets.get("SUPABASE_ANON_KEY", "")
    if not url or not key:
        st.error("⚠️ Configure SUPABASE_URL e SUPABASE_ANON_KEY nas variáveis do Streamlit Cloud.")
        st.stop()
    return create_client(url, key)


# ══════════════════════════════════════════════════════════════
# CONSULTAS DE DADOS
# ══════════════════════════════════════════════════════════════
@st.cache_data(ttl=300)  # Cache de 5 minutos
def carregar_resumo_turmas() -> pd.DataFrame:
    sb = get_supabase()
    result = sb.table("vw_resumo_turmas").select("*").execute()
    return pd.DataFrame(result.data) if result.data else pd.DataFrame()


@st.cache_data(ttl=300)
def carregar_faturamento_mensal() -> pd.DataFrame:
    sb = get_supabase()
    result = sb.table("vw_faturamento_mensal").select("*").order("mes").execute()
    return pd.DataFrame(result.data) if result.data else pd.DataFrame()


@st.cache_data(ttl=300)
def carregar_inadimplencia() -> pd.DataFrame:
    sb = get_supabase()
    result = sb.table("vw_inadimplencia").select("*").order("dias_atraso", desc=True).execute()
    return pd.DataFrame(result.data) if result.data else pd.DataFrame()


@st.cache_data(ttl=300)
def carregar_sync_log() -> pd.DataFrame:
    sb = get_supabase()
    result = sb.table("sync_log").select("*").order("created_at", desc=True).limit(10).execute()
    return pd.DataFrame(result.data) if result.data else pd.DataFrame()


@st.cache_data(ttl=300)
def carregar_metas_mes_atual() -> dict:
    sb = get_supabase()
    hoje = date.today()
    result = sb.table("metas").select("*").eq("ano", hoje.year).eq("mes", hoje.month).execute()
    metas = {}
    if result.data:
        for m in result.data:
            metas[m["tipo"]] = m["valor_meta"]
    return metas


# ══════════════════════════════════════════════════════════════
# COMPONENTES VISUAIS
# ══════════════════════════════════════════════════════════════
def card_kpi(label: str, valor: str, delta: str = "", cor: str = "#6366F1"):
    """Card de KPI com delta"""
    delta_html = ""
    if delta:
        sinal = "↑" if "+" in delta else "↓"
        classe = "delta-up" if "+" in delta else "delta-down"
        delta_html = f'<div class="metric-delta {classe}">{sinal} {delta}</div>'

    st.markdown(f"""
    <div class="metric-card" style="border-left-color: {cor}">
        <div class="metric-value" style="color: {cor}">{valor}</div>
        <div class="metric-label">{label}</div>
        {delta_html}
    </div>
    """, unsafe_allow_html=True)


def formatar_brl(valor: float) -> str:
    """Formata valor em Real brasileiro"""
    return f"R$ {valor:,.0f}".replace(",", ".")


def gauge_meta(atual: float, meta: float, titulo: str):
    """Gráfico de velocímetro para meta"""
    pct = min((atual / meta * 100) if meta > 0 else 0, 100)
    cor = "#10B981" if pct >= 80 else "#F59E0B" if pct >= 50 else "#EF4444"

    fig = go.Figure(go.Indicator(
        mode="gauge+number+delta",
        value=pct,
        delta={"reference": 100, "suffix": "%"},
        title={"text": titulo, "font": {"size": 14}},
        number={"suffix": "%", "font": {"size": 24}},
        gauge={
            "axis": {"range": [0, 100]},
            "bar": {"color": cor},
            "steps": [
                {"range": [0, 50], "color": "#FEE2E2"},
                {"range": [50, 80], "color": "#FEF3C7"},
                {"range": [80, 100], "color": "#D1FAE5"},
            ],
            "threshold": {
                "line": {"color": "darkgreen", "width": 3},
                "thickness": 0.75,
                "value": 100
            }
        }
    ))
    fig.update_layout(height=200, margin=dict(l=10, r=10, t=30, b=10))
    return fig


# ══════════════════════════════════════════════════════════════
# PÁGINA PRINCIPAL
# ══════════════════════════════════════════════════════════════
def pagina_overview():
    st.title("📊 Visão Geral do Negócio")
    st.caption(f"Atualizado em: {datetime.now().strftime('%d/%m/%Y %H:%M')}")

    df_turmas = carregar_resumo_turmas()
    df_fat    = carregar_faturamento_mensal()
    df_inadi  = carregar_inadimplencia()
    metas     = carregar_metas_mes_atual()

    if df_turmas.empty:
        st.info("🔄 Aguardando primeira sincronização de dados. Execute o coletor SGE para começar.")
        _exibir_status_sync()
        return

    # ── KPIs principais ────────────────────────────────────
    st.subheader("💰 Indicadores Principais")

    total_faturado   = df_turmas["total_vendido"].sum() if "total_vendido" in df_turmas else 0
    total_recebido   = df_turmas["total_recebido"].sum() if "total_recebido" in df_turmas else 0
    total_a_receber  = df_turmas["total_a_receber"].sum() if "total_a_receber" in df_turmas else 0
    total_inadiml    = df_turmas["total_inadimplente"].sum() if "total_inadimplente" in df_turmas else 0
    total_custos     = df_turmas["total_custos"].sum() if "total_custos" in df_turmas else 0
    pct_inadimlencia = (total_inadiml / total_faturado * 100) if total_faturado > 0 else 0

    c1, c2, c3, c4 = st.columns(4)
    with c1:
        st.metric("💰 Total Faturado", formatar_brl(total_faturado),
                  delta=f"Meta: {formatar_brl(metas.get('vendas', 0))}" if metas.get('vendas') else None)
    with c2:
        st.metric("✅ Total Recebido", formatar_brl(total_recebido))
    with c3:
        st.metric("📋 A Receber", formatar_brl(total_a_receber))
    with c4:
        st.metric("⚠️ Inadimplência", formatar_brl(total_inadiml),
                  delta=f"{pct_inadimlencia:.1f}% do total",
                  delta_color="inverse")

    st.divider()

    # ── Gráfico de faturamento mensal ───────────────────────
    col_graf, col_turmas = st.columns([3, 2])

    with col_graf:
        st.subheader("📈 Faturamento Mensal")
        if not df_fat.empty and "mes" in df_fat.columns:
            df_fat["mes_fmt"] = pd.to_datetime(df_fat["mes"]).dt.strftime("%b/%Y")
            fig = px.bar(
                df_fat.groupby("mes_fmt")["faturamento_bruto"].sum().reset_index(),
                x="mes_fmt", y="faturamento_bruto",
                labels={"mes_fmt": "Mês", "faturamento_bruto": "Faturamento (R$)"},
                color_discrete_sequence=["#6366F1"]
            )
            fig.update_layout(
                height=300, margin=dict(l=0, r=0, t=10, b=0),
                plot_bgcolor="white", yaxis_title="R$"
            )
            fig.update_traces(texttemplate='R$ %{y:,.0f}', textposition='outside')
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("Sem dados de faturamento ainda.")

    with col_turmas:
        st.subheader("🎓 Turmas Ativas")
        if not df_turmas.empty:
            df_ativas = df_turmas[df_turmas["status"] == "ativa"].head(8)
            for _, row in df_ativas.iterrows():
                pct = row.get("pct_meta", 0) or 0
                cor = "🟢" if pct >= 80 else "🟡" if pct >= 50 else "🔴"
                st.markdown(f"{cor} **{row['nome']}** — {formatar_brl(row.get('total_vendido', 0))} ({pct:.0f}% da meta)")
        else:
            st.info("Sem turmas cadastradas.")

    st.divider()

    # ── Inadimplência ───────────────────────────────────────
    st.subheader(f"⚠️ Inadimplência — {len(df_inadi)} ocorrências")
    if not df_inadi.empty:
        df_show = df_inadi.head(20).copy()
        if "valor" in df_show.columns:
            df_show["valor"] = df_show["valor"].apply(lambda x: formatar_brl(float(x or 0)))
        if "data_vencimento" in df_show.columns:
            df_show["data_vencimento"] = pd.to_datetime(df_show["data_vencimento"]).dt.strftime("%d/%m/%Y")

        st.dataframe(
            df_show[["cliente", "turma", "data_vencimento", "valor", "dias_atraso"]].rename(columns={
                "cliente": "Cliente", "turma": "Turma",
                "data_vencimento": "Vencimento", "valor": "Valor",
                "dias_atraso": "Dias em Atraso"
            }),
            use_container_width=True,
            hide_index=True
        )
    else:
        st.success("✅ Sem inadimplência registrada!")

    # ── Status da última sincronização ─────────────────────
    st.divider()
    _exibir_status_sync()


def _exibir_status_sync():
    """Exibe quando os dados foram atualizados pela última vez"""
    df_log = carregar_sync_log()
    if not df_log.empty:
        with st.expander("🔄 Status da Sincronização de Dados"):
            for _, row in df_log.head(6).iterrows():
                icone = "✅" if row.get("status") == "sucesso" else "❌"
                fonte = str(row.get("fonte", "")).upper()
                msg   = row.get("mensagem", "")
                ts    = str(row.get("created_at", ""))[:16].replace("T", " ")
                st.caption(f"{icone} **{fonte}** — {ts} — {msg}")


# ══════════════════════════════════════════════════════════════
# MAIN - Login + Roteamento
# ══════════════════════════════════════════════════════════════
def main():
    # Login
    config = carregar_config_auth()
    authenticator = stauth.Authenticate(
        config["credentials"],
        config["cookie"]["name"],
        config["cookie"]["key"],
        config["cookie"]["expiry_days"],
    )

    name, authentication_status, username = authenticator.login("Login — Analytics do Negócio", "main")

    if authentication_status is False:
        st.error("Usuário ou senha incorretos")

    elif authentication_status is None:
        st.warning("Insira seu usuário e senha")

    elif authentication_status:
        # Sidebar
        with st.sidebar:
            st.markdown(f"### 👋 Olá, {name}!")
            st.divider()
            st.page_link("app.py", label="📊 Visão Geral", icon="🏠")
            st.page_link("pages/01_turmas.py", label="🎓 Turmas", icon="🎓")
            st.page_link("pages/02_financeiro.py", label="💰 Financeiro", icon="💰")
            st.page_link("pages/03_crm.py", label="👥 CRM / Notion", icon="👥")
            st.page_link("pages/04_projecoes.py", label="🔮 Projeções IA", icon="🔮")
            st.divider()
            authenticator.logout("Sair", "sidebar")

        pagina_overview()


if __name__ == "__main__":
    main()
