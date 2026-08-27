-- Toda turma com funil_status = 'Convertido' precisa ter um deal em stage-6
-- (Fechou ou Perdeu) com outcome = 'ganho'; 'Perdido' o mesmo com outcome =
-- 'perdido'. Isso já acontecia quando o fechamento passava pelo Kanban ou
-- pelo sge_auto_win.py, mas turmas que entram Convertido direto (import/SGE
-- sem nunca criar deal) ficavam sem representação nenhuma no funil. Esse
-- gatilho garante consistência não importa o caminho que setou o status.
create or replace function sincronizar_deal_com_funil_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  outcome_alvo text;
  deal_existente uuid;
begin
  if new.funil_status not in ('Convertido', 'Perdido') then
    return new;
  end if;

  outcome_alvo := case when new.funil_status = 'Convertido' then 'ganho' else 'perdido' end;

  select id into deal_existente from deals where turma_id = new.id limit 1;

  if deal_existente is null then
    insert into deals (turma_id, titulo, stage, outcome, value)
    values (
      new.id,
      trim(both ' ' from coalesce(new.curso, '') || ' ' || coalesce(new.faculdade, '') || ' ' || coalesce(new.turma, '')),
      'stage-6',
      outcome_alvo,
      0
    );
  else
    update deals
    set stage = 'stage-6', outcome = outcome_alvo
    where id = deal_existente
      and (stage <> 'stage-6' or outcome is distinct from outcome_alvo);
  end if;

  return new;
end;
$$;

drop trigger if exists on_turma_funil_status_fecha on turmas;
create trigger on_turma_funil_status_fecha
  after insert or update of funil_status on turmas
  for each row execute function sincronizar_deal_com_funil_status();
