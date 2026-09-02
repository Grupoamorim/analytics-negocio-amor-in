// Resumo de atividade de WhatsApp por vendedor (pra aba "WhatsApp Comercial").
import type { ConversaMsg } from '@/utils/conversas'
import type { Deal } from '@/types/crm'

export interface ResumoVendedor {
  vendedorId: string
  nome: string
  enviadas: number
  recebidasNasConversas: number
  conversas: number
  turmasAtendidas: number
  audiosEnviados: number
  turmasFechadas: number
  taxaConversao: number
  ultimaAtividade: string | null
}

export function resumoPorVendedor(
  msgs: ConversaMsg[],
  deals: Deal[],
  usuarios: { id: string; nome: string }[],
): ResumoVendedor[] {
  const nomePorId = new Map(usuarios.map((u) => [u.id, u.nome]))
  const dealPorTurma = new Map<string, Deal>()
  for (const d of deals) if (d.leadId) dealPorTurma.set(d.leadId, d)

  const acc = new Map<
    string,
    {
      enviadas: number
      recebidas: number
      conversas: Set<string>
      turmas: Set<string>
      audios: number
      fechadas: Set<string>
      ultima: string | null
    }
  >()
  const get = (id: string) => {
    let a = acc.get(id)
    if (!a) {
      a = { enviadas: 0, recebidas: 0, conversas: new Set(), turmas: new Set(), audios: 0, fechadas: new Set(), ultima: null }
      acc.set(id, a)
    }
    return a
  }

  for (const m of msgs) {
    const vid = m.vendedorId
    if (!vid) continue
    const a = get(vid)
    a.conversas.add(m.chatWaId)
    if (m.turmaId) {
      a.turmas.add(m.turmaId)
      if (dealPorTurma.get(m.turmaId)?.outcome === 'ganho') a.fechadas.add(m.turmaId)
    }
    if (m.deMim) {
      a.enviadas++
      if (m.tipo === 'audio') a.audios++
      if (!a.ultima || m.enviadaEm > a.ultima) a.ultima = m.enviadaEm
    } else {
      a.recebidas++
    }
  }

  return [...acc.entries()]
    .map(([vendedorId, a]) => ({
      vendedorId,
      nome: nomePorId.get(vendedorId) || 'Usuário',
      enviadas: a.enviadas,
      recebidasNasConversas: a.recebidas,
      conversas: a.conversas.size,
      turmasAtendidas: a.turmas.size,
      audiosEnviados: a.audios,
      turmasFechadas: a.fechadas.size,
      taxaConversao: a.turmas.size ? a.fechadas.size / a.turmas.size : 0,
      ultimaAtividade: a.ultima,
    }))
    .sort((x, y) => y.enviadas - x.enviadas)
}
