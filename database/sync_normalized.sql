-- =====================================================================
-- SINCRONIZAÇÃO NORMALIZADA: sge_* -> turmas, clientes, vendas,
-- pagamentos, contas_pagar + views vw_* lidas pelo dashboard
--
-- Versão corrigida (2026-08): o status real de cada lançamento vindo do
-- SGE (cancelado, estornado, etc.) agora é preservado. Antes, o status
-- em `pagamentos` e `contas_pagar` era recalculado do zero olhando só
-- as datas de vencimento/pagamento — então uma venda ou despesa
-- cancelada no SGE continuava contando como "pendente" nos relatórios,
-- inflando receita e despesa. Esse arquivo substitui o script antigo
-- (não versionado) que criou a função e os triggers pela primeira vez.
--
-- Como aplicar: cole este arquivo inteiro no Supabase SQL Editor do
-- projeto "Analytics negocio AMOR IN" e clique em Executar. É seguro
-- rodar de novo (idempotente) sempre que este arquivo for atualizado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) FUNÇÃO: sincroniza dados normalizados a partir das tabelas sge_*
-- ---------------------------------------------------------------------
create or replace function public.sync_normalized_from_sge()
returns void
language plpgsql
security definer
as $$
begin
  -- ---- TURMAS: códigos distintos vindos de todas as fontes SGE ----
  insert into public.turmas (codigo, nome)
  select distinct turma_codigo, turma_codigo
  from (
    select turma as turma_codigo from public.sge_contas_receber where turma is not null and turma <> ''
    union
    select turma as turma_codigo from public.sge_vendas        where turma is not null and turma <> ''
    union
    select turma as turma_codigo from public.sge_adesoes       where turma is not null and turma <> ''
  ) sub_turmas
  on conflict (codigo) do nothing;

  -- ---- CLIENTES: pessoas distintas (CPF como chave de deduplicação) ----
  insert into public.clientes (codigo_sge, nome)
  select distinct on (cpf_codigo) cpf_codigo, nome_cliente
  from (
    select cpf_cliente as cpf_codigo, cliente as nome_cliente from public.sge_contas_receber where cpf_cliente is not null and cpf_cliente <> ''
    union
    select cpf_cliente as cpf_codigo, cliente as nome_cliente from public.sge_vendas         where cpf_cliente is not null and cpf_cliente <> ''
    union
    select cpf_cliente as cpf_codigo, cliente as nome_cliente from public.sge_adesoes        where cpf_cliente is not null and cpf_cliente <> ''
  ) sub_clientes
  on conflict (codigo_sge) do nothing;

  -- ---- VENDAS ----
  -- Preserva o status vindo do SGE (ativo, cancelado, concluido, ...) sem recalcular.
  insert into public.vendas (codigo_sge, turma_id, cliente_id, data_venda, valor_total, valor_entrada, num_parcelas, status, produto, vendedor)
  select
    v.codigo_sge,
    tu.id,
    cl.id,
    coalesce(v.data_venda, current_date),
    coalesce(v.valor_total, 0),
    coalesce(v.valor_entrada, 0),
    coalesce(v.num_parcelas, 1),
    coalesce(nullif(v.status, ''), 'ativo'),
    v.produto,
    v.vendedor
  from public.sge_vendas v
  left join public.turmas   tu on tu.codigo = v.turma
  left join public.clientes cl on cl.codigo_sge = v.cpf_cliente
  on conflict (codigo_sge) do update set
    turma_id      = excluded.turma_id,
    cliente_id    = excluded.cliente_id,
    data_venda    = excluded.data_venda,
    valor_total   = excluded.valor_total,
    valor_entrada = excluded.valor_entrada,
    num_parcelas  = excluded.num_parcelas,
    status        = excluded.status,
    produto       = excluded.produto,
    vendedor      = excluded.vendedor,
    updated_at    = now();

  -- ---- PAGAMENTOS (a partir de contas a receber) ----
  -- Se o SGE já marcou o lançamento como cancelado/estornado, isso é
  -- respeitado e vira status 'cancelado' (nunca contado como receita).
  -- Só quando NÃO está cancelado é que o status é derivado das datas.
  insert into public.pagamentos (codigo_sge, turma_id, cliente_id, venda_id, data_vencimento, data_pagamento, valor, valor_pago, status, forma_pagamento, num_parcela)
  select
    r.codigo_sge,
    tu.id,
    cl.id,
    null,
    r.data_vencimento,
    r.data_pagamento,
    coalesce(r.valor, 0),
    coalesce(r.valor_pago, 0),
    case
      when lower(coalesce(r.status, '')) ~ 'cancel|estorn' then 'cancelado'
      when coalesce(r.valor_pago,0) > 0 and coalesce(r.valor_pago,0) >= coalesce(r.valor,0) then 'pago'
      when r.data_vencimento < current_date and coalesce(r.valor_pago,0) < coalesce(r.valor,0) then 'atrasado'
      else 'pendente'
    end,
    nullif(r.forma_pagamento, ''),
    coalesce(r.num_parcela, 1)
  from public.sge_contas_receber r
  left join public.turmas   tu on tu.codigo = r.turma
  left join public.clientes cl on cl.codigo_sge = r.cpf_cliente
  where r.data_vencimento is not null
  on conflict (codigo_sge) do update set
    turma_id        = excluded.turma_id,
    cliente_id      = excluded.cliente_id,
    data_vencimento = excluded.data_vencimento,
    data_pagamento  = excluded.data_pagamento,
    valor           = excluded.valor,
    valor_pago      = excluded.valor_pago,
    status          = excluded.status,
    forma_pagamento = excluded.forma_pagamento,
    num_parcela     = excluded.num_parcela,
    updated_at      = now();

  -- ---- CONTAS A PAGAR ----
  -- Mesma correção: cancelado/estornado no SGE vira status 'cancelado'
  -- aqui, em vez de ser recalculado como pendente/atrasado pela data.
  insert into public.contas_pagar (codigo_sge, turma_id, descricao, fornecedor, categoria, valor, data_vencimento, data_pagamento, status)
  select
    p.codigo_sge,
    null,
    coalesce(nullif(p.descricao, ''), 'Sem descrição'),
    nullif(p.fornecedor, ''),
    nullif(p.categoria, ''),
    coalesce(p.valor, 0),
    p.data_vencimento,
    p.data_pagamento,
    case
      when lower(coalesce(p.status, '')) ~ 'cancel|estorn' then 'cancelado'
      when p.data_pagamento is not null then 'pago'
      when p.data_vencimento is not null and p.data_vencimento < current_date then 'atrasado'
      else 'pendente'
    end
  from public.sge_contas_pagar p
  on conflict (codigo_sge) do update set
    descricao       = excluded.descricao,
    fornecedor      = excluded.fornecedor,
    categoria       = excluded.categoria,
    valor           = excluded.valor,
    data_vencimento = excluded.data_vencimento,
    data_pagamento  = excluded.data_pagamento,
    status          = excluded.status,
    updated_at      = now();

  -- ---- Atualiza estatísticas agregadas em turmas ----
  update public.turmas tu set
    total_alunos = coalesce((select count(distinct cl.id) from public.clientes cl where cl.turma_id = tu.id), 0)
  where true;

end;
$$;

-- ---------------------------------------------------------------------
-- 2) TRIGGERS: disparam a sincronização automaticamente após cada sync
--    do coletor SGE (não exige nenhuma alteração no Python no futuro)
-- ---------------------------------------------------------------------
create or replace function public.trg_sync_normalized()
returns trigger
language plpgsql
as $$
begin
  perform public.sync_normalized_from_sge();
  return null;
end;
$$;

drop trigger if exists trg_sge_contas_receber_sync on public.sge_contas_receber;
create trigger trg_sge_contas_receber_sync
after insert or update on public.sge_contas_receber
for each statement
execute function public.trg_sync_normalized();

drop trigger if exists trg_sge_contas_pagar_sync on public.sge_contas_pagar;
create trigger trg_sge_contas_pagar_sync
after insert or update on public.sge_contas_pagar
for each statement
execute function public.trg_sync_normalized();

drop trigger if exists trg_sge_vendas_sync on public.sge_vendas;
create trigger trg_sge_vendas_sync
after insert or update on public.sge_vendas
for each statement
execute function public.trg_sync_normalized();

drop trigger if exists trg_sge_adesoes_sync on public.sge_adesoes;
create trigger trg_sge_adesoes_sync
after insert or update on public.sge_adesoes
for each statement
execute function public.trg_sync_normalized();

-- ---------------------------------------------------------------------
-- 3) VIEWS lidas pelo dashboard
-- ---------------------------------------------------------------------

-- total_vendido agora vem de `vendas` (valor efetivamente contratado),
-- não mais da soma das parcelas — e todas as somas excluem 'cancelado'.
drop view if exists public.vw_resumo_turmas;
create view public.vw_resumo_turmas as
select
  t.id,
  t.nome,
  t.status,
  t.meta_vendas,
  coalesce(v_agg.total_vendido, 0)      as total_vendido,
  coalesce(p_agg.total_recebido, 0)     as total_recebido,
  coalesce(p_agg.total_a_receber, 0)    as total_a_receber,
  coalesce(p_agg.total_inadimplente, 0) as total_inadimplente,
  coalesce(c_agg.total_custos, 0)       as total_custos,
  case when t.meta_vendas > 0
       then round(coalesce(v_agg.total_vendido, 0) / t.meta_vendas * 100, 1)
       else 0
  end as pct_meta
from public.turmas t
left join (
  select turma_id, sum(valor_total) as total_vendido
  from public.vendas
  where turma_id is not null and status <> 'cancelado'
  group by turma_id
) v_agg on v_agg.turma_id = t.id
left join (
  select
    turma_id,
    sum(valor_pago) filter (where status <> 'cancelado')                        as total_recebido,
    sum(valor - valor_pago) filter (where status in ('pendente', 'atrasado'))    as total_a_receber,
    sum(valor - valor_pago) filter (where status = 'atrasado')                  as total_inadimplente
  from public.pagamentos
  where turma_id is not null
  group by turma_id
) p_agg on p_agg.turma_id = t.id
left join (
  select turma_id, sum(valor) as total_custos
  from public.contas_pagar
  where turma_id is not null and status <> 'cancelado'
  group by turma_id
) c_agg on c_agg.turma_id = t.id;

-- Faturamento mensal por competência (data de vencimento, exclui cancelado)
-- e recebido por caixa (data de pagamento), lado a lado.
drop view if exists public.vw_faturamento_mensal;
create view public.vw_faturamento_mensal as
select
  to_char(date_trunc('month', coalesce(fat.mes_venc, rec.mes_pgto)), 'YYYY-MM') as mes,
  coalesce(fat.faturamento_bruto, 0) as faturamento_bruto,
  coalesce(rec.recebido, 0)          as recebido
from (
  select date_trunc('month', data_vencimento) as mes_venc, sum(valor) as faturamento_bruto
  from public.pagamentos
  where status <> 'cancelado'
  group by 1
) fat
full outer join (
  select date_trunc('month', data_pagamento) as mes_pgto, sum(valor_pago) as recebido
  from public.pagamentos
  where status = 'pago' and data_pagamento is not null
  group by 1
) rec on rec.mes_pgto = fat.mes_venc
order by 1;

drop view if exists public.vw_inadimplencia;
create view public.vw_inadimplencia as
select
  coalesce(cl.nome, 'Não identificado') as cliente,
  coalesce(t.nome, '-') as turma,
  p.data_vencimento,
  (p.valor - p.valor_pago)::numeric(12,2) as valor,
  greatest((current_date - p.data_vencimento)::int, 0) as dias_atraso
from public.pagamentos p
left join public.clientes cl on cl.id = p.cliente_id
left join public.turmas   t  on t.id  = p.turma_id
where p.status = 'atrasado'
order by dias_atraso desc;

-- ---------------------------------------------------------------------
-- 4) Executa a sincronização agora, para reclassificar os dados já
--    existentes (cancelamentos que estavam contando errado até aqui)
-- ---------------------------------------------------------------------
select public.sync_normalized_from_sge();
