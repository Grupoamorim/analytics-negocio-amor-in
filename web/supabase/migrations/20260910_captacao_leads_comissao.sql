-- Checkbox "Faz parte da comissão" no formulário das Ações de Captação.
alter table public.captacao_leads
  add column if not exists comissao boolean not null default false;
