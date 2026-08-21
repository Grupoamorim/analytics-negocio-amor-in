-- =====================================================================
-- A tabela `turmas` já existe (usada pelo sync do SGE: codigo, nome,
-- instituicao, meta_vendas, etc.) mas o CRM novo em React precisa de
-- colunas extras (faculdade, cidade, contato, estágio do funil...)
-- que nunca foram criadas — por isso aparecia o erro "column
-- turmas_1.faculdade does not exist" no Dashboard.
--
-- Este script só ADICIONA colunas novas (todas opcionais), sem alterar
-- ou remover nada que o coletor do SGE já usa. Uma turma passa a ter
-- tanto os dados financeiros (vindos do SGE) quanto os dados de CRM
-- (preenchidos pela equipe de vendas) na mesma linha.
-- =====================================================================

alter table public.turmas
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists empresa text,
  add column if not exists faculdade text,
  add column if not exists turma text,
  add column if not exists ano_formatura text,
  add column if not exists cidade text,
  add column if not exists funil_status text,
  add column if not exists contato_nome text,
  add column if not exists contato_telefone text,
  add column if not exists sdr text,
  add column if not exists closer text,
  add column if not exists observacoes text,
  add column if not exists concorrentes text,
  add column if not exists tipo_servico text,
  add column if not exists como_conheceu text,
  add column if not exists proposta_link text,
  add column if not exists alunos_fechados integer default 0,
  add column if not exists data_cadastro text,
  add column if not exists primeiro_contato text,
  add column if not exists fechamento_contrato text,
  add column if not exists codigo_sge text;

create index if not exists idx_turmas_user_id on public.turmas(user_id);
create index if not exists idx_turmas_funil_status on public.turmas(funil_status);

-- Garante que qualquer pessoa autenticada (toda a equipe) possa ler e
-- escrever nas turmas pelo CRM, mesmo padrão já usado em
-- pagamentos/contas_pagar/deals/contatos/notas/transcricoes.
alter table public.turmas enable row level security;

drop policy if exists "Apenas autenticados" on public.turmas;
create policy "Apenas autenticados" on public.turmas for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
