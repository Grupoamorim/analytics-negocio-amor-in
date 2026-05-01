import os
import time
import logging
from datetime import datetime, date
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
from supabase import create_client, Client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sge_collector")

SGE_URL      = os.getenv("SGE_URL", "https://sistema.sge.com.br")
SGE_USER     = os.getenv("SGE_USER", "")
SGE_PASSWORD = os.getenv("SGE_PASSWORD", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")


def get_supabase():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError("Configure SUPABASE_URL e SUPABASE_SERVICE_KEY")
    return create_client(SUPABASE_URL, SUPABASE_KEY)


class SGECollector:
    def __init__(self):
        self.base_url = SGE_URL
        self.page = None
        self.browser = None
        self.playwright = None

    def iniciar(self):
        log.info("Iniciando navegador headless...")
        self.playwright = sync_playwright().start()
        self.browser = self.playwright.chromium.launch(headless=True)
        context = self.browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        )
        self.page = context.new_page()

    def encerrar(self):
        if self.browser:
            self.browser.close()
        if self.playwright:
            self.playwright.stop()

    def fazer_login(self):
        try:
            login_url = f"{self.base_url}/SCA/Forms/Login.aspx"
            log.info(f"Acessando: {login_url}")
            self.page.goto(login_url, wait_until="domcontentloaded", timeout=45000)
            time.sleep(3)
            log.info(f"URL atual: {self.page.url}")

            inputs_info = self.page.evaluate("""
                () => Array.from(document.querySelectorAll('input')).map(el => ({
                    type: el.type||'', id: el.id||'', name: el.name||'',
                    placeholder: el.placeholder||''
                }))
            """)
            log.info(f"Inputs na pagina: {inputs_info}")

            email_field = None
            for sel in ['input[type="email"]', 'input[type="text"]',
                        'input[id*="Email"]', 'input[id*="Login"]',
                        'input[name*="Email"]', 'input[name*="Login"]']:
                try:
                    f = self.page.locator(sel).first
                    if f.count() > 0 and f.is_visible(timeout=2000):
                        email_field = f
                        log.info(f"Campo email: {sel}")
                        break
                except:
                    continue

            pass_field = None
            try:
                pass_field = self.page.locator('input[type="password"]').first
                if not pass_field.is_visible(timeout=2000):
                    pass_field = None
            except:
                pass_field = None

            if not email_field or not pass_field:
                log.error(f"Campos nao encontrados. HTML: {self.page.content()[:4000]}")
                return False

            email_field.click()
            email_field.fill("")
            email_field.type(SGE_USER, delay=80)
            time.sleep(0.5)

            pass_field.click()
            pass_field.fill("")
            pass_field.type(SGE_PASSWORD, delay=80)
            time.sleep(0.5)

            log.info(f"Digitado: {SGE_USER[:5]}***")

            clicou = False
            for sel in ['input[value="Entrar"]', 'input[type="submit"]',
                        'button[type="submit"]', 'button:has-text("Entrar")',
                        'a:has-text("Entrar")', 'button']:
                try:
                    btn = self.page.locator(sel).first
                    if btn.count() > 0 and btn.is_visible(timeout=2000):
                        btn.click()
                        log.info(f"Clicou: {sel}")
                        clicou = True
                        break
                except:
                    continue

            if not clicou:
                log.info("Nenhum botao, usando Enter...")
                pass_field.press("Enter")

            try:
                self.page.wait_for_load_state("networkidle", timeout=25000)
            except:
                self.page.wait_for_load_state("domcontentloaded", timeout=10000)

            time.sleep(2)
            log.info(f"URL apos login: {self.page.url}")

            if "Login.aspx" in self.page.url:
                erro = self.page.evaluate("""
                    () => Array.from(document.querySelectorAll('span,div,p'))
                        .map(e => e.innerText.trim())
                        .filter(t => t.length > 3 && t.length < 150 &&
                            /senha|usu.rio|inv.lid|erro|incorret/i.test(t))
                        .slice(0,3).join(' | ')
                """)
                log.error(f"Login falhou. Erro SGE: '{erro}'")
                return False

            log.info("Login OK!")
            return True

        except PlaywrightTimeout:
            log.error("Timeout ao fazer login")
            return False
        except Exception as e:
            log.error(f"Erro no login: {e}")
            return False

    def exportar_relatorio(self, url_relatorio, nome):
        try:
            log.info(f"Exportando: {nome}")
            self.page.goto(url_relatorio, wait_until="networkidle", timeout=30000)
            time.sleep(2)
            dados = self.page.evaluate("""
                () => {
                    const tabelas = document.querySelectorAll('table');
                    const resultado = [];
                    tabelas.forEach(tabela => {
                        const headers = [];
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
                                if (headers[i]) row[headers[i]] = td.innerText.trim();
                            });
                            if (Object.keys(row).length > 0) resultado.push(row);
                        });
                    });
                    return resultado;
                }
            """)
            log.info(f"  -> {len(dados)} registros em '{nome}'")
            return dados
        except Exception as e:
            log.error(f"Erro ao exportar {nome}: {e}")
            return []

    def coletar_turmas(self):
        url = f"{self.base_url}/SGE/Forms/Turma/Consulta.aspx"
        raw = self.exportar_relatorio(url, "turmas")
        turmas = []
        for row in raw:
            t = {
                "codigo": row.get("Codigo", row.get("Cod", row.get("ID", ""))),
                "nome": row.get("Turma", row.get("Nome", row.get("Descricao", ""))),
                "curso": row.get("Curso", row.get("Evento", "")),
                "instituicao": row.get("Instituicao", row.get("Escola", "")),
                "status": row.get("Status", row.get("Situacao", "ativa")).lower(),
                "updated_at": datetime.now().isoformat()
            }
            if t["codigo"] and t["nome"]:
                turmas.append(t)
        return turmas

    def coletar_vendas(self):
        url = f"{self.base_url}/SGE/Forms/Contrato/Consulta.aspx"
        raw = self.exportar_relatorio(url, "vendas")
        vendas = []
        for row in raw:
            v = {
                "codigo_sge": row.get("Contrato", row.get("Codigo", row.get("No", ""))),
                "data_venda": _parse_data(row.get("Data", row.get("Dt. Venda", ""))),
                "valor_total": _parse_valor(row.get("Valor Total", row.get("Vlr Total", "0"))),
                "valor_entrada": _parse_valor(row.get("Entrada", row.get("Vlr Entrada", "0"))),
                "num_parcelas": _parse_int(row.get("Parcelas", "1")),
                "status": row.get("Status", row.get("Situacao", "ativo")).lower(),
                "produto": row.get("Produto", row.get("Pacote", "")),
                "vendedor": row.get("Vendedor", row.get("Consultor", "")),
                "updated_at": datetime.now().isoformat()
            }
            if v["codigo_sge"] and v["valor_total"] > 0:
                vendas.append(v)
        return vendas

    def coletar_pagamentos(self):
        url = f"{self.base_url}/SGE/Forms/Financeiro/ContasReceber.aspx"
        raw = self.exportar_relatorio(url, "pagamentos")
        pagamentos = []
        for row in raw:
            p = {
                "codigo_sge": row.get("Codigo", row.get("Cod", row.get("No", ""))),
                "data_vencimento": _parse_data(row.get("Vencimento", row.get("Dt. Venc.", ""))),
                "data_pagamento": _parse_data(row.get("Pagamento", row.get("Dt. Pgto.", ""))),
                "valor": _parse_valor(row.get("Valor", row.get("Vlr", "0"))),
                "valor_pago": _parse_valor(row.get("Valor Pago", row.get("Vlr Pago", "0"))),
                "status": _determinar_status_pgto(
                    row.get("Status", row.get("Situacao", "")),
                    _parse_data(row.get("Vencimento", "")),
                    _parse_data(row.get("Pagamento", ""))
                ),
                "forma_pagamento": row.get("Forma", row.get("Forma Pgto.", "")),
                "num_parcela": _parse_int(row.get("Parcela", "1")),
                "updated_at": datetime.now().isoformat()
            }
            if p["codigo_sge"]:
                pagamentos.append(p)
        return pagamentos

    def coletar_contas_pagar(self):
        url = f"{self.base_url}/SGE/Forms/Financeiro/ContasPagar.aspx"
        raw = self.exportar_relatorio(url, "contas_pagar")
        contas = []
        for row in raw:
            c = {
                "codigo_sge": row.get("Codigo", row.get("Cod", "")),
                "descricao": row.get("Descricao", row.get("Historico", "")),
                "forn
