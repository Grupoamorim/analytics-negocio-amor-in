-- =====================================================================
-- Suporte a "Ações de Captação" (Mapa de Mercado): formulários públicos
-- específicos por curso/evento (ex: ação de Direito), com fluxo mais
-- rápido que o link de captação normal e redirecionamento pro grupo do
-- WhatsApp ao final.
-- =====================================================================

-- De onde veio o lead (ex: 'direito' = ação de Direito) e uma nota livre
-- (semestre informado quando não achou a turma, ou o status da turma que
-- ela escolheu no momento do cadastro) — só informativo pro time.
alter table public.captacao_leads
  add column if not exists origem text,
  add column if not exists observacao text;

-- View pública igual `turmas_captacao`, mas incluindo turmas já fechadas
-- (Convertido) e perdidas (Perdido) + o status do funil, pro formulário da
-- ação colorir a lista (verde = já é nossa, vermelho = perdemos antes,
-- azul = ainda em prospecção). `turmas_captacao` continua como está,
-- usada pelo link de captação normal (só turmas em aberto).
create or replace view public.turmas_captacao_status as
select id, curso, faculdade, turma, ano_formatura, cidade, empresa, funil_status
from public.turmas
where concluida is not true;

grant select on public.turmas_captacao_status to anon, authenticated;
