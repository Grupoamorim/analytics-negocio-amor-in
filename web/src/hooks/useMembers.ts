import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { CARGO_LABEL, TeamMember } from '@/types/crm'

const AVATAR_COLORS = ['#F97316', '#EA580C', '#0EA5E9', '#8B5CF6', '#10B981', '#EF4444']

function corPorId(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

/**
 * Equipe real do sistema (tabela `profiles`, a mesma do Admin > Usuários) —
 * usada como lista de "Responsável"/dono de turma, autor de nota etc. em
 * vez de nomes fictícios de demonstração. Só quem foi convidado e tem
 * login aparece aqui.
 */
export function useMembers() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nome, email, role')
      .order('nome')
    if (!error && data) {
      setMembers(
        data.map((p) => ({
          id: p.id,
          name: p.nome || p.email || 'Usuário',
          email: p.email || '',
          role: CARGO_LABEL[p.role] || p.role,
          status: 'Ativo' as const,
          avatarColor: corPorId(p.id),
        })),
      )
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { members, loadingMembers: loading }
}
