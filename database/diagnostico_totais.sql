-- Diagnóstico: compara os totais de 4 fontes diferentes, lado a lado,
-- pra descobrir onde está a diferença entre o que o SGE mostra
-- (~R$ 1.040.651,13) e o que o dashboard está somando.
-- Só leitura — não altera nada no banco.

select 'sge_adesoes (bruto)' as fonte, count(*) as qtd, sum(valor) as soma
from public.sge_adesoes
where lower(coalesce(status,'')) !~ 'cancel|estorn'

union all

select 'sge_vendas (bruto)', count(*), sum(valor_total)
from public.sge_vendas
where lower(coalesce(status,'')) !~ 'cancel|estorn'

union all

select 'sge_contas_receber (bruto)', count(*), sum(valor)
from public.sge_contas_receber
where lower(coalesce(status,'')) !~ 'cancel|estorn'

union all

select 'pagamentos (normalizado, usado no dashboard)', count(*), sum(valor)
from public.pagamentos
where status <> 'cancelado';
