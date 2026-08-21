# CLAUDE.md — Analytics do Negócio (Amor In Formaturas)

Contexto completo do projeto para o Claude Code continuar de onde o Cowork parou.

---

## O que é esse projeto

Dashboard analytics do negócio de fotografia de formaturas **Amor In Formaturas** (Lucas Amorim, adm@lucasamorim.com.br).

- **App live:** https://analytics-negocio-amor-in-j5fr5iewagappnb2mv8gnd6.streamlit.app/
- **Repositório:** https://github.com/Grupoamorim/analytics-negocio-amor-in
- **Branch principal:** `main` (deploy automático no Streamlit Cloud)

---

## Stack

| Camada | Tecnologia |
|---|---|
| Dashboard | Streamlit (Python), hospedado no Streamlit Cloud |
| Banco de dados | Supabase (PostgreSQL) |
| Fonte de dados | SGE (sistema de gestão de formaturas, sge.com.br) via API REST |
| Automação de coleta | GitHub Actions (`.github/workflows/sync.yml`) — roda a cada hora |
| Autenticação | streamlit-authenticator + YAML |

---

## Estrutura do repositório

```
analytics-negocio-amor-in/
├── dashboard/
│   ├── app.py                    # Página principal (Visão Geral) + login
│   ├── auth_config.yaml          # Credenciais de login (admin/admin123 padrão)
│   ├── pages/
│   │   ├── 01_turmas.py          # Gestão de Turmas
│   │   ├── 02_financeiro.py      # Financeiro (contas a pagar/receber, fluxo)
│   │   ├── 03_crm.py             # CRM / Leads (Notion)
│   │   ├── 04_projecoes.py       # Projeções com IA (Prophet)
│   │   └── 05_dre.py             # DRE — Demonstrativo de Resultado (NOVO)
│   └── requirements.txt
├── collectors/
│   └── sge_collector.py          # Coleta dados da API SGE → Supabase
├── .github/
│   └── workflows/
│       └── sync.yml              # GitHub Action: roda sge_collector.py a cada hora
├── database/
│   └── schema.sql                # Schema completo do Supabase
└── .streamlit/
    └── config.toml               # Tema escuro global (NOVO)
```

---

## O que já foi feito (não refazer)

### 1. Modo escuro completo
- `.streamlit/config.toml` criado com tema escuro (`base = "dark"`, `primaryColor = "#818CF8"`, `backgroundColor = "#0E1117"`)
- CSS customizado em `app.py` ajustado para modo escuro (cards, métricas, cores)
- Todos os gráficos Plotly atualizados com `plot_bgcolor="rgba(0,0,0,0)"`, `paper_bgcolor="rgba(0,0,0,0)"`, `font_color="#E5E7EB"`
- Páginas atualizadas: `app.py`, `01_turmas.py`, `02_financeiro.py`, `04_projecoes.py`

### 2. Contas a Pagar
- KPI "📑 Contas a Pagar" adicionado na Visão Geral (5ª coluna)
- Seção "📤 Contas a Pagar" reforçada em `02_financeiro.py` com sub-KPIs (Total Lançado, Pendente, Em Atraso)
- Link para o DRE adicionado no caption

### 3. Página DRE (nova — `pages/05_dre.py`)
- Monta DRE completo: Receita Bruta → Impostos → Receita Líquida → Custos Diretos → Lucro Bruto → Despesas Operacionais → Resultado Líquido
- Classificação automática por palavras-chave (sem LLM — não há API key no projeto)
- Filtro por período (data_vencimento)
- Expander com classificação transparente de cada lançamento
- Seção "Custo por Turma": direto quando `turma_id` preenchido, senão rateio proporcional à receita
- Link no sidebar adicionado em `app.py`

### 4. Integração SGE
- `sge_collector.py` coleta 7 endpoints da API SGE e salva em tabelas `sge_*` no Supabase
- GitHub Action roda o collector a cada hora

---

## Pendências abertas (começar por aqui)

### 🔴 CRÍTICO — RLS bloqueando dados no dashboard
**Sintoma:** Páginas Financeiro e DRE mostram "R$ 0" / "sem dados" porque as tabelas `pagamentos` e `contas_pagar` têm RLS habilitado que bloqueia a chave anon (usada pelo dashboard).

**Causa:** `database/schema.sql` tem:
```sql
ALTER TABLE pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE contas_pagar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Apenas autenticados" ON pagamentos FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Apenas autenticados" ON contas_pagar FOR ALL USING (auth.role() = 'authenticated');
```

**Solução — rodar no Supabase SQL Editor:**
```sql
CREATE POLICY "Anon pode ler pagamentos"
  ON pagamentos FOR SELECT USING (true);

CREATE POLICY "Anon pode ler contas_pagar"
  ON contas_pagar FOR SELECT USING (true);

-- Opcional mas recomendado:
CREATE POLICY "Anon pode ler turmas" ON turmas FOR SELECT USING (true);
CREATE POLICY "Anon pode ler vendas" ON vendas FOR SELECT USING (true);
```

Depois disso Financeiro e DRE passam a mostrar dados reais imediatamente.

### 🟡 Integração do RM (Relatório de Matrícula)
- Lucas quer integrar um "RM" no mesmo dashboard
- Ainda não foi definido o que é exatamente (sistema externo, arquivo Excel, API?)
- **Próximo passo:** perguntar a Lucas o que é o RM e de onde vêm os dados

### 🟡 `contas_pagar.turma_id` sempre null
- O sync do SGE define `turma_id = null` para contas_pagar (o SGE não associa despesas a turmas)
- Por isso o "Custo por Turma" usa rateio proporcional em vez de custo direto
- Para ter custo direto por turma precisaria que o Lucas lançasse manualmente no SGE ou em outra tabela

---

## API SGE — Referência completa

**Base URL:** `https://e-api.sge.com.br`
**Auth:** `Authorization: Basic base64(CNPJ:TOKEN)`

| Endpoint | Parâmetros | Limite descoberto em produção |
|---|---|---|
| `api/emp/conta/listagem-simplificada` | — | Sem limite |
| `api/emp/venda/listar-vendas-por-periodo` | `PeriodoInicial`, `PeriodoFinal` | Máx 90 dias no passado |
| `api/emp/adesao/listar-por-periodo` | `PeriodoInicial`, `PeriodoFinal` | Máx 90 dias no passado |
| `api/emp/financeiro/contas-a-receber` | `VencimentoInicial`, `VencimentoFinal` | Máx 2 meses atrás, janela máx 2 meses |
| `api/emp/financeiro/contas-a-pagar` | `VencimentoInicial`, `VencimentoFinal` | Sem limite confirmado |
| `api/emp/financeiro/cobranca` | `VencimentoInicial`, `VencimentoFinal` | VencimentoFinal máx +15 dias; início máx ~60 dias atrás |
| `api/emp/financeiro/fluxo-de-caixa` | `DataInicial`, `DataFinal`, `Conta` | Requer código da conta; ~10s entre chamadas |

**Secrets no GitHub (e no Streamlit Cloud):**
- `SGE_CNPJ` — CNPJ da empresa no SGE
- `SGE_TOKEN` — Token de integração do SGE
- `SUPABASE_URL` — URL do projeto Supabase
- `SUPABASE_ANON_KEY` — Chave anon (usada pelo dashboard Streamlit)
- `SUPABASE_SERVICE_KEY` — Chave service role (usada pelo collector)

---

## Tabelas Supabase

### Tabelas "sge_*" (dados brutos do SGE, preenchidas pelo collector)
- `sge_contas` — contas bancárias
- `sge_vendas` — vendas
- `sge_adesoes` — adesões
- `sge_contas_receber` — parcelas a receber
- `sge_contas_pagar` — contas a pagar
- `sge_cobranca` — cobranças/inadimplência
- `sge_fluxo_caixa` — fluxo de caixa por conta

### Views (lidas pelo dashboard)
- `vw_resumo_turmas` — principal: agrega tudo por turma (faturamento, recebido, custos, inadimplência)
- `vw_faturamento_mensal` — faturamento agregado por mês
- `vw_inadimplencia` — clientes em atraso

### Tabelas normalizadas (lidas pelo dashboard diretamente)
- `pagamentos` — contas a receber normalizadas ⚠️ RLS bloqueando anon
- `contas_pagar` — contas a pagar normalizadas ⚠️ RLS bloqueando anon
- `turmas` — cadastro de turmas
- `metas` — metas mensais (ano, mes, tipo, valor_meta)
- `sync_log` — log de execuções do collector

---

## Cores e design (modo escuro)

```python
PRIMARY     = "#818CF8"   # roxo/indigo (botões, destaques, barras)
BACKGROUND  = "#0E1117"   # fundo principal
SECONDARY   = "#1B1F2A"   # fundo de cards/métricas
BORDER      = "#2D3142"   # bordas
TEXT_MAIN   = "#F3F4F6"   # texto principal
TEXT_MUTED  = "#9CA3AF"   # texto secundário/labels
GREEN       = "#34D399"   # positivo / delta up
YELLOW      = "#FBBF24"   # atenção / meta parcial
RED         = "#F87171"   # negativo / em atraso
```

---

## Como fazer deploy

Qualquer push para `main` faz redeploy automático no Streamlit Cloud (leva ~1-2 min).

O collector SGE roda via GitHub Actions a cada hora — ver `.github/workflows/sync.yml`.

---

## Contexto do negócio

- Empresa de fotografia de formaturas
- Clientes são alunos de turmas de faculdade
- "Turma" = grupo de alunos de um curso/ano específico
- Receita vem de vendas de pacotes fotográficos (adesões + parcelas)
- Despesas são custos operacionais (fotógrafos, equipamentos, etc.) lançados como contas a pagar no SGE
- Meta de vendas é configurada manualmente na tabela `metas` do Supabase
