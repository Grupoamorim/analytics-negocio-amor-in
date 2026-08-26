-- =====================================================================
-- Contador de "não respondeu" por contato + automações do Funil ligadas
-- à criação/atualização de contatos:
--
-- 1. Sempre que um contato novo é criado numa turma (via link de Captação
--    ou cadastro manual pelo time - os dois caminhos passam por um INSERT
--    em `contatos`), a turma sai de Prospecção e vai pra
--    Qualificação/Contato automaticamente. Só mexe se ainda estiver em
--    Prospecção - não regride uma turma que já avançou mais no funil.
--
-- 2. Cada contato tem seu próprio contador de "não respondeu"
--    (nao_responde_count). Quando o contador de QUALQUER contato daquela
--    turma cruza pra 3 (ou mais), a turma volta sozinha pra Prospecção.
--    Zerar o contador (marcar que a pessoa respondeu) não mexe no
--    estágio - fica onde o time deixou.
-- =====================================================================

alter table contatos add column if not exists nao_responde_count integer not null default 0;

create or replace function mover_turma_para_qualificacao_ao_criar_contato()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update deals
  set stage = 'qualificacao-contato', updated_at = now()
  where turma_id = new.turma_id and stage = 'prospeccao';
  return new;
end;
$$;

drop trigger if exists on_contato_criado_move_qualificacao on contatos;
create trigger on_contato_criado_move_qualificacao
  after insert on contatos
  for each row execute function mover_turma_para_qualificacao_ao_criar_contato();

create or replace function voltar_turma_para_prospeccao_se_nao_responde()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.nao_responde_count >= 3 and (old.nao_responde_count is distinct from new.nao_responde_count) then
    update deals
    set stage = 'prospeccao', updated_at = now()
    where turma_id = new.turma_id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_contato_nao_responde_volta_prospeccao on contatos;
create trigger on_contato_nao_responde_volta_prospeccao
  after update of nao_responde_count on contatos
  for each row execute function voltar_turma_para_prospeccao_se_nao_responde();

-- Atualiza o trigger de captação (criado em 20260826_captacao_cria_turma_no_funil.sql)
-- pra também criar o contato da pessoa que se cadastrou - isso já dispara
-- sozinho a passagem pra Qualificação/Contato via o trigger acima.
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
  ja_tem_contato boolean;
begin
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

  if coalesce(trim(new.nome), '') <> '' then
    select exists(
      select 1 from contatos
      where turma_id = nova_turma_id
        and nome = new.nome
        and coalesce(telefone,'') = coalesce(new.telefone,'')
    ) into ja_tem_contato;

    if not ja_tem_contato then
      insert into contatos (turma_id, nome, telefone, email)
      values (nova_turma_id, new.nome, nullif(new.telefone,''), nullif(new.email,''));
    end if;
  end if;

  return new;
end;
$$;
