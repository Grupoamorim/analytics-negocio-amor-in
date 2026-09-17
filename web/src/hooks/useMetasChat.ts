import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

const db = supabase as any

export interface MetaChatConversa {
  id: string
  titulo: string
  createdAt: string
  updatedAt: string
}

export interface MetaChatMensagem {
  id: string
  conversaId: string
  role: 'user' | 'model'
  conteudo: string
  createdAt: string
}

function mapConversa(r: any): MetaChatConversa {
  return { id: r.id, titulo: r.titulo, createdAt: r.created_at, updatedAt: r.updated_at }
}

function mapRow(r: any): MetaChatMensagem {
  return { id: r.id, conversaId: r.conversa_id, role: r.role, conteudo: r.conteudo, createdAt: r.created_at }
}

/** Primeiras palavras da primeira mensagem do usuário viram o título — só até ter um título de
 * verdade, o usuário pode ver "Nova conversa" piscando na lista por uma fração de segundo. */
function tituloDe(conteudo: string): string {
  const t = conteudo.trim().replace(/\s+/g, ' ')
  return t.length > 60 ? `${t.slice(0, 57)}...` : t || 'Nova conversa'
}

/** Consultor de Metas — várias conversas guardadas (como abas), compartilhadas por todo mundo que
 * tem acesso à aba (é conhecimento da empresa, não anotação pessoal). Ao contrário do chat
 * flutuante "AMOR IN IA" (esquece tudo ao recarregar), aqui tudo persiste em
 * `metas_chat_conversas`/`metas_chat_mensagens`, e dá pra apagar mensagem, apagar conversa
 * inteira e trocar entre conversas guardadas. */
export function useMetasChat() {
  const [conversas, setConversas] = useState<MetaChatConversa[]>([])
  const [conversaId, setConversaIdState] = useState<string | null>(null)
  const [mensagens, setMensagens] = useState<MetaChatMensagem[]>([])
  const [loading, setLoading] = useState(true)
  // `enviar` precisa saber, DE FORMA SÍNCRONA, se uma conversa acabou de ser criada por uma
  // chamada anterior sua dentro do MESMO handleEnviar (user -> model, uma logo após a outra,
  // antes de qualquer re-render) — depender só do state `conversaId` faz a 2ª chamada ainda ver
  // o valor antigo (null) e criar uma SEGUNDA conversa nova em vez de usar a que a 1ª acabou de
  // criar. A ref sempre reflete o valor mais atual, independente de re-render.
  const conversaIdRef = useRef<string | null>(null)
  const setConversaId = useCallback((id: string | null) => {
    conversaIdRef.current = id
    setConversaIdState(id)
  }, [])

  const carregarConversas = useCallback(async (): Promise<MetaChatConversa[]> => {
    const { data } = await db.from('metas_chat_conversas').select('*').order('updated_at', { ascending: false })
    const lista = (data || []).map(mapConversa)
    setConversas(lista)
    return lista
  }, [])

  const carregarMensagens = useCallback(async (id: string) => {
    const { data } = await db
      .from('metas_chat_mensagens')
      .select('*')
      .eq('conversa_id', id)
      .order('created_at', { ascending: true })
    setMensagens((data || []).map(mapRow))
  }, [])

  const selecionarConversa = useCallback(
    async (id: string) => {
      setLoading(true)
      setConversaId(id)
      await carregarMensagens(id)
      setLoading(false)
    },
    [carregarMensagens, setConversaId],
  )

  // Ao abrir a tela: carrega a lista de conversas e entra na mais recente. Sem nenhuma
  // conversa ainda (primeiro uso), fica em estado "nova conversa" (conversaId null) — a
  // primeira mensagem enviada é que cria a conversa de verdade.
  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const lista = await carregarConversas()
      if (lista.length > 0) {
        setConversaId(lista[0].id)
        await carregarMensagens(lista[0].id)
      }
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Limpa a tela pra uma conversa nova — não grava nada no banco ainda, só quando a primeira
   * mensagem for enviada (evita acumular conversa vazia na lista). */
  const novaConversa = useCallback(() => {
    setConversaId(null)
    setMensagens([])
  }, [setConversaId])

  const excluirConversa = useCallback(
    async (id: string) => {
      const { error } = await db.from('metas_chat_conversas').delete().eq('id', id)
      if (error) throw error
      const restantes = await carregarConversas()
      if (conversaIdRef.current === id) {
        if (restantes.length > 0) await selecionarConversa(restantes[0].id)
        else {
          setConversaId(null)
          setMensagens([])
        }
      }
    },
    [carregarConversas, selecionarConversa, setConversaId],
  )

  const excluirMensagem = useCallback(async (id: string) => {
    const { error } = await db.from('metas_chat_mensagens').delete().eq('id', id)
    if (error) throw error
    setMensagens((prev) => prev.filter((m) => m.id !== id))
  }, [])

  const enviar = useCallback(
    async (role: 'user' | 'model', conteudo: string) => {
      // Lê/escreve pela ref (não pelo state fechado no closure) — dentro do mesmo handleEnviar,
      // "user" e "model" são enviadas uma logo após a outra, antes de qualquer re-render, e o
      // state `conversaId` só reflete a criação da 1ª mensagem depois do componente re-renderizar.
      let idAtual = conversaIdRef.current
      if (!idAtual) {
        const { data: novaConv, error: erroConv } = await db
          .from('metas_chat_conversas')
          .insert({ titulo: tituloDe(conteudo) })
          .select()
          .single()
        if (erroConv) throw erroConv
        idAtual = novaConv.id
        setConversaId(idAtual)
        setConversas((prev) => [mapConversa(novaConv), ...prev])
      }
      const { data, error } = await db
        .from('metas_chat_mensagens')
        .insert({ role, conteudo, conversa_id: idAtual })
        .select()
        .single()
      if (error) throw error
      const nova = mapRow(data)
      setMensagens((prev) => [...prev, nova])
      // Só toca updated_at (pra reordenar a lista) — não precisa esperar isso terminar.
      db.from('metas_chat_conversas').update({ updated_at: new Date().toISOString() }).eq('id', idAtual).then(() => {})
      setConversas((prev) => {
        const alvo = prev.find((c) => c.id === idAtual)
        if (!alvo) return prev
        return [{ ...alvo, updatedAt: new Date().toISOString() }, ...prev.filter((c) => c.id !== idAtual)]
      })
      return nova
    },
    [setConversaId],
  )

  return {
    conversas,
    conversaId,
    mensagens,
    loading,
    enviar,
    novaConversa,
    selecionarConversa,
    excluirConversa,
    excluirMensagem,
  }
}
