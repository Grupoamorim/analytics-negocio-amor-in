"""
SGE Collector via API REST - Versao Final
==========================================
Faz multiplas chamadas por janelas para cobrir periodos longos.
Limites da API SGE (descobertos em producao):
  - Vendas/Adesoes: PeriodoInicial NAO PODE ser mais que ~90 dias no passado
    (diferente de "janela max 90 dias"). Por isso buscamos so os ultimos
    89 dias a cada execucao - o Supabase acumula o historico ao longo do tempo.
  - Contas a receber: max 2 meses atras, janela max 2 meses
  - Contas a pagar: sem limite confirmado
  - Cobranca: VencimentoFinal nao pode passar de ~15 dias a frente de hoje
  - Fluxo de caixa: requer parametro com o codigo da conta em cada chamada
"""

import os
import sys
import base64
import hashlib
import json
import time
import logging
import requests
from datetime import datetime, date, timedelta
from supabase import create_client, Client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sge_api")

# Falhas de upsert (ex: timeout na trigger de normalizacao) ficam aqui em vez de
# só logadas e esquecidas - sem isso o script termina com exit 0 e o GitHub Actions
# mostra "success" mesmo quando nenhum dado novo foi gravado (foi o que aconteceu
# silenciosamente por 3 dias em 2026-09-14/17, ver memoria "Fix timeout na trigger
# de sync SGE"). Populado por upsert()/upsert_fluxo(), checado no fim de main().
ERROS_UPSERT: list[str] = []

SGE_CNPJ     = os.getenv("SGE_CNPJ", "").strip()
SGE_TOKEN    = os.getenv("SGE_TOKEN", "").strip()
SGE_BASE_URL = "https://e-api.sge.com.br"
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")


def get_headers():
    cred = base64.b64encode(f"{SGE_CNPJ}:{SGE_TOKEN}".encode()).decode()
    return {"Authorization": f"Basic {cred}", "Accept": "application/json"}


def sge_get(endpoint, params=None, silencioso=False):
    url = f"{SGE_BASE_URL}/{endpoint}"
    for i in range(3):
        try:
            r = requests.get(url, headers=get_headers(), params=params, timeout=30)
            if r.status_code == 200:
                return r.json()
            if r.status_code == 401:
                log.error(f"Auth falhou (401): {r.text[:200]}")
                return None
            if r.status_code == 404:
                log.warning(f"Endpoint nao encontrado: {endpoint}")
                return None
            if not silencioso:
                log.warning(f"  HTTP {r.status_code}: {r.text[:150]} (tent {i+1})")
            time.sleep(12)
        except Exception as e:
            log.error(f"  Erro {endpoint}: {e}")
            time.sleep(5)
    return None


def fmt(d):
    return d.strftime("%Y-%m-%d")


def data_ou_none(valor):
    """Converte string vazia/None em None - evita erro 'invalid input syntax for type date: \"\"' no Postgres"""
    if valor is None:
        return None
    texto = str(valor).strip()
    return texto if texto else None


def gerar_chave(*campos):
    texto = "|".join(str(c or "") for c in campos)
    return hashlib.md5(texto.encode()).hexdigest()[:20]


def sub(item, chave):
    """Pega um sub-objeto aninhado (ex: item['Cliente']) sempre como dict,
    nunca None - evita erro ao chamar .get() em cima de um None."""
    valor = item.get(chave) if isinstance(item, dict) else None
    return valor if isinstance(valor, dict) else {}


def chave_por_conteudo(item):
    """Chave de dedup baseada no conteudo inteiro do registro.
    Usada como ultimo recurso quando o item nao tem Codigo/Id no
    primeiro nivel: como nao sabemos ao certo em qual campo aninhado a
    API guarda os dados variaveis de cada registro (ja vimos que muda
    dependendo do endpoint/registro), fica arriscado montar a chave com
    2-3 campos escolhidos a dedo - se a maioria dos itens nao tiver
    esses campos preenchidos, todos colapsam numa unica linha (foi
    exatamente o bug original). Usar o JSON inteiro do item garante que
    registros com qualquer diferenca de conteudo gerem chaves distintas."""
    try:
        texto = json.dumps(item, sort_keys=True, default=str, ensure_ascii=False)
    except Exception:
        texto = str(item)
    return hashlib.md5(texto.encode()).hexdigest()[:20]


def lista(dados, *chaves):
    if isinstance(dados, list):
        return dados
    for k in chaves:
        if isinstance(dados, dict) and k in dados and isinstance(dados[k], list):
            return dados[k]
    return []


def coletar_em_janelas(endpoint, param_ini, param_fim, data_ini, data_fim, janela_dias, delay=2, extra_params=None):
    """Quebra periodo longo em janelas menores e acumula resultados"""
    todos = []
    atual = data_ini
    chamadas = 0
    while atual <= data_fim:
        fim_janela = min(atual + timedelta(days=janela_dias - 1), data_fim)
        params = {param_ini: fmt(atual), param_fim: fmt(fim_janela)}
        if extra_params:
            params.update(extra_params)
        dados = sge_get(endpoint, params)
        if dados:
            items = lista(dados, "data", "vendas", "adesoes", "parcelas", "itens")
            todos.extend(items)
            if items:
                log.info(f"    {fmt(atual)} -> {fmt(fim_janela)}: {len(items)} registros")
        atual = fim_janela + timedelta(days=1)
        chamadas += 1
        if atual <= data_fim:
            time.sleep(delay)
    log.info(f"  Total: {len(todos)} registros em {chamadas} janelas")
    return todos


# ── Datas base ────────────────────────────────────────────────
hoje = date.today()


def data_inicio_backfill():
    """Se a variável BACKFILL_DESDE (AAAA-MM-DD) estiver definida, força
    o início da busca de contas a receber/pagar nessa data em vez da
    janela normal relativa a hoje - usado só na execução manual de
    backfill histórico (ver .github/workflows/backfill.yml)."""
    valor = os.getenv("BACKFILL_DESDE", "").strip()
    if not valor:
        return None
    return datetime.strptime(valor, "%Y-%m-%d").date()


# ══════════════════════════════════════════════════════════════
# COLETORES
# ══════════════════════════════════════════════════════════════

def coletar_contas():
    """Contas cadastradas - necessario para fluxo de caixa"""
    log.info("Coletando contas...")
    dados = sge_get("api/emp/conta/listagem-simplificada")
    if not dados:
        return [], []
    items = lista(dados, "contas", "data")
    registros = []
    codigos = []
    for c in items:
        cod = str(c.get("Codigo", c.get("codigo", "")))
        codigos.append(cod)
        registros.append({
            "codigo_sge": cod,
            "nome":       c.get("Descricao", c.get("Nome", c.get("nome", ""))),
            "tipo":       c.get("Tipo", c.get("tipo", "")),
            "banco":      c.get("Banco", c.get("banco", "")),
            "agencia":    str(c.get("Agencia", c.get("agencia", ""))),
            "conta_num":  str(c.get("NumeroConta", c.get("Conta", ""))),
            "saldo":      float(c.get("Saldo", c.get("saldo", 0)) or 0),
            "ativa":      bool(c.get("Ativo", c.get("ativa", True))),
            "raw_data":   c,
            "updated_at": datetime.now().isoformat()
        })
    log.info(f"  -> {len(registros)} contas | codigos: {codigos}")
    return registros, codigos


def coletar_vendas():
    """
    Vendas - a API rejeita PeriodoInicial com mais de ~90 dias no passado
    (erro: "O periodo inicial nao pode exceder 90 dias a partir da data atual").
    Estrategia: buscamos so os ultimos 89 dias a cada execucao; o Supabase
    acumula (upsert) o historico completo ao longo das execucoes horarias.
    """
    log.info("Coletando vendas (ultimos 89 dias - Supabase acumula historico)...")
    data_ini = hoje - timedelta(days=89)
    data_fim = hoje
    items = coletar_em_janelas(
        "api/emp/venda/listar-vendas-por-periodo",
        "PeriodoInicial", "PeriodoFinal",
        data_ini, data_fim, 89, delay=2
    )
    registros = []
    vistos = set()
    for v in items:
        # A API do SGE devolve os dados de verdade aninhados em sub-objetos
        # "Cliente" (dados da adesao/venda) e "Projeto" (dados da turma) -
        # nao nos campos de primeiro nivel. Sem isso, a chave de dedup
        # ficava sempre igual (campos vazios) e cada sincronizacao horaria
        # sobrescrevia tudo numa unica linha.
        c = sub(v, "Cliente")
        p = sub(v, "Projeto")
        cod = str(v.get("Codigo") or v.get("Id") or chave_por_conteudo(v))
        if cod in vistos:
            continue
        vistos.add(cod)
        registros.append({
            "codigo_sge":    cod,
            "data_venda":    data_ou_none(v.get("DataVenda", c.get("DataAdesao", c.get("DataAssinaturaContrato", c.get("DataCadastro", ""))))),
            "cliente":       v.get("NomeCliente", v.get("Cliente") if isinstance(v.get("Cliente"), str) else c.get("Nome", "")),
            "cpf_cliente":   v.get("CpfCliente", c.get("Cpf", "")),
            "produto":       v.get("Produto", c.get("Plano", v.get("Pacote", ""))),
            "valor_total":   float(v.get("ValorTotal", c.get("Valor", 0)) or 0),
            "valor_entrada": float(v.get("ValorEntrada", c.get("ValorPago", 0)) or 0),
            "num_parcelas":  int(v.get("NumeroParcelas", v.get("Parcelas", 1)) or 1),
            "status":        "cancelado" if c.get("Desistente") else str(v.get("Status", v.get("Situacao", "ativo"))).lower(),
            "vendedor":      v.get("Vendedor", c.get("Vendedor", "")),
            "turma":         p.get("Descricao", v.get("Turma", v.get("Evento", ""))),
            "raw_data":      v,
            "updated_at":    datetime.now().isoformat()
        })
    log.info(f"  -> {len(registros)} vendas unicas")
    return registros


def coletar_adesoes():
    """
    Adesoes - mesma restricao de vendas: PeriodoInicial nao pode ser mais
    que ~90 dias no passado. Buscamos so os ultimos 89 dias; o Supabase
    acumula o historico ao longo das execucoes horarias.
    """
    log.info("Coletando adesoes (ultimos 89 dias - Supabase acumula historico)...")
    data_ini = hoje - timedelta(days=89)
    data_fim = hoje
    items = coletar_em_janelas(
        "api/emp/adesao/listar-por-periodo",
        "PeriodoInicial", "PeriodoFinal",
        data_ini, data_fim, 89, delay=2
    )
    registros = []
    vistos = set()
    for a in items:
        # Mesma observacao de coletar_vendas(): os dados reais vem
        # aninhados em "Cliente" (adesao) e "Projeto" (turma).
        c = sub(a, "Cliente")
        p = sub(a, "Projeto")
        # Esse endpoint nunca traz Codigo/Id de primeiro nivel (confirmado
        # em producao - 100% dos registros caiam no fallback). Usar
        # chave_por_conteudo (hash do JSON inteiro) causava duplicata: como
        # campos internos mudam ao longo da vida da adesao (ValorPago,
        # DataAssinaturaContrato preenchidos depois), a "impressao digital"
        # do mesmo registro real mudava a cada sync e o upsert nao
        # reconhecia que era a mesma adesao, inserindo uma linha nova por
        # execucao. Usamos so os campos que identificam a adesao em si e
        # nao mudam depois de criada.
        # BUG corrigido em 2026-09-15: a chave nao incluia CPF/nome do
        # cliente, entao 2+ alunos da mesma turma que assinam no mesmo dia
        # com o mesmo plano (comum em fechamento em grupo) colapsavam numa
        # unica linha - contagem de adesoes ficava menor que a real. CPF e
        # nome sao estaveis (nao mudam depois de criada a adesao), entao
        # entram na chave sem reintroduzir o problema do paragrafo acima.
        cod = str(a.get("Codigo") or a.get("Id") or gerar_chave(
            c.get("DataAdesao"), c.get("Curso"), c.get("Instituicao"), c.get("Plano"),
            c.get("Cpf"), c.get("Nome")
        ))
        if cod in vistos:
            continue
        vistos.add(cod)
        registros.append({
            "codigo_sge":  cod,
            "data_adesao": data_ou_none(a.get("Data", c.get("DataAdesao", c.get("DataAssinaturaContrato", c.get("DataCadastro", ""))))),
            "cliente":     a.get("NomeCliente", a.get("Cliente") if isinstance(a.get("Cliente"), str) else c.get("Nome", "")),
            "cpf_cliente": a.get("CpfCliente", c.get("Cpf", "")),
            "plano":       a.get("Plano", c.get("Plano", a.get("Pacote", ""))),
            "valor":       float(a.get("Valor", c.get("Valor", 0)) or 0),
            "status":      "cancelado" if c.get("Desistente") else str(a.get("Status", a.get("Situacao", "ativo"))).lower(),
            "turma":       p.get("Descricao", a.get("Turma", a.get("Evento", ""))),
            "raw_data":    a,
            "updated_at":  datetime.now().isoformat()
        })
    log.info(f"  -> {len(registros)} adesoes unicas")
    return registros


def coletar_contas_receber():
    """
    Contas a receber.
    API limita: max 2 meses atras, janela max 2 meses por chamada.
    Cobertura: 2 meses atras + 5 anos a frente em janelas de 59 dias.
    (Para historico completo, o Supabase acumula execucoes anteriores)
    """
    data_ini = data_inicio_backfill() or (hoje - timedelta(days=59))
    data_fim = hoje + timedelta(days=1825) # 5 anos a frente
    log.info(f"Coletando contas a receber ({fmt(data_ini)} -> {fmt(data_fim)})...")
    items = coletar_em_janelas(
        "api/emp/financeiro/contas-a-receber",
        "VencimentoInicial", "VencimentoFinal",
        data_ini, data_fim, 59, delay=2
    )
    registros = []
    vistos = set()
    for p in items:
        # IdLancamento é o identificador único de parcela que o SGE realmente devolve (presente
        # em ~100% dos registros) — antes ele nao era usado e a gente caia sempre no hash de
        # conteudo (gerar_chave), que gera um codigo DIFERENTE do usado pela importacao manual
        # da planilha pra essa mesma parcela real, causando duplicata quando as duas fontes se
        # cruzam (achado em 2026-09-14, ver reconciliacao com export "Contas a Receber" do SGE).
        cod = str(p.get("IdLancamento", p.get("Codigo", p.get("Id", p.get("codigo",
            gerar_chave(p.get("NomeCliente",""), p.get("Vencimento",""),
                        p.get("Valor",""), p.get("Parcela",""))
        )))))
        if cod in vistos:
            continue
        vistos.add(cod)
        registros.append({
            "codigo_sge":      cod,
            "cliente":         p.get("NomeCliente", p.get("Cliente", p.get("Aluno", ""))),
            "cpf_cliente":     p.get("CpfCliente", p.get("Cpf", "")),
            "descricao":       p.get("Descricao", p.get("Historico", p.get("Produto", ""))),
            "valor":           float(p.get("Valor", p.get("ValorParcela", 0)) or 0),
            "valor_pago":      float(p.get("ValorPago", p.get("ValorRecebido", 0)) or 0),
            "data_vencimento": data_ou_none(p.get("Vencimento", p.get("DataVencimento", ""))),
            # Data de Crédito é a data de reconhecimento de caixa usada em todo o resto do site
            # (DRE/Financeiro/Projeções) — antes essa coleta usava só Data de Pagamento, que pode
            # ficar alguns dias defasada da Data de Crédito real (cartao/boleto compensando depois).
            "data_pagamento":  data_ou_none(p.get("DataCredito") or p.get("Pagamento", p.get("DataPagamento", ""))),
            "status":          str(p.get("Status", p.get("Situacao", "pendente"))).lower(),
            "forma_pagamento": p.get("FormaPagamento", p.get("Forma", "")),
            "num_parcela":     int(p.get("Parcela", p.get("NumeroParcela", 1)) or 1),
            "turma":           p.get("Turma", p.get("Projeto", p.get("Evento", ""))),
            "raw_data":        p,
            "updated_at":      datetime.now().isoformat()
        })
    log.info(f"  -> {len(registros)} parcelas a receber unicas")
    return registros


def coletar_contas_pagar():
    """
    Contas a pagar - API parece aceitar periodos maiores.
    Cobertura: 6 meses atras + 5 anos a frente.
    """
    data_ini = data_inicio_backfill() or (hoje - timedelta(days=180))
    data_fim = hoje + timedelta(days=1825)
    log.info(f"Coletando contas a pagar ({fmt(data_ini)} -> {fmt(data_fim)})...")
    items = coletar_em_janelas(
        "api/emp/financeiro/contas-a-pagar",
        "VencimentoInicial", "VencimentoFinal",
        data_ini, data_fim, 180, delay=2
    )
    # Se janelas nao funcionarem, tenta sem filtro de data
    if not items:
        log.info("  Tentando sem filtro de data...")
        dados = sge_get("api/emp/financeiro/contas-a-pagar")
        if dados:
            items = lista(dados, "parcelas", "data")
    registros = []
    vistos = set()
    for p in items:
        boleto = p.get("IdentificadorBoleto", p.get("Codigo", p.get("Id")))
        cod = str(boleto) if boleto else gerar_chave(
            p.get("FornecedorNome",""), p.get("Descricao",""),
            p.get("Parcela",""), p.get("DataVencimento", p.get("Vencimento",""))
        )
        if cod in vistos:
            continue
        vistos.add(cod)
        # "Categoria" quase sempre vem "000 - Não classificado" (99% dos casos, confirmado em
        # 2026-09-17) - nesse caso é inútil, e cair nela via .get() com default só funcionaria se
        # a chave estivesse AUSENTE, não com esse valor-placeholder presente. "Servico" é o plano
        # de contas contábil real do SGE (~30 categorias tipo "Despesas com Pessoal- Salarios e
        # Ordenados", "Custos com Eventos", "Pro Labore") e vem preenchido de verdade quase sempre -
        # muito mais útil pro detalhamento do DRE do que "CentroCustos" (só 2 valores possíveis).
        _categoria_bruta = str(p.get("Categoria") or "").strip()
        _categoria_util = _categoria_bruta if _categoria_bruta and not _categoria_bruta.startswith("000") else ""
        registros.append({
            "codigo_sge":      cod,
            "fornecedor":      p.get("FornecedorNome", p.get("Fornecedor", "")),
            "descricao":       p.get("Descricao", p.get("Historico", "")),
            "categoria":       _categoria_util or p.get("Servico", p.get("CentroCustos", "")),
            "valor":           float(p.get("Valor", p.get("ValorParcela", p.get("ValorOriginal", 0))) or 0),
            "valor_pago":      float(p.get("ValorPago", 0) or 0),
            "data_vencimento": data_ou_none(p.get("DataVencimento", p.get("Vencimento", ""))),
            "data_pagamento":  data_ou_none(p.get("DataPagamento", p.get("Pagamento", ""))),
            "status":          str(p.get("Status", p.get("Situacao", "pendente"))).lower(),
            "forma_pagamento": p.get("FormaPagamento", p.get("Forma", "")),
            "raw_data":        p,
            "updated_at":      datetime.now().isoformat()
        })
    log.info(f"  -> {len(registros)} contas a pagar unicas")
    return registros


def coletar_cobranca():
    """
    Cobranca - a API rejeita VencimentoFinal com mais de ~15 dias a frente
    (erro: "A data final da consulta nao pode maior que ... (15 dias a partir de hoje)")
    e tambem limita o periodo inicial a ~60 dias atras.
    Cobertura: 59 dias atras + 14 dias a frente.
    """
    log.info("Coletando cobranca (59 dias atras + 14 dias a frente)...")
    dados = sge_get("api/emp/financeiro/cobranca", {
        "VencimentoInicial": fmt(hoje - timedelta(days=59)),
        "VencimentoFinal":   fmt(hoje + timedelta(days=14))
    })
    if not dados:
        return []
    registros = []
    for c in lista(dados, "parcelas", "data"):
        cod = str(c.get("Codigo", c.get("Id", c.get("IdentificadorBoleto",
            gerar_chave(c.get("NomeCliente",""), c.get("Vencimento",""), c.get("Valor",""))
        ))))
        registros.append({
            "codigo_sge":      cod,
            "cliente":         c.get("NomeCliente", c.get("Cliente", c.get("Aluno", ""))),
            "cpf_cliente":     c.get("CpfCliente", c.get("Cpf", "")),
            "telefone":        c.get("Telefone", c.get("Celular", "")),
            "email":           c.get("Email", c.get("email", "")),
            "valor":           float(c.get("Valor", c.get("ValorParcela", 0)) or 0),
            "data_vencimento": data_ou_none(c.get("Vencimento", c.get("DataVencimento", ""))),
            "dias_atraso":     int(c.get("DiasAtraso", c.get("Atraso", 0)) or 0),
            "status":          str(c.get("Status", c.get("Situacao", "pendente"))).lower(),
            "turma":           c.get("Turma", c.get("Projeto", "")),
            "raw_data":        c,
            "updated_at":      datetime.now().isoformat()
        })
    log.info(f"  -> {len(registros)} cobrancas")
    return registros


def coletar_fluxo_caixa(codigos_conta):
    """
    Fluxo de caixa por conta.
    A API exige o codigo da conta em cada chamada (erro "Informe ao menos
    uma conta" quando nao enviado) - o codigo nao estava sendo repassado
    nas chamadas anteriores. Enviamos algumas variantes de nome de parametro
    (Conta/CodigoConta/Contas) para cobrir o nome exato esperado pela API,
    o que e inofensivo caso a API ignore parametros desconhecidos.
    Cobertura: 6 meses atras + 6 meses a frente.
    """
    if not codigos_conta:
        log.warning("  Sem contas para fluxo de caixa")
        return []
    log.info(f"Coletando fluxo de caixa ({len(codigos_conta)} contas, 6 meses atras/frente)...")
    data_ini = hoje - timedelta(days=180)
    data_fim = hoje + timedelta(days=180)
    todos = []
    vistos = set()
    for cod in codigos_conta[:5]:
        log.info(f"  -> conta {cod}")
        items = coletar_em_janelas(
            "api/emp/financeiro/fluxo-de-caixa",
            "DataInicial", "DataFinal",
            data_ini, data_fim, 59,
            delay=12,  # SGE exige ~10s entre chamadas para este endpoint
            extra_params={"Conta": cod, "CodigoConta": cod, "Contas": cod}
        )
        for f in items:
            data_ref = str(f.get("Data", f.get("Competencia", f.get("Periodo", fmt(hoje)))))[:10]
            chave = gerar_chave(cod, data_ref)
            if chave in vistos:
                continue
            vistos.add(chave)
            todos.append({
                "data":       data_ref,
                "conta":      str(cod),
                "entradas":   float(f.get("Entradas", f.get("Receitas", f.get("Creditos", 0))) or 0),
                "saidas":     float(f.get("Saidas", f.get("Despesas", f.get("Debitos", 0))) or 0),
                "saldo":      float(f.get("Saldo", f.get("Resultado", 0)) or 0),
                "descricao":  f.get("Descricao", f.get("Historico", "")),
                "raw_data":   f,
                "updated_at": datetime.now().isoformat()
            })
        time.sleep(15)
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
        log.warning(f"  Sem chave '{chave}' em {tabela} | campos: {list(dados[0].keys()) if dados else '?'}")
        return 0
    # Envia em lotes de 500
    total = 0
    for i in range(0, len(validos), 500):
        lote = validos[i:i+500]
        try:
            res = sb.table(tabela).upsert(lote, on_conflict=chave).execute()
            total += len(res.data) if res.data else 0
        except Exception as e:
            log.error(f"  ERRO {tabela} lote {i}: {e}")
            ERROS_UPSERT.append(f"{tabela} lote {i} ({len(lote)} registros): {e}")
    if len(validos) > 0 and total == 0:
        # Toda a tabela veio da API mas nada foi salvo - sinal forte de erro
        # sistemico (ex: trigger de normalizacao estourando timeout), nao de
        # "sem novidade", ja que teria pelo menos os registros ja existentes
        # sendo re-upsertados.
        ERROS_UPSERT.append(f"{tabela}: {len(validos)} registros recebidos da API mas 0 salvos")
    log.info(f"  OK {tabela}: {total} salvos")
    return total


def upsert_fluxo(sb, dados):
    if not dados:
        log.info("  Nenhum dado para sge_fluxo_caixa")
        return 0
    validos = [d for d in dados if d.get("data")]
    if not validos:
        return 0
    total = 0
    for i in range(0, len(validos), 500):
        lote = validos[i:i+500]
        try:
            res = sb.table("sge_fluxo_caixa").upsert(lote, on_conflict="data,conta").execute()
            total += len(res.data) if res.data else 0
        except Exception as e:
            log.error(f"  ERRO sge_fluxo_caixa: {e}")
            ERROS_UPSERT.append(f"sge_fluxo_caixa lote {i} ({len(lote)} registros): {e}")
    if len(validos) > 0 and total == 0:
        ERROS_UPSERT.append(f"sge_fluxo_caixa: {len(validos)} registros recebidos da API mas 0 salvos")
    log.info(f"  OK sge_fluxo_caixa: {total} salvos")
    return total


# ══════════════════════════════════════════════════════════════
# PRINCIPAL
# ══════════════════════════════════════════════════════════════
def main():
    inicio = time.time()
    log.info("=" * 50)
    log.info("SGE API Collector - Versao Final")
    log.info(f"Horario: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    log.info("=" * 50)

    if not SGE_CNPJ or not SGE_TOKEN:
        log.error("SGE_CNPJ e SGE_TOKEN sao obrigatorios!")
        return

    sb = get_supabase()
    total = 0
    status_final = "sucesso"
    msg_final = ""
    modo_backfill = data_inicio_backfill() is not None

    try:
        if modo_backfill:
            # Execução manual de backfill histórico: só contas a receber e
            # contas a pagar, desde BACKFILL_DESDE. O Supabase acumula pra
            # sempre (upsert nunca apaga), então isso roda uma vez só e o
            # histórico fica arquivado - a sincronização horária normal
            # continua cuidando só do que é novo/futuro depois disso.
            log.info(f"MODO BACKFILL HISTORICO desde {os.getenv('BACKFILL_DESDE')}")

            receber = coletar_contas_receber()
            total += upsert(sb, "sge_contas_receber", receber)

            pagar = coletar_contas_pagar()
            total += upsert(sb, "sge_contas_pagar", pagar)

            msg_final = f"Backfill concluido: {total} registros (contas a receber + a pagar)"
        else:
            # 1. Contas bancarias (necessario antes do fluxo)
            contas, codigos_conta = coletar_contas()
            total += upsert(sb, "sge_contas", contas)

            # 2. Vendas (1 ano, janelas 89 dias)
            vendas = coletar_vendas()
            total += upsert(sb, "sge_vendas", vendas)

            # 3. Adesoes (1 ano, janelas 89 dias)
            adesoes = coletar_adesoes()
            total += upsert(sb, "sge_adesoes", adesoes)

            # 4. Contas a receber (2 meses atras + 5 anos a frente)
            receber = coletar_contas_receber()
            total += upsert(sb, "sge_contas_receber", receber)

            # 5. Contas a pagar (6 meses atras + 5 anos a frente)
            pagar = coletar_contas_pagar()
            total += upsert(sb, "sge_contas_pagar", pagar)

            # 6. Cobranca (59 dias atras + 90 dias a frente)
            cobranca = coletar_cobranca()
            total += upsert(sb, "sge_cobranca", cobranca)

            # 7. Fluxo de caixa (6 meses atras + 6 meses a frente)
            fluxo = coletar_fluxo_caixa(codigos_conta)
            total += upsert_fluxo(sb, fluxo)

            msg_final = f"Concluido: {total} registros de 7 endpoints"

    except Exception as e:
        status_final = "erro"
        msg_final = str(e)
        log.error(f"ERRO GERAL: {e}")

    if ERROS_UPSERT:
        status_final = "erro"
        msg_final = (msg_final + " | " if msg_final else "") + f"{len(ERROS_UPSERT)} erro(s) de upsert: " + " || ".join(ERROS_UPSERT[:5])

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
    log.info(f"Tempo total: {duracao:.1f}s")

    if status_final == "erro":
        # Sai com erro de verdade - sem isso o GitHub Actions mostra "success"
        # mesmo quando nada foi sincronizado (era exatamente o bug de 2026-09-17).
        sys.exit(1)


if __name__ == "__main__":
    main()
