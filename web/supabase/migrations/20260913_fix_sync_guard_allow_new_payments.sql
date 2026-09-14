-- Corrige a trava de sync_normalized_from_sge() que protege o período já verificado
-- manualmente (2026-01-01 a 2026-08-23, importado do xlsx em 24/08/2026).
--
-- Bug: a trava bloqueava PARA SEMPRE qualquer pagamento novo recebido depois de
-- 24/08/2026 de uma parcela cujo VENCIMENTO caísse dentro do período protegido
-- (ex: aluno atrasado numa parcela de julho que paga agora em setembro) — o
-- pagamento nunca entrava em `pagamentos`/`contas_pagar`, mesmo sendo dado novo
-- e legítimo. Só em setembro/2026 eram R$ 2.566,94 presos.
--
-- Fix: a trava continua protegendo qualquer codigo_sge que JÁ tem data_pagamento
-- preenchido em `pagamentos`/`contas_pagar` (nunca sobrescreve o valor verificado)
-- — mas agora deixa passar pagamentos novos (data_pagamento preenchido na fonte,
-- ainda sem contraparte paga no nosso lado), mesmo com vencimento no período
-- protegido.
create or replace function public.sync_normalized_from_sge()
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
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
    and (
      r.data_vencimento < '2026-01-01' or r.data_vencimento > '2026-08-23'
      or (
        r.data_pagamento is not null
        and not exists (
          select 1 from public.pagamentos px
          where px.codigo_sge = r.codigo_sge and px.data_pagamento is not null
        )
      )
    )
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
  where p.data_vencimento is null
    or (
      p.data_vencimento < '2026-01-01' or p.data_vencimento > '2026-08-23'
      or (
        p.data_pagamento is not null
        and not exists (
          select 1 from public.contas_pagar cx
          where cx.codigo_sge = p.codigo_sge and cx.data_pagamento is not null
        )
      )
    )
  on conflict (codigo_sge) do update set
    descricao       = excluded.descricao,
    fornecedor      = excluded.fornecedor,
    categoria       = excluded.categoria,
    valor           = excluded.valor,
    data_vencimento = excluded.data_vencimento,
    data_pagamento  = excluded.data_pagamento,
    status          = excluded.status,
    updated_at      = now();

  -- ---- CLIENTES: vincula turma_id e completa email/telefone (via sge_cobranca) ----
  update public.clientes cl set
    turma_id = coalesce(
      (select v.turma_id from public.vendas v where v.cliente_id = cl.id and v.turma_id is not null order by v.data_venda desc limit 1),
      (select p.turma_id from public.pagamentos p where p.cliente_id = cl.id and p.turma_id is not null order by p.data_vencimento desc limit 1)
    )
  where cl.turma_id is null;

  update public.clientes cl set
    email = cob.email
  from (
    select distinct on (cpf_cliente) cpf_cliente, nullif(email, '') as email
    from public.sge_cobranca
    where cpf_cliente is not null and cpf_cliente <> '' and nullif(email, '') is not null
    order by cpf_cliente, updated_at desc
  ) cob
  where cob.cpf_cliente = cl.codigo_sge
    and (cl.email is null or cl.email = '');

  update public.clientes cl set
    telefone = cob.telefone
  from (
    select distinct on (cpf_cliente) cpf_cliente, nullif(telefone, '') as telefone
    from public.sge_cobranca
    where cpf_cliente is not null and cpf_cliente <> '' and nullif(telefone, '') is not null
    order by cpf_cliente, updated_at desc
  ) cob
  where cob.cpf_cliente = cl.codigo_sge
    and (cl.telefone is null or cl.telefone = '');

  -- ---- Atualiza estatísticas agregadas em turmas ----
  update public.turmas tu set
    total_alunos    = coalesce((select count(distinct cl.id) from public.clientes cl where cl.turma_id = tu.id and coalesce(cl.status, 'ativo') = 'ativo'), 0),
    alunos_fechados = coalesce((select count(distinct cl.id) from public.clientes cl where cl.turma_id = tu.id and coalesce(cl.status, 'ativo') = 'ativo'), 0)
  where true;

end;
$function$
