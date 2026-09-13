-- Painel de Conquistas & Marcos (gamificado) — trilha de ações/compromissos rumo às metas do
-- negócio, alimentada manualmente ou pelo Consultor de Metas. "Atrasado" não é uma coluna: é
-- derivado no client a partir de prazo < hoje && status = 'pendente'.
create table metas_marcos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text not null,
  metrica text,
  meta_negocio_id uuid references metas_negocio(id) on delete set null,
  prazo date,
  pontos int not null default 10,
  ordem int,
  status text not null default 'pendente',
  concluido_em timestamptz,
  explicacao text,
  decisao text,
  origem text not null default 'manual',
  risco_realista text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint metas_marcos_status_check check (status in ('pendente','concluido','cancelado')),
  constraint metas_marcos_decisao_check check (decisao is null or decisao in ('realocado','descartado','substituido')),
  constraint metas_marcos_origem_check check (origem in ('manual','ia'))
);

alter table metas_marcos enable row level security;

create policy "autenticados leem marcos" on metas_marcos
  for select using (true);

create policy "autenticados criam marcos" on metas_marcos
  for insert with check (true);

create policy "autenticados atualizam marcos" on metas_marcos
  for update using (true);

create policy "admin apaga marcos" on metas_marcos
  for delete using (is_admin());
