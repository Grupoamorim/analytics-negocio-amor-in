"""
SGE Collector - Sistema de Gestão de Formaturas e Eventos
==========================================================
"""

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


def get_supabase() -> Client:
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

    def fazer_login(self) -> bool:
        try:
            login_url = f"{self.base_url}/SCA/Forms/Login.aspx"
            log.info(f"Acessando: {login_url}")
            self.page.goto(login_url, wait_until="domcontentloaded", timeout=45000)
            time.sleep(3)
            log.info(f"URL atual: {self.page.url}")

            email_field = None
            for sel in ['input[type="email"]', 'input[type="text"]',
                        'input[id*="Email"]', 'input[id*="Login"]']:
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
                html = self.page.content()[:3000]
                log.error(f"Campos nao encontrados. HTML: {html}")
                return False

            email_field.clear()
            email_field.fill(SGE_USER)
            pass_field.clear()
            pass_field.fill(SGE_PASSWORD)
            log.info("Credenciais preenchidas")

            for sel in ['button:has-text("Entrar")', 'input[value="Entrar"]',
                        'button[type="submit"]', 'input[type="submit"]']:
                try:
                    btn = self.page.locator(sel).first
                    if btn.count() > 0 and btn.is_visible(timeout=2000):
                        btn.click()
                        log.info(f"Botao clicado: {sel}")
                        break
                except:
                    continue

            self.page.wait_for_load_state("domcontentloaded", timeout=20000)
            time.sleep(2)
            log.info(f"URL apos login: {self.page.url}")

            if "Login.aspx" in self.page.url:
                log.error("Ainda na pagina de login - verifique as credenciais")
                return False

            log.info("Login realizado com sucesso!")
            return True

        except PlaywrightTimeout:
            log.error("Timeout ao fazer login")
            return False
        except Exception as e:
            log.error(f"Erro no login: {e}")
            return False

    def exportar_relatorio(self, url_relatorio: str, nome: str) -> list:
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

    def coletar_turmas(self) -> list:
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

    def coletar_vendas(self) -> list:
        url = f"{self.base_url}/SGE/Forms/Contrato/Consulta.aspx"
        raw = self.exportar_relatorio(url, "vendas")
        vendas = []
        for row in raw:
            v = {
                "codigo_sge": row.get("Contrato", row.get("Codigo", row.get("No", ""))),
                "data_venda": _parse_data(row.get("Data", row.get("Dt. Venda", ""))),
                "valor_total": _parse_valor(row.get("Valor Total", row.get("Vlr Total", "0"))),
                "valor_entrada": _parse_valor(row.get("Entrada", row.get("Vlr Entrada", "0"))),
                "num_parcelas": _parse_int(row.get("Parcelas", row.get("No Parcelas", "1"))),
                "status": row.get("Status", row.get("Situacao", "ativo")).lower(),
                "produto": row.get("Produto", row.get("Pacote", "")),
                "vendedor": row.get("Vendedor", row.get("Consultor", "")),
                "updated_at": datetime.now().isoformat()
            }
            if v["codigo_sge"] and v["valor_total"] > 0:
                vendas.append(v)
        return vendas

    def coletar_pagamentos(self) -> list:
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
                "num_parcela": _parse_int(row.get("Parcela", row.get("No Parcela", "1"))),
                "updated_at": datetime.now().isoformat()
            }
            if p["codigo_sge"]:
                pagamentos.append(p)
        return pagamentos

    def coletar_contas_pagar(self) -> list:
        url = f"{self.base_url}/SGE/Forms/Financeiro/ContasPagar.aspx"
        raw = self.exportar_relatorio(url, "contas_pagar")
        contas = []
        for row in raw:
            c = {
                "codigo_sge": row.get("Codigo", row.get("Cod", "")),
                "descricao": row.get("Descricao", row.get("Historico", "")),
                "fornecedor": row.get("Fornecedor", ""),
                "categoria": row.get("Categoria", row.get("Tipo", "")),
                "valor": _parse_valor(row.get("Valor", "0")),
                "data_vencimento": _parse_data(row.get("Vencimento", "")),
                "data_pagamento": _parse_data(row.get("Pagamento", "")),
                "status": row.get("Status", row.get("Situacao", "pendente")).lower(),
                "updated_at": datetime.now().isoformat()
            }
            if c["codigo_sge"] and c["valor"] > 0:
                contas.append(c)
        return contas


def _parse_data(valor):
    if not valor or str(valor).strip() in ("", "-", ""):
        return None
    valor = str(valor).strip()
    for fmt in ["%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d", "%d-%m-%Y"]:
        try:
            return datetime.strptime(valor, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def _parse_valor(valor):
    if not valor or str(valor).strip() in ("", "-", ""):
        return 0.0
    valor = str(valor).strip().replace("R$", "").replace(".", "").replace(",", ".").strip()
    try:
        return float(valor)
    except ValueError:
        return 0.0


def _parse_int(valor):
    try:
        return int(str(valor).strip())
    except (ValueError, TypeError):
        return 1


def _determinar_status_pgto(status_raw, vencimento, pagamento):
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


def upsert_dados(supabase, tabela, dados, chave="codigo_sge"):
    if not dados:
        log.info(f"  Nenhum dado para {tabela}")
        return 0
    dados_validos = [d for d in dados if d.get(chave)]
    if not dados_validos:
        return 0
    try:
        result = supabase.table(tabela).upsert(dados_validos, on_conflict=chave).execute()
        count = len(result.data) if result.data else 0
        log.info(f"  OK {tabela}: {count} registros")
        return count
    except Exception as e:
        log.error(f"  ERRO {tabela}: {e}")
        return 0


def registrar_sync(supabase, fonte, status, registros, msg, duracao):
    try:
        supabase.table("sync_log").insert({
            "fonte": fonte,
            "status": status,
            "registros_atualizados": registros,
            "mensagem": msg,
            "duracao_segundos": round(duracao, 2)
        }).execute()
    except Exception as e:
        log.error(f"Erro sync_log: {e}")


def main():
    inicio = time.time()
    log.info("=" * 50)
    log.info("SGE Collector iniciado")
    log.info(f"Horario: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    log.info("=" * 50)

    if not SGE_USER or not SGE_PASSWORD:
        log.error("SGE_USER e SGE_PASSWORD nao configurados!")
        return

    supabase = get_supabase()
    coletor = SGECollector()
    total = 0
    status_final = "sucesso"
    msg_final = ""

    try:
        coletor.iniciar()

        if not coletor.fazer_login():
            raise Exception("Falha no login do SGE")

        log.info("\nColetando turmas...")
        turmas = coletor.coletar_turmas()
        total += upsert_dados(supabase, "turmas", turmas, "codigo")

        log.info("\nColetando vendas...")
        vendas = coletor.coletar_vendas()
        total += upsert_dados(supabase, "vendas", vendas, "codigo_sge")

        log.info("\nColetando pagamentos...")
        pagamentos = coletor.coletar_pagamentos()
        total += upsert_dados(supabase, "pagamentos", pagamentos, "codigo_sge")

        log.info("\nColetando contas a pagar...")
        contas = coletor.coletar_contas_pagar()
        total += upsert_dados(supabase, "contas_pagar", contas, "codigo_sge")

        msg_final = f"Concluido: {total} registros"

    except Exception as e:
        status_final = "erro"
        msg_final = str(e)
        log.error(f"ERRO: {e}")

    finally:
        coletor.encerrar()
        duracao = time.time() - inicio
        registrar_sync(supabase, "sge", status_final, total, msg_final, duracao)
        log.info(f"\n{'OK' if status_final == 'sucesso' else 'ERRO'} {msg_final}")
        log.info(f"Tempo: {duracao:.1f}s")


if __name__ == "__main__":
    main()
