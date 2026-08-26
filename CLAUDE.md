# CLAUDE.md — Analytics do Negócio (Amor In Formaturas)

Contexto completo do projeto para o Claude Code continuar de onde parou.

---

## O que é esse projeto

CRM + Analytics do negócio de fotografia de formaturas **Amor In Formaturas** (Lucas Amorim, adm@lucasamorim.com.br). Cobre funil comercial, turmas, contatos, financeiro (DRE, contas a pagar/receber), projeções e provisão de caixa.

- **App live:** https://analytics-negocio-amor-in.pages.dev/
- **Repositório:** https://github.com/Grupoamorim/analytics-negocio-amor-in
- **Branch principal:** `main` — qualquer push faz redeploy automático no Cloudflare Pages (~1-2 min)

> ⚠️ Este repositório também contém uma versão antiga do dashboard em Streamlit (pastas `dashboard/`, `database/`, `requirements.txt`, `runtime.txt`). Ela **não está mais em uso** — o produto atual é 100% o app React em `web/`. Não editar os arquivos Streamlit a menos que explicitamente pedido.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind + shadcn/ui + React Router (tudo em `web/`) |
| Hospedagem frontend | Cloudflare Pages, deploy automático no push em `main` |
| Banco de dados | Supabase (Postgres), projeto `mpodlzptnhvskqmbcsdv` |
| Autenticação | Supabase Auth (`profiles.role`: admin/financeiro/comercial/membro) |
| Fonte de dados financeiro/turmas | API REST do SGE (sge.com.br) |
| Fonte de dados de leads/funil | Notion (bases de CRM, propostas, projetos, equipe etc.) |
| Automação de coleta | GitHub Actions (`.github/workflows/`) |
| IA | Google Gemini (análise de transcrições, classificação de despesas) |

---

## Estrutura do repositório

```
analytics-negocio-amor-in/
├── web/                           # App React (produto atual)
│   ├── src/
│   │   ├── pages/                 # Index (Dashboard), Leads (Turmas), Pipeline (Funil),
│   │   │                          # Contatos, Financeiro, DRE, Projecoes, Adesoes,
│   │   │                          # Transcripts, Notes, Captacao, MapaMercado, Admin, ...
│   │   ├── components/            # Layout, SortControl, ColumnHeaderWithFilter,
│   │   │                          # PeriodoFiltroBar, EmpresaFilterBar, ui/ (shadcn) ...
│   │   ├── hooks/                 # useAuth, useConfiguracoes, usePeriodoFiltro, useTurmas, ...
│   │   ├── context/                # CRMContext (leads/deals/tasks/notes/contacts)
│   │   └── lib/supabase/          # client.ts, types.ts (gerado, não editar à mão)
│   └── package.json
├── collectors/                    # Scripts Python rodados pelo GitHub Actions
│   ├── sge_collector.py           # SGE API -> tabelas sge_* no Supabase
│   ├── sge_auto_win.py            # Detecta turma fechada no SGE -> auto-move no funil
│   ├── notion_collector.py        # Notion -> Supabase (leads/funil)
│   └── ia_classificador.py        # Classifica novas despesas por IA (Gemini)
├── .github/workflows/
│   ├── sync-notion.yml            # a cada hora — funil/leads
│   ├── sync-financeiro.yml        # a cada 12h — financeiro SGE + classificação IA
│   ├── sync-funil.yml             # a cada 3h — auto-win de turmas fechadas no SGE
│   └── backfill.yml               # backfill manual (workflow_dispatch)
├── dashboard/, database/, requirements.txt, runtime.txt   # LEGADO Streamlit, não usar
└── CLAUDE.md
```

---

## Como fazer deploy

- **Frontend:** qualquer push para `main` faz redeploy automático no Cloudflare Pages.
- **Dados:** os workflows do GitHub Actions rodam sozinhos nos horários acima; não precisam de deploy manual.
- **Banco de dados:** mudanças de schema/dados no Supabase são aplicadas direto via migration/SQL — não passam pelo Cloudflare Pages nem exigem push.

---

## Convenções e feedback importantes (não redescobrir)

- **Nunca responder em inglês** — sempre PT-BR.
- **Nunca inventar dados** — se a informação não existir, dizer que não tem, não estimar/adivinhar silenciosamente.
- **Git push só em lote**: commitar localmente sempre; só dar `git push` quando o Lucas pedir explicitamente ("atualiza e publica", "sobe pro ar" etc.) ou no fim do dia. Mudanças em Supabase (dados/migrations) não entram nessa regra — podem ser aplicadas na hora.
- **Cores de gráfico financeiro**: comparação custo × receita usa verde (`#34D399`) para receita/positivo e vermelho (`#F87171`) para custo/negativo — não a cor da marca (laranja/roxo). A cor da marca só aparece quando não há essa comparação.
- **Ordenação em toda tela com filtro**: qualquer tela com filtro (busca, dropdown, período) também deve ter ordenação, usando o componente `web/src/components/SortControl.tsx` + helper `sortByField()`/`compareValues()` (que também suporta ordenação em múltiplos níveis via array de chaves, ex: Faculdade + Ano de Formatura).
- **Nome de turma**: existem dois helpers em `web/src/types/crm.ts` — `getTurmaDisplayName()` (versão curta/truncada, para badges e dropdowns compactos) e `getFullTurmaName()` (nome completo: Empresa + Curso + Faculdade + Turma + Ano + Cidade, sem truncar — usado na coluna principal da tabela de Turmas).
- **CLAUDE.md**: só atualizar no fim do dia (ou quando pedido explicitamente), e só quando houver mudança significativa — não a cada pequeno ajuste.

---

## Financeiro / DRE — pontos que já foram resolvidos (não redescobrir)

- **Base de reconhecimento é caixa, não competência**: receita conta pela Data de Crédito/Pagamento (`data_pagamento` em `pagamentos`), despesa pela Data de Pagamento em `contas_pagar` — não pela data de vencimento. Isso já está implementado em DRE, Financeiro e Projeções.
- **Proteção contra duplicação automática**: a função `sync_normalized_from_sge()` no Supabase (trigger em `sge_contas_receber`/`sge_contas_pagar`) tem uma guarda de intervalo de datas para não reimportar/duplicar por cima do período verificado manualmente (2026-01-01 a 2026-08-23). Qualquer nova limpeza manual de dados financeiros precisa considerar essa guarda.
- **DRE tem detalhamento por linha** (expandível, por turma e por fornecedor) e classificação por fornecedor com overrides manuais (`FORNECEDOR_OVERRIDES` em `DRE.tsx`) além das regras por palavra-chave.
- **Filtro de período compartilhado**: `usePeriodoFiltro` + `PeriodoFiltroBar` (Mês/Trimestre/Semestre/Ano/Até Hoje/Personalizado com botão "Filtrar" explícito) são usados em DRE e Financeiro — não duplicar essa lógica em outra página, reaproveitar o hook/componente.
- **Provisão Financeira** (em Projeções): tabela `parametros_custo_turma` no Supabase com custo/venda por aluno por ano e faixa de tamanho de turma, alimentada pela planilha de orçamento real do Lucas. Só considera anos >= ano atual (não olha pra trás).

---

## Administração (`/admin`, restrito a `role = 'admin'`)

Reúne em abas: Usuários e Cargos, Integrações (SGE), Banco de Dados (Supabase), IA (Gemini), Marca (logo), Preferências. A antiga página `/configuracoes` (aberta a qualquer usuário logado) foi removida e agora redireciona para `/admin` — só o admin tem acesso a essas configurações.

**Pendente:** funcionalidade de convidar usuário por e-mail (o convidado define a própria senha, vinculada ao e-mail; o admin pode resetar a senha sem nunca vê-la). Precisa de uma Supabase Edge Function usando a service role key (não pode rodar no cliente) — ainda não implementada.

---

## Pendências abertas / dúvidas em aberto com o Lucas

- **"Ordenar"**: já implementado de forma geral (ver seção de convenções acima). Se o Lucas pedir ordenação em uma tela nova, seguir o mesmo padrão do `SortControl`.
- **Aba "Conflitos" / aba "Movimentar"**: pedido de uma aba com checklist para marcar itens como concluídos, que somem e movam a turma para "Concluída" automaticamente. Escopo/página exata nunca foi confirmada — **não implementado, aguardando confirmação**.

## Turmas concluídas automaticamente por semestre (implementado)

Turma com `funil_status = 'Convertido'` cujo Ano de Formatura já passou (ex: "2026.1" conclui a partir de 01/07/2026; "2026.2" a partir de 01/01/2027) é marcada automaticamente com o campo `concluida` (independente do status do funil) pelo job `collectors/turma_conclusao.py`, rodando 1x/dia via `.github/workflows/sync-turma-conclusao.yml`.

Ao concluir, o job tenta criar a turma seguinte (mesmo curso/faculdade/cidade/empresa) usando a duração do curso cadastrada em Administração → Turmas (tabela `duracao_cursos`, curso [+ faculdade opcional] → anos). **Fórmula confirmada com o Lucas**: `ano_formatura_nova = ano_formatura_antiga + duração_do_curso + 1`, mesmo semestre (ex: Odontologia 5 anos, turma que forma em 2026.2 → gera turma que forma em 2032.2). Se a duração não estiver cadastrada pro curso, a turma só é marcada concluída — a turma nova **não** é criada (não inventamos duração de curso). Duração já cadastrada de fábrica: Odontologia = 5 anos, Direito = 5 anos, Medicina = 6 anos (demais cursos ficam por conta do Lucas cadastrar em Administração → Turmas).

Na tela de Turmas (`Leads.tsx`), turmas concluídas ficam ocultas por padrão (checkbox "Mostrar concluídas" na barra de filtros) e exibem uma badge verde "Concluída" ao lado do Ano de Formatura.

---

## Contexto do negócio

- Empresa de fotografia de formaturas, atuando com marcas internas (AIF, AFF, SFF, AIM, AIF-SSA, AIF-V...).
- Clientes são alunos de turmas de faculdade; "Turma" = grupo de alunos de um curso/ano/cidade específico.
- Receita vem de vendas de pacotes fotográficos (adesões + parcelas).
- Despesas são custos operacionais (fotógrafos, equipamentos etc.) lançados como contas a pagar no SGE.
- Meta de vendas e parâmetros de custo/venda por aluno são configurados manualmente nas tabelas do Supabase (`metas`, `parametros_custo_turma`).
