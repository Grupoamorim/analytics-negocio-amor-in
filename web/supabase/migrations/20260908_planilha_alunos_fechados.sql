-- =====================================================================
-- Planilha de alunos por turma fechada (Adesões > Turmas Fechadas).
-- Guarda nome/telefone de cada aluno de uma turma já convertida, importados
-- de uma planilha (Excel/CSV) subida pelo Lucas, pra acompanhar contato
-- individual (mensagem enviada / sem resposta / negou / fechou) via WhatsApp,
-- em paralelo ao funil padrão por turma. Um aluno pode ser marcado "fechou"
-- automaticamente (bate com um registro em `clientes` daquela turma, vindo
-- do SGE) ou manualmente.
-- =====================================================================

create table if not exists public.planilha_alunos (
  id uuid primary key default gen_random_uuid(),
  turma_id uuid not null references public.turmas(id) on delete cascade,
  nome text not null,
  telefone text,
  status text not null default 'pendente'
    check (status in ('pendente', 'enviado', 'sem_resposta', 'negou', 'fechado')),
  fechou boolean not null default false,
  fechou_em timestamptz,
  fechou_origem text check (fechou_origem in ('sge_auto', 'manual')),
  contato_id uuid references public.contatos(id) on delete set null,
  chat_wa_id text,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create index if not exists idx_planilha_alunos_turma on public.planilha_alunos(turma_id);
create index if not exists idx_planilha_alunos_telefone on public.planilha_alunos(telefone);
create index if not exists idx_planilha_alunos_status on public.planilha_alunos(status);

drop trigger if exists trg_planilha_alunos_updated_at on public.planilha_alunos;
create trigger trg_planilha_alunos_updated_at
  before update on public.planilha_alunos
  for each row execute function public.update_updated_at_column();

alter table public.planilha_alunos enable row level security;

drop policy if exists "Apenas autenticados" on public.planilha_alunos;
create policy "Apenas autenticados" on public.planilha_alunos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
