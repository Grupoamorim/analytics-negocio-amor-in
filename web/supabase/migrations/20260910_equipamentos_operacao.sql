-- =====================================================================
-- Menu "Operação" > Equipamentos: checklist de saída/entrada de
-- equipamentos por fotógrafo, com foto de comprovação em cada
-- movimentação. Objetivo: saber sempre com quem está cada equipamento
-- e quem foi a última pessoa a pegar, pra rastrear sumiço/quebra.
-- =====================================================================

create table if not exists public.fotografos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.equipamentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text,
  codigo text,
  foto_url text,
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Cada linha é um evento de saída ou entrada. O status atual do
-- equipamento (disponível / com fulano) é derivado no app a partir da
-- última movimentação — não guardamos "estado atual" duplicado aqui.
create table if not exists public.equipamento_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  equipamento_id uuid not null references public.equipamentos(id) on delete cascade,
  fotografo_id uuid not null references public.fotografos(id) on delete restrict,
  tipo text not null check (tipo in ('saida', 'entrada')),
  foto_url text not null,
  observacao text,
  criado_por uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_equip_mov_equipamento on public.equipamento_movimentacoes(equipamento_id, created_at desc);
create index if not exists idx_equip_mov_fotografo on public.equipamento_movimentacoes(fotografo_id);

drop trigger if exists trg_fotografos_updated_at on public.fotografos;
create trigger trg_fotografos_updated_at
  before update on public.fotografos
  for each row execute function public.update_updated_at_column();

drop trigger if exists trg_equipamentos_updated_at on public.equipamentos;
create trigger trg_equipamentos_updated_at
  before update on public.equipamentos
  for each row execute function public.update_updated_at_column();

alter table public.fotografos enable row level security;
alter table public.equipamentos enable row level security;
alter table public.equipamento_movimentacoes enable row level security;

drop policy if exists "Apenas autenticados" on public.fotografos;
create policy "Apenas autenticados" on public.fotografos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Apenas autenticados" on public.equipamentos;
create policy "Apenas autenticados" on public.equipamentos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Apenas autenticados" on public.equipamento_movimentacoes;
create policy "Apenas autenticados" on public.equipamento_movimentacoes for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Bucket de fotos (foto do equipamento no cadastro + comprovação de
-- saída/entrada), público pra leitura igual turmas-fotos/logos.
insert into storage.buckets (id, name, public)
values ('equipamentos-fotos', 'equipamentos-fotos', true)
on conflict (id) do nothing;

drop policy if exists "Leitura pública de fotos de equipamentos" on storage.objects;
create policy "Leitura pública de fotos de equipamentos" on storage.objects for select
  using (bucket_id = 'equipamentos-fotos');

drop policy if exists "Autenticados podem enviar fotos de equipamentos" on storage.objects;
create policy "Autenticados podem enviar fotos de equipamentos" on storage.objects for insert
  to authenticated with check (bucket_id = 'equipamentos-fotos');

drop policy if exists "Autenticados podem atualizar fotos de equipamentos" on storage.objects;
create policy "Autenticados podem atualizar fotos de equipamentos" on storage.objects for update
  to authenticated using (bucket_id = 'equipamentos-fotos');

drop policy if exists "Autenticados podem remover fotos de equipamentos" on storage.objects;
create policy "Autenticados podem remover fotos de equipamentos" on storage.objects for delete
  to authenticated using (bucket_id = 'equipamentos-fotos');
