-- =====================================================================
-- Tabelas do CRM que o app React já espera (Pipeline, Contatos, Notas,
-- Transcrições, Configurações) mas que nunca foram criadas neste
-- projeto Supabase — por isso o Dashboard mostra "Could not find the
-- table 'public.deals'" e essas telas ficam salvando só no localStorage
-- do navegador em vez de persistir de verdade na nuvem.
--
-- O arquivo web/src/lib/supabase/types.ts (gerado automaticamente a
-- partir do banco do projeto de referência original) já documentava
-- essas colunas — este script cria as tabelas com exatamente essas
-- colunas neste projeto. Cole no SQL Editor do Supabase e execute.
-- =====================================================================

-- 1. Deals (Pipeline) — uma turma tem no máximo um negócio.
create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  turma_id uuid not null unique references public.turmas(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  titulo text,
  valor_estimado numeric default 0,
  value numeric not null default 0,
  stage text not null default 'prospeccao',
  probabilidade integer default 10,
  probability integer default 10,
  outcome text,
  data_previsao_fechamento date,
  tipo_contrato text,
  responsavel text,
  prioridade text default 'Média',
  notas text,
  checklist jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_deals_turma_id on public.deals(turma_id);
create index if not exists idx_deals_stage on public.deals(stage);

drop trigger if exists trg_deals_updated_at on public.deals;
create trigger trg_deals_updated_at
  before update on public.deals
  for each row execute function public.update_updated_at_column();

-- 2. Histórico de mudanças de estágio de cada negócio.
create table if not exists public.stage_transitions (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  changed_at timestamptz not null default now()
);

create index if not exists idx_stage_transitions_deal_id on public.stage_transitions(deal_id);

-- 3. Contatos (alunos/responsáveis vinculados a uma turma).
create table if not exists public.contatos (
  id uuid primary key default gen_random_uuid(),
  turma_id uuid not null references public.turmas(id) on delete cascade,
  nome text not null,
  telefone text,
  email text,
  created_at timestamptz not null default now()
);

create index if not exists idx_contatos_turma_id on public.contatos(turma_id);

-- 4. Notas de atendimento por turma.
create table if not exists public.notas (
  id uuid primary key default gen_random_uuid(),
  turma_id uuid not null references public.turmas(id) on delete cascade,
  titulo text,
  conteudo text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_notas_turma_id on public.notas(turma_id);

drop trigger if exists trg_notas_updated_at on public.notas;
create trigger trg_notas_updated_at
  before update on public.notas
  for each row execute function public.update_updated_at_column();

-- 5. Transcrições de reuniões (análise por IA).
create table if not exists public.transcricoes (
  id uuid primary key default gen_random_uuid(),
  turma_id uuid not null references public.turmas(id) on delete cascade,
  tipo text default 'online',
  titulo text not null,
  conteudo text,
  url text,
  probabilidade integer default 0,
  sentimento text,
  pontos_fortes text,
  pontos_atencao text,
  resumo text,
  proximo_passo text,
  created_at timestamptz not null default now()
);

create index if not exists idx_transcricoes_turma_id on public.transcricoes(turma_id);

-- 6. Configurações por usuário (guarda CNPJ/token do SGE e chave Gemini
-- em texto puro — por isso a política abaixo restringe cada linha ao
-- próprio dono, diferente das demais tabelas deste arquivo que são
-- compartilhadas por toda a equipe).
create table if not exists public.configuracoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  sge_cnpj text,
  sge_token text,
  gemini_api_key text,
  filtros_salvos jsonb not null default '[]'::jsonb,
  preferencias jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_configuracoes_user_id on public.configuracoes(user_id);

drop trigger if exists trg_configuracoes_updated_at on public.configuracoes;
create trigger trg_configuracoes_updated_at
  before update on public.configuracoes
  for each row execute function public.update_updated_at_column();

-- =====================================================================
-- RLS — deals/stage_transitions/contatos/notas/transcricoes são dados
-- de negócio compartilhados por toda a equipe (mesmo padrão já usado
-- em pagamentos/contas_pagar): qualquer usuário autenticado lê e
-- escreve tudo. configuracoes é a exceção (dados sensíveis por pessoa).
-- =====================================================================

alter table public.deals enable row level security;
alter table public.stage_transitions enable row level security;
alter table public.contatos enable row level security;
alter table public.notas enable row level security;
alter table public.transcricoes enable row level security;
alter table public.configuracoes enable row level security;

drop policy if exists "Apenas autenticados" on public.deals;
create policy "Apenas autenticados" on public.deals for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Apenas autenticados" on public.stage_transitions;
create policy "Apenas autenticados" on public.stage_transitions for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Apenas autenticados" on public.contatos;
create policy "Apenas autenticados" on public.contatos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Apenas autenticados" on public.notas;
create policy "Apenas autenticados" on public.notas for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Apenas autenticados" on public.transcricoes;
create policy "Apenas autenticados" on public.transcricoes for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Cada um ve suas proprias configuracoes" on public.configuracoes;
create policy "Cada um ve suas proprias configuracoes" on public.configuracoes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
