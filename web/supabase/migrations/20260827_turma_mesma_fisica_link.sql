-- Duas linhas de `turmas` podem representar a MESMA turma física fechada com
-- pacotes/vendas diferentes (2 códigos de venda no SGE para o mesmo grupo de
-- formandos). Cada linha continua com seus próprios clientes/pagamentos reais
-- (dinheiro e alunos não são somados nem migrados), mas pra contagem de
-- "quantidade de turmas" (Total/Ganhas/Perdidas) elas devem contar como UMA
-- turma só. Esse campo, preenchido só na linha "secundária", aponta pra linha
-- "principal" da mesma turma física.
alter table turmas
  add column mesma_turma_fisica_de uuid references turmas(id) on delete set null;

comment on column turmas.mesma_turma_fisica_de is
  'Se preenchido, esta linha é a mesma turma física da linha referenciada (pacote/venda separado no SGE) - não contar como turma adicional em métricas de contagem de turmas.';
