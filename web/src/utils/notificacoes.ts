// Notificações reais dentro do programa (tabela `notificacoes`) — hoje
// usadas pra avisar quando alguém vira Responsável por uma turma no Funil.
import { supabase } from '@/lib/supabase/client'

export interface Notificacao {
  id: string
  titulo: string
  mensagem: string | null
  link: string | null
  lida: boolean
  createdAt: string
}

function mapRow(row: {
  id: string
  titulo: string
  mensagem: string | null
  link: string | null
  lida: boolean
  created_at: string
}): Notificacao {
  return {
    id: row.id,
    titulo: row.titulo,
    mensagem: row.mensagem,
    link: row.link,
    lida: row.lida,
    createdAt: row.created_at,
  }
}

export async function listarNotificacoes(limite = 20): Promise<Notificacao[]> {
  const { data, error } = await supabase
    .from('notificacoes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limite)
  if (error || !data) return []
  return data.map(mapRow)
}

export async function marcarNotificacaoLida(id: string): Promise<void> {
  await supabase.from('notificacoes').update({ lida: true }).eq('id', id)
}

export async function marcarTodasNotificacoesLidas(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await supabase.from('notificacoes').update({ lida: true }).in('id', ids)
}

/** Dispara e-mail + notificação real pro novo responsável de uma turma. Fire-and-forget. */
export async function notificarNovoResponsavel(params: {
  novoResponsavelId: string
  turmaNome: string
  turmaId?: string
  atribuidoPorNome?: string
}): Promise<void> {
  try {
    await supabase.functions.invoke('notificar-responsavel', { body: params })
  } catch (err) {
    console.error('Erro ao notificar novo responsável:', err)
  }
}
