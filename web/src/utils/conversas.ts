// Conversas de WhatsApp arquivadas por turma (alimentadas pela extensão do Chrome
// via Edge Function `whatsapp-sync`). Tabelas: `conversas_whatsapp` + `conversa_grupos`.
import { supabase } from '@/lib/supabase/client'
import { fetchAllRows } from '@/utils/fetchAllRows'

const db = supabase as any

export interface ConversaMsg {
  id: string
  turmaId: string | null
  contatoId: string | null
  origem: 'dm' | 'grupo'
  chatWaId: string
  grupoNome: string | null
  waMsgId: string
  deMim: boolean
  direcao: 'enviada' | 'recebida'
  autorNome: string | null
  autorTelefone: string | null
  tipo: string
  texto: string | null
  transcrito: boolean
  midiaUrl: string | null
  enviadaEm: string
  vendedorId: string | null
}

export interface ConversaGrupo {
  grupoWaId: string
  grupoNome: string
  turmaId: string | null
  vinculo: 'pendente' | 'auto' | 'manual'
  ignorar: boolean
  ultimaSync: string | null
}

function mapMsg(r: any): ConversaMsg {
  return {
    id: r.id,
    turmaId: r.turma_id,
    contatoId: r.contato_id,
    origem: r.origem,
    chatWaId: r.chat_wa_id,
    grupoNome: r.grupo_nome,
    waMsgId: r.wa_msg_id,
    deMim: !!r.de_mim,
    direcao: r.direcao,
    autorNome: r.autor_nome,
    autorTelefone: r.autor_telefone,
    tipo: r.tipo,
    texto: r.texto,
    transcrito: !!r.transcrito,
    midiaUrl: r.midia_url,
    enviadaEm: r.enviada_em,
    vendedorId: r.vendedor_id,
  }
}

function mapGrupo(r: any): ConversaGrupo {
  return {
    grupoWaId: r.grupo_wa_id,
    grupoNome: r.grupo_nome || '',
    turmaId: r.turma_id,
    vinculo: r.vinculo,
    ignorar: !!r.ignorar,
    ultimaSync: r.ultima_sync,
  }
}

/** Todas as mensagens de uma turma, da mais antiga pra mais nova. */
export async function fetchConversasTurma(turmaId: string): Promise<ConversaMsg[]> {
  const rows = await fetchAllRows<any>(() =>
    db
      .from('conversas_whatsapp')
      .select('*')
      .eq('turma_id', turmaId)
      .order('enviada_em', { ascending: true }),
  )
  return rows.map(mapMsg)
}

/** Todas as mensagens (pra métricas globais). */
export async function fetchTodasConversas(): Promise<ConversaMsg[]> {
  const rows = await fetchAllRows<any>(() =>
    db.from('conversas_whatsapp').select('*').order('enviada_em', { ascending: true }),
  )
  return rows.map(mapMsg)
}

export async function fetchGruposPendentes(): Promise<ConversaGrupo[]> {
  const { data } = await db
    .from('conversa_grupos')
    .select('*')
    .is('turma_id', null)
    .eq('ignorar', false)
    .order('updated_at', { ascending: false })
  return (data || []).map(mapGrupo)
}

export async function fetchGruposDaTurma(turmaId: string): Promise<ConversaGrupo[]> {
  const { data } = await db.from('conversa_grupos').select('*').eq('turma_id', turmaId)
  return (data || []).map(mapGrupo)
}

/** Liga um grupo do WhatsApp a uma turma e reatribui as mensagens já arquivadas. */
export async function vincularGrupo(grupoWaId: string, turmaId: string): Promise<void> {
  await db
    .from('conversa_grupos')
    .update({ turma_id: turmaId, vinculo: 'manual', ignorar: false, updated_at: new Date().toISOString() })
    .eq('grupo_wa_id', grupoWaId)
  await db.from('conversas_whatsapp').update({ turma_id: turmaId }).eq('chat_wa_id', grupoWaId).is('turma_id', null)
}

export async function desvincularGrupo(grupoWaId: string): Promise<void> {
  await db
    .from('conversa_grupos')
    .update({ turma_id: null, vinculo: 'pendente', updated_at: new Date().toISOString() })
    .eq('grupo_wa_id', grupoWaId)
}

export async function ignorarGrupo(grupoWaId: string): Promise<void> {
  await db
    .from('conversa_grupos')
    .update({ ignorar: true, updated_at: new Date().toISOString() })
    .eq('grupo_wa_id', grupoWaId)
}

const norm = (s: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Grupos pendentes cujo nome lembra o nome desta turma (pra sugerir vínculo). */
export function gruposQueBatemComTurma(
  pendentes: ConversaGrupo[],
  turma: { curso?: string; faculdade?: string; turma?: string; anoFormatura?: string | number },
): ConversaGrupo[] {
  const toks = [turma.curso, turma.faculdade, turma.turma, turma.anoFormatura]
    .filter((v) => v != null && String(v).trim() !== '')
    .flatMap((v) => norm(String(v)).split(' '))
    .filter(Boolean)
  if (toks.length < 2) return []
  return pendentes.filter((g) => {
    const n = norm(g.grupoNome)
    const hits = toks.filter((t) => n.includes(t)).length
    return hits >= Math.min(2, toks.length)
  })
}
