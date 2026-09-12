import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export interface MetaChatMensagem {
  id: string
  role: 'user' | 'model'
  conteudo: string
  createdAt: string
}

function mapRow(r: any): MetaChatMensagem {
  return { id: r.id, role: r.role, conteudo: r.conteudo, createdAt: r.created_at }
}

/** Conversa única e contínua sobre metas/estratégia — compartilhada por todo mundo que tem acesso
 * à aba (é conhecimento da empresa, não anotação pessoal). Persiste em `metas_chat_mensagens`, ao
 * contrário do chat flutuante "AMOR IN IA" que esquece tudo ao recarregar a página. */
export function useMetasChat() {
  const [mensagens, setMensagens] = useState<MetaChatMensagem[]>([])
  const [loading, setLoading] = useState(true)

  const recarregar = useCallback(async () => {
    setLoading(true)
    const { data } = await (supabase as any)
      .from('metas_chat_mensagens')
      .select('*')
      .order('created_at', { ascending: true })
    setMensagens((data || []).map(mapRow))
    setLoading(false)
  }, [])

  useEffect(() => {
    recarregar()
  }, [recarregar])

  const enviar = useCallback(async (role: 'user' | 'model', conteudo: string) => {
    const { data, error } = await (supabase as any)
      .from('metas_chat_mensagens')
      .insert({ role, conteudo })
      .select()
      .single()
    if (error) throw error
    const nova = mapRow(data)
    setMensagens((prev) => [...prev, nova])
    return nova
  }, [])

  return { mensagens, loading, enviar, recarregar }
}
