-- =====================================================================
-- Quando um cliente se cadastra no formulário público de Captação, a turma
-- correspondente (curso+faculdade+turma+ano+cidade) já aparece sozinha em
-- Prospecção no Funil, em vez de ficar só na lista de captação sem conexão
-- com o funil comercial.
--
-- O formulário público (CaptacaoForm.tsx) roda sem login (anon), e a
-- policy de `turmas` só permite INSERT para usuários autenticados - por
-- isso a criação da turma acontece aqui, via trigger SECURITY DEFINER em
-- captacao_leads, e não direto no client.
-- =====================================================================

create or replace function criar_turma_e_deal_de_captacao()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  turma_existente_id uuid;
  nova_turma_id uuid;
  ja_tem_deal boolean;
begin
  -- Sem os campos essenciais pra identificar a turma, não inventamos nada.
  if coalesce(trim(new.curso), '') = ''
     or coalesce(trim(new.faculdade), '') = ''
     or coalesce(trim(new.turma), '') = ''
     or coalesce(trim(new.ano_formatura), '') = ''
     or coalesce(trim(new.cidade), '') = ''
  then
    return new;
  end if;

  select id into turma_existente_id
  from turmas
  where curso = new.curso
    and faculdade = new.faculdade
    and turma = new.turma
    and ano_formatura = new.ano_formatura
    and cidade = new.cidade
  limit 1;

  if turma_existente_id is null then
    insert into turmas (
      codigo, nome, curso, faculdade, turma, ano_formatura, cidade,
      empresa, funil_status, sdr, total_alunos
    ) values (
      'turma-captacao-' || new.id::text,
      trim(new.curso || ' ' || new.faculdade || ' ' || new.turma),
      new.curso, new.faculdade, new.turma, new.ano_formatura, new.cidade,
      'AFF', 'Novo', nullif(new.sdr, ''), 0
    )
    returning id into nova_turma_id;
  else
    nova_turma_id := turma_existente_id;
  end if;

  select exists(select 1 from deals where turma_id = nova_turma_id) into ja_tem_deal;

  if not ja_tem_deal then
    insert into deals (turma_id, titulo, value, stage, probability)
    values (
      nova_turma_id,
      trim(new.curso || ' ' || new.faculdade || ' ' || new.turma),
      0, 'prospeccao', 20
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_captacao_lead_cria_turma on captacao_leads;
create trigger on_captacao_lead_cria_turma
  after insert on captacao_leads
  for each row execute function criar_turma_e_deal_de_captacao();
