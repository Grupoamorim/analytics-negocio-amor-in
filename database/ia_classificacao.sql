-- =====================================================================
-- Coluna pra guardar a classificação de DRE feita pela IA (Gemini),
-- calculada uma única vez por lançamento (ver collectors/ia_classificador.py).
-- Cole este arquivo no Supabase SQL Editor e execute.
-- =====================================================================

alter table public.contas_pagar
  add column if not exists grupo_dre text,
  add column if not exists grupo_dre_classificado_em timestamptz;

create index if not exists idx_contas_pagar_grupo_dre_pendente
  on public.contas_pagar (id)
  where grupo_dre is null;
