"""
SGE Collector via API REST
===========================
Coleta dados da API oficial do SGE (e-api.sge.com.br) e salva no Supabase.
Autenticação: Basic Auth com CNPJ + Token em base64.

Secrets necessários no GitHub:
  SGE_CNPJ         -> CNPJ da empresa (só números, ex: 12345678000190)
  SGE_TOKEN        -> Token gerado em Configurações > Segurança no SGE
  SUPABASE_URL     -> URL do projeto Supabase
  SUPABASE_SERVICE_KEY -> Chave service_role do Supabase
"""

import os
import base64
import time
import logging
import requests
from datetime import datetime, date, timedelta
from supabase import create_client, Client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sge_api")

# ── Credenciais ───────────────────────────────────────────────
SGE_CNPJ         = os.getenv("SGE_CNPJ", "")
SGE_TOKEN        = os.getenv("SGE_TOKEN", "")
SGE_BASE_URL     = "https://e-api.sge.com.br"
SUPABASE_URL     = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY     = os.getenv("SUPABASE_SERVICE_KEY", "")


# ── Autenticação Basic (CNPJ:TOKEN em base64) ─────────────────
def get_headers():
    credencial = base64.b64encode(f"{SGE_CNPJ}:{SGE_TOKEN}".encode()).decode()
    return {
        "Authorization": f"Basic {credencial}",
        "Content-Type": "application/json",
        "Accept": "application/json"
    }


# ── Requisição genérica com retry ────────────────────────────
def sge_get(endpoint, params=None, tentativas=3):
    url = f"{SGE_BASE_URL}/{endpoint}"
    headers = get_headers()
    log.info(f"  Requisicao: GET {url}")
    log.info(f"  CNPJ (primeiros 6): {SGE_CNPJ[:6]}*** | Token (primeiros 6): {SGE_TOKEN[:6]}***")
    for i in range(tentativas):
        try:
            r = requests.get(url, headers=headers, params=params, timeout=30)
            log.info(f"  HTTP {r.status_code} | Resposta: {r.text[:300]}")
            if r.status_code == 200:
                return r.json()
            if r.status_code == 401:
                log.error(f"Autenticacao falhou (401) em {endpoint}")
                log.error(f"Resposta SGE: {r.text[:500]}")
                return None
            if r.status_code == 404:
                log.warning(f"Endpoint nao encontrado (404): {endpoint}")
                return None
            log.warning(f"  HTTP {r.status_code} em {endpoint} (tentativa {i+1})")
            time.sleep(2)
        except Exception as e:
            log.error(f"  Erro em {endpoint}: {e} (tentativa {i+1})")
            time.sleep(2)
    return None


# ── Datas utilitárias (formato dd/MM/yyyy para a API do SGE) ──
def fmt(d): return d.strftime("%d/%m/%Y")

hoje      = date.today()
inicio_ano = fmt(date(hoje.year, 1, 1))          # 01/01 deste ano
fim_ano    = fmt(date(hoje.year, 12, 31))         # 31/12 deste ano
ha_1_ano   = fmt(hoje - timedelta(days=365))      # 1 ano atrás
ha_6_meses = fmt(hoje - timedelta(days=180))      # 6 meses atrás
em_1_ano   = fmt(hoje + timedelta(days=365))      # 1 ano à frente
em_90_dias = fmt(hoje + timedelta(days=90))       # 90 dias à frente
hoje_str   = fmt(hoje)


# ══════════════════════════════════════════════════════════════
# COLETORES — um por endpoint
# ══════════════════════════════════════════════════════════════

def coletar_vendas():
    """GET api/emp/venda/listar-vendas-por-periodo — vendas dos últimos 12 meses"""
    log.info("Coletando vendas...")
    dados = sge_get("api/emp/venda/listar-vendas-por-periodo", {
        "PeriodoInicial": ha_1_ano,
        "PeriodoFinal": hoje_str
    })
    if not dados:
        return []
    registros = []
    for v in (dados if isinstance(dados, list) else dados.get("data", dados.get("vendas", []))):
        registros.append({
            "codigo_sge":    str(v.get("codigo", v.get("id", v.get("numero", "")))),
            "data_venda":    v.get("data", v.get("dataVenda", v.get("dataCadastro", ""))),
            "cliente":       v.get("nomeCliente", v.get("cliente", v.get("aluno", ""))),
            "cpf_cliente":   v.get("cpf", v.get("cpfCliente", "")),
            "produto":       v.get("produto", v.get("plano", v.get("pacote", ""))),
            "valor_total":   float(v.get("valorTotal", v.get("valor", 0)) or 0),
            "valor_entrada": float(v.get("valorEntrada", v.get("entrada", 0)) or 0),
            "num_parcelas":  int(v.get("numeroParcelas", v.get("parcelas", 1)) or 1),
            "status":        str(v.get("status", v.get("situacao", "ativo"))).lower(),
            "vendedor":      v.get("vendedor", v.get("consultor", "")),
            "turma":         v.get("turma", v.get("evento", v.get("projeto", ""))),
            "raw_data":      v,
            "updated_at":    datetime.now().isoformat()
        })
    log.info(f"  -> {len(registros)} vendas")
    return registros


def coletar_adesoes():
    """GET api/emp/adesao/listar-por-periodo — adesões dos últimos 12 meses"""
    log.info("Coletando adesoes...")
    dados = sge_get("api/emp/adesao/listar-por-periodo", {
        "PeriodoInicial": ha_1_ano,
        "PeriodoFinal": hoje_str
    })
    if not dados:
        return []
    registros = []
    for a in (dados if isinstance(dados, list) else dados.get("data", dados.get("adesoes", []))):
        registros.append({
            "codigo_sge":   str(a.get("codigo", a.get("id", ""))),
            "data_adesao":  a.get("data", a.get("dataAdesao", a.get("dataCadastro", ""))),
            "cliente":      a.get("nomeCliente", a.get("cliente", a.get("aluno", ""))),
            "cpf_cliente":  a.get("cpf", a.get("cpfCliente", "")),
            "plano":        a.get("plano", a.get("produto", a.get("pacote", ""))),
            "valor":        float(a.get("valor", a.get("valorTotal", 0)) or 0),
            "status":       str(a.get("status", a.get("situacao", "ativo"))).lower(),
            "turma":        a.get("turma", a.get("evento", a.get("projeto", ""))),
            "raw_data":     a,
            "updated_at":   datetime.now().isoformat()
        })
    log.info(f"  -> {len(registros)} adesoes")
    return registros


def coletar_contas_receber():
    """GET api/emp/financeiro/contas-a-receber — recebimentos: últimos 6 meses + próximos 12"""
    log.info("Coletando contas a receber...")
    dados = sge_get("api/emp/financeiro/contas-a-receber", {
        "VencimentoInicial": ha_6_meses,
        "VencimentoFinal": em_1_ano
    })
    if not dados:
        return []
    registros = []
    for p in (dados if isinstance(dados, list) else dados.get("data", dados.get("parcelas", []))):
        registros.append({
            "codigo_sge":       str(p.get("codigo", p.get("id", p.get("numeroParcela", "")))),
            "cliente":          p.get("nomeCliente", p.get("cliente", p.get("aluno", ""))),
            "cpf_cliente":      p.get("cpf", p.get("cpfCliente", "")),
            "descricao":        p.get("descricao", p.get("historico", p.get("produto", ""))),
            "valor":            float(p.get("valor", p.get("valorParcela", 0)) or 0),
            "valor_pago":       float(p.get("valorPago", p.get("valorRecebido", 0)) or 0),
            "data_vencimento":  p.get("vencimento", p.get("dataVencimento", "")),
            "data_pagamento":   p.get("pagamento", p.get("dataPagamento", "")),
            "status":           str(p.get("status", p.get("situacao", p.get("situacaoRecebimento", "pendente")))).lower(),
            "forma_pagamento":  p.get("formaPagamento", p.get("forma", "")),
            "num_parcela":      int(p.get("numeroParcela", p.get("parcela", 1)) or 1),
            "turma":            p.get("turma", p.get("projeto", p.get("evento", ""))),
            "raw_data":         p,
            "updated_at":       datetime.now().isoformat()
        })
    log.info(f"  -> {len(registros)} parcelas a receber")
    return registros


def coletar_contas_pagar():
    """GET api/emp/financeiro/contas-a-pagar — pagamentos: últimos 6 meses + próximos 12"""
    log.info("Coletando contas a pagar...")
    dados = sge_get("api/emp/financeiro/contas-a-pagar", {
        "VencimentoInicial": ha_6_meses,
        "VencimentoFinal": em_1_ano
    })
    if not dados:
        return []
    registros = []
    for p in (dados if isinstance(dados, list) else dados.get("data", dados.get("parcelas", []))):
        registros.append({
            "codigo_sge":      str(p.get("codigo", p.get("id", ""))),
            "fornecedor":      p.get("fornecedor", p.get("nomeFornecedor", "")),
            "descricao":       p.get("descricao", p.get("historico", "")),
            "categoria":       p.get("categoria", p.get("tipo", p.get("projeto", ""))),
            "valor":           float(p.get("valor", p.get("valorParcela", 0)) or 0),
            "valor_pago":      float(p.get("valorPago", 0) or 0),
            "data_vencimento": p.get("vencimento", p.get("dataVencimento", "")),
            "data_pagamento":  p.get("pagamento", p.get("dataPagamento", "")),
            "status":          str(p.get("status", p.get("situacao", p.get("situacaoPagamento", "pendente")))).lower(),
            "forma_pagamento": p.get("formaPagamento", p.get("forma", "")),
            "raw_data":        p,
            "updated_at":      datetime.now().isoformat()
        })
    log.info(f"  -> {len(registros)} contas a pagar")
    return registros


def coletar_cobranca():
    """GET api/emp/financeiro/cobranca — parcelas vencidas e a vencer (próximos 90 dias)"""
    log.info("Coletando cobranca...")
    dados = sge_get("api/emp/financeiro/cobranca", {
        "VencimentoInicial": ha_6_meses,
        "VencimentoFinal": em_90_dias
    })
    if not dados:
        return []
    registros = []
    for c in (dados if isinstance(dados, list) else dados.get("data", dados.get("parcelas", []))):
        registros.append({
            "codigo_sge":      str(c.get("codigo", c.get("id", ""))),
            "cliente":         c.get("nomeCliente", c.get("cliente", c.get("aluno", ""))),
            "cpf_cliente":     c.get("cpf", c.get("cpfCliente", "")),
            "telefone":        c.get("telefone", c.get("celular", "")),
            "email":           c.get("email", ""),
            "valor":           float(c.get("valor", c.get("valorParcela", 0)) or 0),
            "data_vencimento": c.get("vencimento", c.get("dataVencimento", "")),
            "dias_atraso":     int(c.get("diasAtraso", c.get("atraso", 0)) or 0),
            "status":          str(c.get("status", c.get("situacao", "pendente"))).lower(),
            "turma":           c.get("turma", c.get("projeto", c.get("evento", ""))),
            "raw_data":        c,
            "updated_at":      datetime.now().isoformat()
        })
    log.info(f"  -> {len(registros)} parcelas cobranca")
    return registros


def coletar_fluxo_caixa():
    """GET api/emp/financeiro/fluxo-de-caixa"""
    log.info("Coletando fluxo de caixa...")
    dados = sge_get("api/emp/financeiro/fluxo-de-caixa")
    if not dados:
        return []
    registros = []
    items = dados if isinstance(dados, list) else dados.get("data", dados.get("fluxo", [dados] if isinstance(dados, dict) else []))
    for f in items:
        registros.append({
            "data":           f.get("data", f.get("competencia", f.get("periodo", hoje_str))),
            "entradas":       float(f.get("entradas", f.get("receitas", f.get("creditos", 0)) or 0)),
            "saidas":         float(f.get("saidas", f.get("despesas", f.get("debitos", 0)) or 0)),
            "saldo":          float(f.get("saldo", f.get("resultado", 0)) or 0),
            "descricao":      f.get("descricao", f.get("historico", "")),
            "raw_data":       f,
            "updated_at":     datetime.now().isoformat()
        })
    log.info(f"  -> {len(registros)} registros fluxo caixa")
    return registros


def coletar_contas():
    """GET api/emp/conta/listagem-simplificada — contas cadastradas"""
    log.info("Coletando contas...")
    dados = sge_get("api/emp/conta/listagem-simplificada")
    if not dados:
        return []
    registros = []
    for c in (dados if isinstance(dados, list) else dados.get("data", dados.get("contas", []))):
        registros.append({
            "codigo_sge": str(c.get("codigo", c.get("id", ""))),
            "nome":       c.get("nome", c.get("descricao", "")),
            "tipo":       c.get("tipo", ""),
            "banco":      c.get("banco", c.get("nomeBanco", "")),
            "agencia":    str(c.get("agencia", "")),
            "conta_num":  str(c.get("conta", c.get("numeroConta", ""))),
            "saldo":      float(c.get("saldo", c.get("saldoAtual", 0)) or 0),
            "ativa":      bool(c.get("ativa", c.get("ativo", True))),
            "raw_data":   c,
            "updated_at": datetime.now().isoformat()
        })
    log.info(f"  -> {len(registros)} contas")
    return registros


# ══════════════════════════════════════════════════════════════
# SUPABASE
# ══════════════════════════════════════════════════════════════
def get_supabase():
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def upsert(sb, tabela, dados, chave="codigo_sge"):
    if not dados:
        log.info(f"  Nenhum dado para {tabela}")
        return 0
    validos = [d for d in dados if d.get(chave)]
    if not validos:
        log.warning(f"  Nenhum registro com chave '{chave}' em {tabela}")
        if dados:
            log.warning(f"  Campos disponiveis: {list(dados[0].keys())}")
            log.warning(f"  Primeiro registro: {dados[0]}")
        return 0
    try:
        res = sb.table(tabela).upsert(validos, on_conflict=chave).execute()
        count = len(res.data) if res.data else 0
        log.info(f"  OK {tabela}: {count} registros salvos")
        return count
    except Exception as e:
        log.error(f"  ERRO {tabela}: {e}")
        return 0


def upsert_fluxo(sb, dados):
    """Fluxo de caixa usa 'data' como chave"""
    return upsert(sb, "sge_fluxo_caixa", dados, chave="data")


# ══════════════════════════════════════════════════════════════
# PRINCIPAL
# ══════════════════════════════════════════════════════════════
def main():
    inicio = time.time()
    log.info("=" * 50)
    log.info("SGE API Collector iniciado")
    log.info(f"Horario: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    log.info("=" * 50)

    if not SGE_CNPJ or not SGE_TOKEN:
        log.error("SGE_CNPJ e SGE_TOKEN sao obrigatorios!")
        return

    if not SUPABASE_URL or not SUPABASE_KEY:
        log.error("SUPABASE_URL e SUPABASE_SERVICE_KEY sao obrigatorios!")
        return

    sb = get_supabase()
    total = 0
    status_final = "sucesso"
    msg_final = ""

    try:
        # Vendas
        vendas = coletar_vendas()
        total += upsert(sb, "sge_vendas", vendas)

        # Adesoes
        adesoes = coletar_adesoes()
        total += upsert(sb, "sge_adesoes", adesoes)

        # Contas a receber
        receber = coletar_contas_receber()
        total += upsert(sb, "sge_contas_receber", receber)

        # Contas a pagar
        pagar = coletar_contas_pagar()
        total += upsert(sb, "sge_contas_pagar", pagar)

        # Cobranca
        cobranca = coletar_cobranca()
        total += upsert(sb, "sge_cobranca", cobranca)

        # Fluxo de caixa
        fluxo = coletar_fluxo_caixa()
        total += upsert_fluxo(sb, fluxo)

        # Contas bancarias
        contas = coletar_contas()
        total += upsert(sb, "sge_contas", contas)

        msg_final = f"Concluido: {total} registros de 7 endpoints"

    except Exception as e:
        status_final = "erro"
        msg_final = str(e)
        log.error(f"ERRO GERAL: {e}")

    finally:
        duracao = time.time() - inicio
        try:
            sb.table("sync_log").insert({
                "fonte": "sge_api",
                "status": status_final,
                "registros_atualizados": total,
                "mensagem": msg_final,
                "duracao_segundos": round(duracao, 2)
            }).execute()
        except Exception:
            pass
        log.info(f"\n{'OK' if status_final == 'sucesso' else 'ERRO'} {msg_final}")
        log.info(f"Tempo: {duracao:.1f}s")


if __name__ == "__main__":
    main()
