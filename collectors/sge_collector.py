"""
SGE Collector - Sistema de Gestão de Formaturas e Eventos
==========================================================
Busca dados do SGE automaticamente via login web (Playwright)
e salva no banco de dados Supabase.

Roda a cada hora via GitHub Actions — SEM gastar tokens do Claude.
"""

import os
import json
import time
import logging
from datetime import datetime, date
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
from supabase import create_client, Client

# ── Configuração de logs ──────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()]
)
log = logging.getLogger("sge_collector")

# ── Variáveis de ambiente ─────────────────────────────────────
SGE_URL      = os.getenv("SGE_URL", "https://sistema.sge.com.br")
SGE_USER     = os.getenv("SGE_USER", "")
SGE_PASSWORD = os.getenv("SGE_PASSWORD", "")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")


# ══════════════════════════════════════════════════════════════
# CLIENTE SUPABASE
# ══════════════════════════════════════════════════════════════
def get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError("Configure SUPABASE_URL e SUPABASE_SERVICE_KEY nas variáveis de ambiente")
    return create_client(SUPABASE_URL, SUPABASE_KEY)


# ══════════════════════════════════════════════════════════════
# COLETOR SGE via Playwright (automação web)
# ══════════════════════════════════════════════════════════════
class SGECollector:
    def __init__(self):
        self.base_url = SGE_URL
        self.page = None
        self.browser = None
        self.playwright = None

    def iniciar(self):
        """Inicia o navegador headless"""
        log.info("Iniciando navegador headless...")
        self.playwright = sync_playwright().start()
        self.browser = self.playwright.chromium.launch(headless=True)
        context = self.browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        )
        self.page = context.new_page()

    def encerrar(self):
        """Fecha o navegador"""
        if self.browser:
            self.browser.close()
        if self.playwright:
            self.playwright.stop()

    def fazer_login(self) -> bool:
        """Faz login no SGE"""
        try:
            login_url = f"{self.base_url}/SCA/Forms/Login.aspx"
            log.info(f"Acessando página de login: {login_url}")
            self.page.goto(login_url, wait_until="domcontentloaded", timeout=45000)
            time.sleep(3)

            log.info(f"URL atual: {self.page.url}")

            # Campo de email/usuário
            email_field = None
            for sel in ['input[type="email"]', 'input[type="text"]',
                        'input[id*="Email"]', 'input[id*="Login"]']:
                try:
                    f = self.page.locator(sel).first
                    if f.count() > 0 and f.is_visible(timeout=2000):
                        email_field = f
                        log.info(f"Campo email encontrado: {sel}")
                        break
                except:
                    continue

            # Campo de senha
            pass_field = None
            try:
                pass_field = self.page.locator('input[type="password"]').first
                if not pass_field.is_visible(timeout=2000):
                    pass_field = None
            except:
                pass_field = None

            if not email_field or not pass_field:
                html = self.page.content()[:3000]
                log.error(f"Campos não encontrados. HTML: {html}")
                return False

            email_field.clear()
            email_field.fill(SGE_USER)
            pass_field.clear()
            pass_field.fill(SGE_PASSWORD)
            log.info("Credenciais preenchidas")

            # Botão Entrar
            for sel in ['button:has-text("Entrar")', 'input[value="Entrar"]',
                        'button[type="submit"]', 'input[type="submit"]']:
                try:
                    btn = self.page.locator(sel).first
                    if btn.count() > 0 and btn.is_visible(timeout=2000):
                        btn.click()
                        log.info(f"Botão clicado: {sel}")
                        break
                except:
                    continue

            self.page.wait_for_load_state("domcontentloaded", timeout=20000)
            time.sleep(2)
            log.info(f"URL após login: {self.page.url}")

            if "Login.aspx" in self.page.url:
                log.error("Ainda na página de login — verifique as credenciais")
                return False

            log.info("Login realizado com sucesso!")
            return True

        except PlaywrightTimeout:
            log.error("Timeout ao fazer login")
            return False
        except Exception as e:
            log.error(f"Erro no login: {e}")
            return False

    def exportar_relatorio(self, url_relatorio: str, nome: str) -> list[dict]:
        """
        Navega para uma página de relatório e extrai dados da tabela HTML.
        Retorna lista de dicionários com os dados.
        """
        try:
            log.info(f"Exportando relatório: {nome}")
            self.page.goto(url_relatorio, wait_until="networkidle", timeout=30000)
            time.sleep(2)

            dados = self.page.evaluate("""
                () => {
                    const tabelas = document.querySelectorAll('table');
                    const resultado = [];

                    tabelas.forEach(tabela => {
                        const headers = [];
                        const linhas = [];

                        const ths = tabela.querySelectorAll('tr:first-child th, tr:first-child td');
                        ths.forEach(th => headers.push(th.innerText.trim()));

                        if (headers.length === 0) return;

                        const trs = tabela.querySelectorAll('tr');
                        trs.forEach((tr, idx) => {
                            if (idx === 0) return;
                            const cells = tr.querySelectorAll('td');
                            if (cells.length === 0) return;

                            const row = {};
                            cells.forEach((td, i) => {
                                if (headers[i]) {
                                    row[headers[i]] = td.innerText.trim();
                                }
                            });
                            if (Object.keys(row).length > 0) linhas.push(row);
                        });

                        if (linhas.length > 0) resultado.push(...linhas);
                    });

                    return resultado;
                }
            """)

            log.info(f"  → {len(dados)} registros encontrados em '{nome}'")
            return dados

        except Exception as e:
            log.error(f"Erro ao exportar {nome}: {e}")
            return []

    def coletar_turmas(self) -> list[dict]:
        """Coleta lista de turmas"""
        url = f"{self.base_url}/SGE/Forms/Turma/Consulta.aspx"
        raw = self.exportar_relatorio(url, "turmas")

        turmas = []
        for row in raw:
            turma = {
                "codigo": row.get("Código", row.get("Cód", row.get("ID", ""))),
                "nome": row.get("Turma", row.get("Nome", row.get("Descrição", ""))),
                "curso": row.get("Curso", row.get("Evento", "")),
                "instituicao": row.get("Instituição", row.get("Escola", "")),
                "status": row.get("Status", row.get("Situação", "ativa")).lower(),
                "updated_at": datetime.now().isoformat()
            }
            if turma["codigo"] and turma["nome"]:
                turmas.append(turma)

        return turmas

    def coletar_vendas(self) -> list[dict]:
        """Coleta vendas/contratos"""
        url = f"{self.base_url}/SGE/Forms/Contrato/Consulta.aspx"
        raw = self.exportar_relatorio(url, "vendas")

        vendas = []
        for row in raw:
            venda = {
                "codigo_sge": row.get("Contrato", row.get("Código", row.get("Nº", ""))),
                "data_venda": _parse_data(row.get("Data", row.get("Dt. Venda", ""))),
                "valor_total": _parse_valor(row.get("Valor Total", row.get("Vlr Total", "0"))),
                "valor_entrada": _parse_valor(row.get("Entrada", row.get("Vlr Entrada", "0"))),
                "num_parcelas": _parse_int(row.get("Parcelas", row.get("Nº Parcelas", "1"))),
                "status": row.get("Status", row.get("Situação", "ativo")).lower(),
                "produto": row.get("Produto", row.get("Pacote", "")),
                "vendedor": row.get("Vendedor", row.get("Consultor", "")),
                "updated_at": datetime.now().isoformat()
            }
            if venda["codigo_sge"] and venda["valor_total"] > 0:
                vendas.append(venda)

        return vendas

    def coletar_pagamentos(self) -> list[dict]:
        """Coleta parcelas e pagamentos"""
        url = f"{self.base_url}/SGE/Forms/Financeiro/ContasReceber.aspx"
        raw = self.exportar_relatorio(url, "pagamentos")

        pagamentos = []
        for row in raw:
            pgto = {
                "codigo_sge": row.get("Código", row.get("Cód", row.get("Nº", ""))),
                "data_vencimento": _parse_data(row.get("Vencimento", row.get("Dt. Venc.", ""))),
                "data_pagamento": _parse_data(row.get("Pagamento", row.get("Dt. Pgto.", ""))),
                "valor": _parse_valor(row.get("Valor", row.get("Vlr", "0"))),
                "valor_pago": _parse_valor(row.get("Valor Pago", row.get("Vlr Pago", "0"))),
                "status": _determinar_status_pgto(
                    row.get("Status", row.get("Situação", "")),
                    _parse_data(row.get("Vencimento", "")),
                    _parse_data(row.get("Pagamento", ""))
                ),
                "forma_pagamento": row.get("Forma", row.get("Forma Pgto.", "")),
                "num_parcela": _parse_int(row.get("Parcela", row.get("Nº Parcela", "1"))),
                "updated_at": datetime.now().isoformat()
            }
            if pgto["codigo_sge"]:
                pagamentos.append(pgto)

        return pagamentos

    def coletar_contas_pagar(self) -> list[dict]:
        """Coleta contas a pagar / custos por turma"""
        url = f"{self.base_url}/SGE/Forms/Financeiro/ContasPagar.aspx"
        raw = self.exportar_relatorio(url, "contas_pagar")

        contas = []
        for row in raw:
            conta = {
                "codigo_sge": row.get("Código", row.get("Cód", "")),
                "descricao": row.get("Descrição", row.get("Histórico", "")),
                "fornecedor": row.get("Fornecedor", ""),
                "categoria": row.get("Categoria", row.get("Tipo", "")),
                "valor": _parse_valor(row.get("Valor", "0")),
                "data_vencimento": _parse_data(row.get("Vencimento", "")),
                "data_pagamento": _parse_data(row.get("Pagamento", "")),
                "status": row.get("Status", row.get("Situação", "pendente")).lower(),
                "updated_at": datetime.now().isoformat()
            }
            if conta["codigo_sge"] and conta["valor"] > 0:
                contas.append(conta)

        return contas


# ══════════════════════════════════════════════════════════════
# FUNÇÕES AUXILIARES
# ══════════════════════════════════════════════════════════════
def _parse_data(valor: str) -> str | None:
    if not valor or valor.strip() in ("", "-", "—"):
        return None
    valor = valor.strip()
    formatos = ["%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d", "%d-%m-%Y"]
    for fmt in formatos:
        try:
            return datetime.strptime(valor, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def _parse_valor(valor: str) -> float:
    if not valor or valor.strip() in ("", "-", "—"):
        return 0.0
    valor = valor.strip()
    valor = valor.replace("R$", "").replace(".", "").replace(",", ".").strip()
    try:
        return float(valor)
    except ValueError:
        return 0.0


def _parse_int(valor: str) -> int:
    try:
        return int(str(valor).strip())
    except (ValueError, TypeError):
        return 1


def _determinar_status_pgto(status_raw: str, vencimento: str | None, pagamento: str | None) -> str:
    if pagamento:
        return "pago"
    if status_raw:
        s = status_raw.lower()
        if any(x in s for x in ["pago", "quitado", "liquidado"]):
            return "pago"
        if any(x in s for x in ["cancel", "estorn"]):
            return "cancelado"
    if vencimento:
        try:
            dt_venc = datetime.strptime(vencimento, "%Y-%m-%d").date()
            if dt_venc < date.today():
                return "atrasado"
        except ValueError:
            pass
    return "pendente"


# ══════════════════════════════════════════════════════════════
# SINCRONIZAÇÃO COM SUPABASE
# ══════════════════════════════════════════════════════════════
def upsert_dados(supabase: Client, tabela: str, dados: list[dict], chave: str = "codigo_sge") -> int:
    if not dados:
        log.info(f"  Nenhum dado para {tabela}")
        return 0

    dados_validos = [d for d in dados if d.get(chave)]

    if not dados_validos:
        return 0

    try:
        result = supabase.table(tabela).upsert(dados_validos, on_conflict=chave).execute()
        count = len(result.data) if result.data else 0
        log.info(f"  ✓ {tabela}: {count} registros atualizados")
        return count
    except Exception as e:
        log.error(f"  ✗ Erro ao salvar {tabela}: {e}")
        return 0


def registrar_sync(supabase: Client, fonte: str, status: str, registros: int, msg: str, duracao: float):
    try:
        supabase.table("sync_log").insert({
            "fonte": fonte,
            "status": status,
            "registros_atualizados": registros,
            "mensagem": msg,
            "duracao_segundos": round(duracao, 2)
        }).execute()
    except Exception as e:
        log.error(f"Erro ao registrar sync log: {e}")


# ══════════════════════════════════════════════════════════════
# FUNÇÃO PRINCIPAL
# ══════════════════════════════════════════════════════════════
def main():
    inicio = time.time()
    log.info("=" * 50)
    log.info("SGE Collector iniciado")
    log.info(f"Horário: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    log.info("=" * 50)

    if not SGE_USER or not SGE_PASSWORD:
        log.error("SGE_USER e SGE_PASSWORD não configurados!")
        return

    supabase = get_supabase()
    coletor = SGECollector()
    total_registros = 0
    status_final = "sucesso"
    msg_final = ""

    try:
        coletor.iniciar()

        if not coletor.fazer_login():
            raise Exception("Falha no login do SGE")

        log.info("\n📋 Coletando turmas...")
        turmas = coletor.c
