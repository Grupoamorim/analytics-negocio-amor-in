"""
Estilo visual compartilhado - injeta CSS em todas as páginas pra dar
uma aparência consistente e minimalista, com a mesma paleta e fonte do
site amor-in-formaturas-83bed.goskip.app (fundo escuro, laranja de
destaque, Montserrat). Chame aplicar_estilo() logo após
st.set_page_config em cada página.
"""

import streamlit as st

CSS = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap');

html, body, [class*="css"] {
    font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

h1, h2, h3 { font-weight: 800 !important; letter-spacing: -0.01em; }

/* ── Cards de métrica (KPIs) ─────────────────────────────── */
[data-testid="stMetric"] {
    background: #1A1D23;
    border: 1px solid #2C313A;
    border-radius: 12px;
    padding: 18px 20px 14px 20px;
    transition: border-color 0.15s ease;
}
[data-testid="stMetric"]:hover { border-color: #F97316; }
[data-testid="stMetricLabel"] p {
    font-size: 0.8rem !important;
    font-weight: 600 !important;
    color: #A7B1BE !important;
}
[data-testid="stMetricValue"] {
    font-size: 1.65rem !important;
    font-weight: 800 !important;
}

/* ── Botões ──────────────────────────────────────────────── */
.stButton > button {
    border-radius: 8px;
    font-weight: 700;
    border: 1px solid #2C313A;
    transition: all 0.15s ease;
}
.stButton > button[kind="primary"] {
    background: #F97316;
    color: #16181D;
    border: none;
}
.stButton > button[kind="primary"]:hover { background: #EA580C; }
.stButton > button[kind="secondary"]:hover {
    border-color: #F97316;
    color: #F97316;
}

/* ── Menu lateral ────────────────────────────────────────── */
[data-testid="stSidebar"] { border-right: 1px solid #2C313A; }
[data-testid="stSidebar"] a[data-testid="stPageLink-NavLink"] {
    border-radius: 8px;
    margin-bottom: 2px;
    padding: 8px 10px !important;
}
[data-testid="stSidebar"] a[data-testid="stPageLink-NavLink"]:hover {
    background: #1A1D23;
}
.nav-secao {
    font-size: 0.68rem;
    font-weight: 700;
    color: #6B7280;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin: 16px 4px 4px 4px;
}

/* ── Divider mais discreto ───────────────────────────────── */
hr { border-color: #2C313A !important; }

/* ── Inputs / selects ────────────────────────────────────── */
[data-baseweb="select"] > div, .stTextInput input, .stDateInput input {
    border-radius: 8px !important;
    background: #1A1D23 !important;
    border-color: #2C313A !important;
}

/* ── Abas ────────────────────────────────────────────────── */
[data-testid="stTabs"] button { border-radius: 6px 6px 0 0; }

/* ── Tabelas ─────────────────────────────────────────────── */
[data-testid="stDataFrame"] {
    border-radius: 10px;
    overflow: hidden;
    border: 1px solid #2C313A;
}

/* ── Badges/pills utilitários (usar via markdown) ───────────*/
.badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 700;
}
.badge-laranja { background: rgba(249,115,22,0.15); color: #FDBA74; }
.badge-green   { background: rgba(52,211,153,0.15); color: #34D399; }
.badge-yellow  { background: rgba(251,191,36,0.15); color: #FBBF24; }
.badge-red     { background: rgba(248,113,113,0.15); color: #F87171; }
</style>
"""


def _cabecalho_sidebar():
    st.markdown(
        """
        <div style="display:flex; align-items:center; gap:10px; padding: 4px 0 16px 0;
                    margin-bottom: 8px; border-bottom: 1px solid #2C313A;">
            <div style="width:34px; height:34px; border-radius:8px; flex-shrink:0;
                        background:linear-gradient(135deg,#F97316,#EA580C);
                        display:flex; align-items:center; justify-content:center;
                        font-size:17px;">📸</div>
            <div>
                <div style="font-weight:800; font-size:0.92rem; color:#F9FAFB; line-height:1.15;">Amor In Formaturas</div>
                <div style="font-size:0.72rem; color:#A7B1BE;">Analytics do Negócio</div>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def aplicar_estilo(cabecalho_sidebar: bool = True):
    """Injeta o CSS compartilhado e (opcionalmente) o cabeçalho de marca
    no topo do menu lateral. Chame no início de cada página."""
    st.markdown(CSS, unsafe_allow_html=True)
    if cabecalho_sidebar:
        with st.sidebar:
            _cabecalho_sidebar()


# Menu setorizado: cada seção agrupa páginas do mesmo departamento do
# negócio. Novas páginas do CRM completo entram dentro de "Comercial",
# sem mexer nas outras seções.
NAVEGACAO = [
    (None, [
        ("app.py", "Visão Geral", "🏠"),
    ]),
    ("Comercial", [
        ("pages/03_crm.py", "CRM / Leads", "👥"),
    ]),
    ("Operacional", [
        ("pages/01_turmas.py", "Turmas", "🎓"),
    ]),
    ("Financeiro", [
        ("pages/02_financeiro.py", "Financeiro", "💰"),
        ("pages/05_dre.py", "DRE", "🧾"),
    ]),
    ("Inteligência", [
        ("pages/04_projecoes.py", "Projeções IA", "🔮"),
    ]),
]


def render_navegacao():
    """Menu lateral setorizado por departamento do negócio. A navegação
    automática do Streamlit fica desligada (showSidebarNavigation =
    false, no config.toml) porque ela mostrava um item feio e duplicado
    ("aplicativo") com o nome cru do arquivo — esta função é o único
    menu de navegação agora, chamada em toda página."""
    with st.sidebar:
        for secao, paginas in NAVEGACAO:
            if secao:
                st.markdown(f'<div class="nav-secao">{secao}</div>', unsafe_allow_html=True)
            for caminho, label, icone in paginas:
                st.page_link(caminho, label=label, icon=icone)
