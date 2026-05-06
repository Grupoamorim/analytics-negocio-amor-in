"""
SGE Collector via API REST
===========================
Coleta dados da API oficial do SGE (e-api.sge.com.br) e salva no Supabase.
"""

import os
import base64
import hashlib
import time
import logging
import requests
from datetime import datetime, date, timedelta
from supabase import create_client, Client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sge_api")

SGE_CNPJ     = os.getenv("SGE_CNPJ", "").strip()
SGE_TOKEN    = os.getenv("SGE_TOKEN", "").strip()
SGE_BASE_URL = "https://e-api.sge.com.br"
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")


def get_headers():
    credencial = base64.b64encode(f"{SGE_CNPJ}:{SGE_TOKEN}".encode()).decode()
    return {"Authorization": f"Basic {credencial}", "Accept": "application/json"}


def sge_get(endpoint, params=None):
    url = f"{SGE_BASE_URL}/{endpoint}"
    for i in range(3):
        try:
            r = requests.get(url, headers=get_headers(), params=params, timeout=30)
            if r.status_code == 200:
                return r.json()
            if r.status_code == 401:
                log.error(f"Auth falhou (401) em {endpoint}: {r.text[:200]}")
                return None
            if r.status_code == 404:
                log.warning(f"Endpoint nao encontrado: {endpoint}")
                return None
            log.warning(f"  HTTP {r.status_code} em {endpoint}: {r.text[:200]} (tent. {i+1})")
            time.sleep(10)  # SGE pede 10s entre chamadas repetidas
        except Exception as e:
            log.error(f"  Erro em {endpoint}: {e} (tent. {i+1})")
            time.sleep(5)
    return None


# ── Datas (ISO format, limites respeitados) ───────────────────
def fmt(d): return d.strftime("%Y-%m-%d")

hoje       = date.today()
ha_89_dias = fmt(hoje - timedelta(days=89))   # vendas/adesoes: max 90 dias
ha_59_dias = fmt(hoje - timedelta(days=59))   # financeiro: max 2 meses
ha_58_dias = fmt(hoje - timedelta(days=58))   # cobranca: max 60 dias
em_30_dias = fmt(hoje + timedelta(days=30))
hoje_str   = fmt(hoje)


def gerar_chave(*campos):
    """Gera chave única a partir de múltiplos campos"""
    texto = "|".join(str(c or "") for c in campos)
    return hashlib.md5(texto.encode()).hexdigest()[:16]


def lista(dados, *chaves):
    """Extrai lista de resposta independente do formato"""
    if isinstance(dados, list):
        return dados
    for k in chaves:
        if k in dados and isinstance(dados[k], list):
            return dados[k]
    return []


# ══════════════════════════════════════════════════════════════
# COLETORES
# ══════════════════════════════════════════════════════════════

def coletar_contas():
    """Contas cadastradas — usado para fluxo de caixa também"""
    log.info("Coletando contas...")
    dados = sge_get("api/emp/conta/listagem-simplificada")
    if not dados:
        return [], []
    items = lista(dados, "contas", "data")
    registros = []
    codigos = []
    for c in items:
        cod = str(c.get("Codigo", c.get("codigo", c.get("id", ""))))
        codigos.append(cod)
        registros.append({
            "codigo_sge": cod,
            "nome":       c.get("Descricao", c.get("descricao", c.get("nome", ""))),
            "tipo":       c.get("Tipo", c.get("tipo", "")),
            "banco":      c.get("Banco", c.get("banco", "")),
            "agencia":    str(c.get("Agencia", c.get("agencia", ""))),
            "conta_num":  str(c.get("NumeroConta", c.get("conta", ""))),
            "saldo":      float(c.get("Saldo", c.get("saldo", 0)) or 0),
            "ativa":      bool(c.get("Ativo", c.get("ativa", c.get("ativo", True)))),
            "raw_data":   c,
            "updated_at": datetime.now().isoformat()
        })
    log.info(f"  -> {len(registros)} contas | codigos: {codigos}")
    return registros, codigos


def coletar_vendas():
    """Vendas — máximo 90 dias por chamada"""
    log.info("Coletando vendas (ultimos 89 dias)...")
    dados = sge_get("api/emp/venda/listar-vendas-por-periodo", {
        "PeriodoInicial": ha_89_dias,
        "PeriodoFinal":   hoje_str
    })
    if not dados:
        return []
    registros = []
    for v in lista(dados, "vendas", "data"):
        registros.append({
            "codigo_sge":    str(v.get("Codigo", v.get("codigo", v.get("Id", v.get("id", gerar_chave(v.get("DataVenda",""), v.get("NomeCliente",""), v.get("ValorTotal",""))))))),
            "data_venda":    v.get("DataVenda", v.get("Data", v.get("data", ""))),
            "cliente":       v.get("NomeCliente", v.get("Cliente", v.get("Aluno", v.get("cliente", "")))),
            "cpf_cliente":   v.get("CpfCliente", v.get("Cpf", v.get("cpf", ""))),
            "produto":       v.get("Produto", v.get("Plano", v.get("Pacote", v.get("produto", "")))),
            "valor_total":   float(v.get("ValorTotal", v.get("Valor", v.get("valor", 0))) or 0),
            "valor_entrada": float(v.get("ValorEntrada", v.get("Entrada", 0)) or 0),
            "num_parcelas":  int(v.get("NumeroParcelas", v.get("Parcelas", 1)) or 1),
            "status":        str(v.get("Status", v.get("Situacao", "ativo"))).lower(),
            "vendedor":      v.get("Vendedor", v.get("Consultor", "")),
            "turma":         v.get("Turma", v.get("Evento", v.get("Projeto", ""))),
            "raw_data":      v,
            "updated_at":    datetime.now().isoformat()
        })
    log.info(f"  -> {len(registros)} vendas")
    return registros


def coletar_adesoes():
    """Adesões — máximo 90 dias por chamada"""
    log.info("Coletando adesoes (ultimos 89 dias)...")
    dados = sge_get("api/emp/adesao/listar-por-periodo", {
        "PeriodoInicial": ha_89_dias,
        "PeriodoFinal":   hoje_str
    })
    if not dados:
        return []
    registros = []
    for a in lista(dados, "adesoes", "data"):
        registros.append({
            "codigo_sge":  str(a.get("Codigo", a.get("Id", a.get("codigo", gerar_chave(a.get("Data",""), a.get("NomeCliente",""), a.get("Plano","")))))),
            "data_adesao": a.get("Data", a.get("DataAdesao", a.get("DataCadastro", ""))),
            "cliente":     a.get("NomeCliente", a.get("Cliente", a.get("Aluno", ""))),
            "cpf_cliente": a.get("CpfCliente", a.get("Cpf", "")),
            "plano":       a.get("Plano", a.get("Produto", a.get("Pacote", ""))),
            "valor":       float(a.get("Valor", a.get("ValorTotal", 0)) or 0),
            "status":      str(a.get("Status", a.get("Situacao", "ativo"))).lower(),
            "turma":       a.get("Turma", a.get("Evento", a.get("Projeto", ""))),
            "raw_data":    a,
            "updated_at":  datetime.now().isoformat()
        })
    log.info(f"  -> {len(registros)} adesoes")
    return registros


def coletar_contas_receber():
    """Contas a receber — máximo 2 meses atrás, janela máx 2 meses"""
    log.info("Coletando contas a receber...")
    dados = sge_get("api/emp/financeiro/contas-a-receber", {
        "VencimentoInicial": ha_59_dias,
        "VencimentoFinal":   em_30_dias
    })
    if not dados:
        return []
    registros = []
    for p in lista(dados, "parcelas", "data"):
        codigo = str(p.get("Codigo", p.get("Id", p.get("codigo",
            gerar_chave(p.get("NomeCliente",""), p.get("Vencimento",""), p.get("Valor",""), p.get("Parcela",""))
        ))))
        registros.append({
            "codigo_sge":      codigo,
            "cliente":         p.get("NomeCliente", p.get("Cliente", p.get("Aluno", ""))),
            "cpf_cliente":     p.get("CpfCliente", p.get("Cpf", "")),
            "descricao":       p.get("Descricao", p.get("Historico", p.get("Produto", ""))),
            "valor":           float(p.get("Valor", p.get("ValorParcela", 0)) or 0),
            "valor_pago":      float(p.get("ValorPago", p.get("ValorRecebido", 0)) or 0),
            "data_vencimento": p.get("Vencimento", p.get("DataVencimento", "")),
            "data_pagamento":  p.get("Pagamento", p.get("DataPagamento", "")),
            "status":          str(p.get("Status", p.get("Situacao", p.get("SituacaoRecebimento", "pendente")))).lower(),
            "forma_pagamento": p.get("FormaPagamento", p.get("Forma", "")),
            "num_parcela":     int(p.get("Parcela", p.get("NumeroParcela", 1)) or 1),
            "turma":           p.get("Turma", p.get("Projeto", p.get("Evento", ""))),
            "raw_data":        p,
            "updated_at":      datetime.now().isoformat()
        })
    log.info(f"  -> {len(registros)} contas a receber")
    return registros


def coletar_contas_pagar():
    """Contas a pagar — campos em PascalCase"""
    log.info("Coletando contas a pagar...")
    dados = sge_get("api/emp/financeiro/contas-a-pagar", {
        "VencimentoInicial": ha_59_dias,
        "VencimentoFinal":   em_30_dias
    })
    if not dados:
        return []
    registros = []
    for p in lista(dados, "parcelas", "data"):
        # Chave única: IdentificadorBoleto se existir, senão hash
        boleto = p.get("IdentificadorBoleto", p.get("Codigo", p.get("Id")))
        codigo = str(boleto) if boleto else gerar_chave(
            p.get("FornecedorNome",""), p.get("Descricao",""),
            p.get("Parcela",""), p.get("DataVencimento", p.get("Vencimento",""))
        )
        registros.append({
            "codigo_sge":      codigo,
            "fornecedor":      p.get("FornecedorNome", p.get("Fornecedor", p.get("fornecedor", ""))),
            "descricao":       p.get("Descricao", p.get("Historico", p.get("descricao", ""))),
            "categoria":       p.get("Categoria", p.get("CentroCustos", p.get("Servico", ""))),
            "valor":           float(p.get("Valor", p.get("ValorParcela", 0)) or 0),
            "valor_pago":      float(p.get("ValorPago", 0) or 0),
            "data_vencimento": p.get("DataVencimento", p.get("Vencimento", "")),
            "data_pagamento":  p.get("DataPagamento", p.get("Pagamento", "")),
            "status":          str(p.get("Status", p.get("Situacao", p.get("SituacaoPagamento", "pendente")))).lower(),
            "forma_pagamento": p.get("FormaPagamento", p.get("Forma", "")),
            "raw_data":        p,
            "updated_at":      datetime.now().isoformat()
        })
    log.info(f"  -> {len(registros)} contas a pagar")
    return registros


def coletar_cobranca():
    """Cobrança — máximo 60 dias atrás"""
    log.info("Coletando cobranca (ultimos 58 dias)...")
    dados = sge_get("api/emp/financeiro/cobranca", {
        "VencimentoInicial": ha_58_dias,
        "VencimentoFinal":   em_30_dias
    })
    if not dados:
        return []
    registros = []
    for c in lista(dados, "parcelas", "data"):
        codigo = str(c.get("Codigo", c.get("Id", c.get("IdentificadorBoleto",
            gerar_chave(c.get("NomeCliente",""), c.get("Vencimento",""), c.get("Valor",""))
        ))))
        registros.append({
            "codigo_sge":      codigo,
            "cliente":         c.get("NomeCliente", c.get("Cliente", c.get("Aluno", ""))),
            "cpf_cliente":     c.get("CpfCliente", c.get("Cpf", "")),
            "telefone":        c.get("Telefone", c.get("Celular", "")),
            "email":           c.get("Email", c.get("email", "")),
            "valor":           float(c.get("Valor", c.get("ValorParcela", 0)) or 0),
            "data_vencimento": c.get("Vencimento", c.get("DataVencimento", "")),
            "dias_atraso":     int(c.get("DiasAtraso", c.get("Atraso", 0)) or 0),
            "status":          str(c.get("Status", c.get("Situacao", "pendente"))).lower(),
            "turma":           c.get("Turma", c.get("Projeto", c.get("Evento", ""))),
            "raw_data":        c,
            "updated_at":      datetime.now().isoformat()
        })
    log.info(f"  -> {len(registros)} cobrancas")
    return registros


def coletar_fluxo_caixa(codigos_conta):
    """Fluxo de caixa — requer código de conta"""
    if not codigos_conta:
        log.warning("  Sem contas para fluxo de caixa")
        return []
    log.info(f"Coletando fluxo de caixa para {len(codigos_conta)} contas...")
    todos = []
    for cod in codigos_conta[:5]:  # máximo 5 contas
        dados = sge_get("api/emp/financeiro/fluxo-de-caixa", {
            "Conta": cod,
            "DataInicial": ha_59_dias,
            "DataFinal": em_30_dias
        })
        if not dados:
            continue
        items = lista(dados, "fluxo", "data")
        for f in items:
            data_ref = f.get("Data", f.get("Competencia", f.get("Periodo", hoje_str)))
            todos.append({
                "data":       str(data_ref)[:10] if data_ref else hoje_str,
                "conta":      str(cod),
                "entradas":   float(f.get("Entradas", f.get("Receitas", f.get("Creditos", 0))) or 0),
                "saidas":     float(f.get("Saidas", f.get("Despesas", f.get("Debitos", 0))) or 0),
                "saldo":      float(f.get("Saldo", f.get("Resultado", 0)) or 0),
                "descricao":  f.get("Descricao", f.get("Historico", "")),
                "raw_data":   f,
                "updated_at": datetime.now().isoformat()
            })
        time.sleep(11)  # SGE exige 10s entre chamadas
    log.info(f"  -> {len(todos)} registros fluxo caixa")
    return todos


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
        log.warning(f"  Sem chave '{chave}' em {tabela}")
        if dados:
            log.warning(f"  Campos: {list(dados[0].keys())}")
        return 0
    try:
        res = sb.table(tabela).upsert(validos, on_conflict=chave).execute()
        count = len(res.data) if res.data else 0
        log.info(f"  OK {tabela}: {count} salvos")
        return count
    except Exception as e:
        log.error(f"  ERRO {tabela}: {e}")
        return 0


def upsert_fluxo(sb, dados):
    if not dados:
        log.info("  Nenhum dado para sge_fluxo_caixa")
        return 0
    validos = [d for d in dados if d.get("data")]
    if not validos:
        return 0
    try:
        res = sb.table("sge_fluxo_caixa").upsert(validos, on_conflict="data,conta").execute()
        count = len(res.data) if res.data else 0
        log.info(f"  OK sge_fluxo_caixa: {count} salvos")
        return count
    except Exception as e:
        log.error(f"  ERRO sge_fluxo_caixa: {e}")
        return 0


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

    sb = get_supabase()
    total = 0
    status_final = "sucesso"
    msg_final = ""

    try:
        # Contas primeiro (necessário para fluxo de caixa)
        contas, codigos_conta = coletar_contas()
        total += upsert(sb, "sge_contas", contas)

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

        # Fluxo de caixa (usa codigos das contas)
        fluxo = coletar_fluxo_caixa(codigos_conta)
        total += upsert_fluxo(sb, fluxo)

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
