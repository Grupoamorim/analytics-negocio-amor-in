-- =====================================================================
-- Perfis de usuário e cargos (admin, financeiro, comercial, membro).
-- O primeiro usuário a se cadastrar no sistema vira admin automático
-- (é você, o dono). Todos os próximos entram como "membro" até o admin
-- mudar o cargo deles na tela de Administração.
-- =====================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nome text,
  role text not null default 'membro' check (role in ('admin', 'financeiro', 'comercial', 'membro')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at_column();

-- Cria o perfil automaticamente quando alguém se cadastra. O primeiro
-- usuário do sistema vira admin; os demais entram como "membro".
create or replace function public.criar_perfil_novo_usuario()
returns trigger as $$
begin
  insert into public.profiles (id, email, nome, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    case when not exists (select 1 from public.profiles) then 'admin' else 'membro' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();

-- Função auxiliar (security definer) pra checar se o usuário logado é
-- admin, sem cair em recursão de RLS dentro da própria política.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

alter table public.profiles enable row level security;

drop policy if exists "Qualquer autenticado ve perfis" on public.profiles;
create policy "Qualquer autenticado ve perfis"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "Admin gerencia todos os perfis" on public.profiles;
create policy "Admin gerencia todos os perfis"
  on public.profiles for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Usuario atualiza proprio nome" on public.profiles;
create policy "Usuario atualiza proprio nome"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Se você já criou sua conta antes de rodar esta migração, isso garante
-- que ela vire admin mesmo assim (idempotente, seguro rodar de novo).
insert into public.profiles (id, email, nome, role)
select id, email, split_part(email, '@', 1), 'admin'
from auth.users
where id not in (select id from public.profiles)
on conflict (id) do nothing;

-- Os dois e-mails donos do negócio são sempre administradores gerais,
-- com todas as permissões, independente de quem criou a conta primeiro.
-- Seguro rodar de novo a qualquer momento (idempotente) — só faz efeito
-- se/quando essas contas já existirem em auth.users.
update public.profiles
set role = 'admin'
where email in ('lucasamorimfotografia@gmail.com', 'adm@lucasamorim.com.br');
