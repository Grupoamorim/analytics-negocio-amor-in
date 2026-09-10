// Menu Operação > Equipamentos: checklist de saída/entrada de equipamentos
// por fotógrafo, com foto de comprovação em cada movimentação. O status
// atual de cada equipamento (disponível / com fulano) não é guardado à
// parte — é sempre derivado da última movimentação (getStatusEquipamento).
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { fetchAllRows } from '@/utils/fetchAllRows'
import { reportSupabaseError } from '@/utils/reportError'
import type { Database } from '@/lib/supabase/types'

type FotografoRow = Database['public']['Tables']['fotografos']['Row']
type EquipamentoRow = Database['public']['Tables']['equipamentos']['Row']
type MovimentacaoRow = Database['public']['Tables']['equipamento_movimentacoes']['Row']

export interface Fotografo {
  id: string
  nome: string
  telefone: string
  ativo: boolean
}

export interface Equipamento {
  id: string
  nome: string
  categoria: string
  codigo: string
  fotoUrl: string | null
  observacoes: string
  ativo: boolean
  createdAt: string
}

export type TipoMovimentacao = 'saida' | 'entrada'

export interface Movimentacao {
  id: string
  equipamentoId: string
  fotografoId: string
  tipo: TipoMovimentacao
  fotoUrl: string
  observacao: string
  criadoPor: string | null
  createdAt: string
}

const mapFotografo = (r: FotografoRow): Fotografo => ({
  id: r.id,
  nome: r.nome,
  telefone: r.telefone || '',
  ativo: r.ativo,
})

const mapEquipamento = (r: EquipamentoRow): Equipamento => ({
  id: r.id,
  nome: r.nome,
  categoria: r.categoria || '',
  codigo: r.codigo || '',
  fotoUrl: r.foto_url,
  observacoes: r.observacoes || '',
  ativo: r.ativo,
  createdAt: r.created_at,
})

const mapMovimentacao = (r: MovimentacaoRow): Movimentacao => ({
  id: r.id,
  equipamentoId: r.equipamento_id,
  fotografoId: r.fotografo_id,
  tipo: r.tipo as TipoMovimentacao,
  fotoUrl: r.foto_url,
  observacao: r.observacao || '',
  criadoPor: r.criado_por,
  createdAt: r.created_at,
})

/** Status derivado da última movimentação do equipamento. */
export interface StatusEquipamento {
  disponivel: boolean
  fotografoId: string | null // com quem está agora (null se disponível)
  ultimoFotografoId: string | null // quem foi a última pessoa a pegar (mesmo se já devolveu)
  ultimaMovimentacao: Movimentacao | null
}

export function useEquipamentos() {
  const { isAuthenticated, loading: authLoading, user } = useAuth()
  const [fotografos, setFotografos] = useState<Fotografo[]>([])
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([])
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setFotografos([])
      setEquipamentos([])
      setMovimentacoes([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [fRes, eRes, movs] = await Promise.all([
        supabase.from('fotografos').select('*').order('nome', { ascending: true }),
        supabase.from('equipamentos').select('*').order('nome', { ascending: true }),
        fetchAllRows<MovimentacaoRow>(() =>
          supabase
            .from('equipamento_movimentacoes')
            .select('*')
            .order('created_at', { ascending: false }) as any,
        ),
      ])
      if (fRes.error) throw fRes.error
      if (eRes.error) throw eRes.error
      setFotografos((fRes.data || []).map(mapFotografo))
      setEquipamentos((eRes.data || []).map(mapEquipamento))
      setMovimentacoes(movs.map(mapMovimentacao))
    } catch (e) {
      console.warn('Erro ao carregar equipamentos:', e)
      reportSupabaseError('Carregar equipamentos', e)
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (authLoading) return
    refresh()
  }, [authLoading, refresh])

  const getStatusEquipamento = useCallback(
    (equipamentoId: string): StatusEquipamento => {
      const doEquip = movimentacoes
        .filter((m) => m.equipamentoId === equipamentoId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      const ultima = doEquip[0] || null
      const ultimaSaida = doEquip.find((m) => m.tipo === 'saida') || null
      return {
        disponivel: !ultima || ultima.tipo === 'entrada',
        fotografoId: ultima && ultima.tipo === 'saida' ? ultima.fotografoId : null,
        ultimoFotografoId: ultimaSaida ? ultimaSaida.fotografoId : null,
        ultimaMovimentacao: ultima,
      }
    },
    [movimentacoes],
  )

  const addFotografo = useCallback(
    async (nome: string, telefone: string): Promise<Fotografo | null> => {
      try {
        const { data, error } = await supabase
          .from('fotografos')
          .insert({ nome: nome.trim(), telefone: telefone.trim() || null })
          .select('*')
          .single()
        if (error) throw error
        const novo = mapFotografo(data)
        setFotografos((prev) => [...prev, novo].sort((a, b) => a.nome.localeCompare(b.nome)))
        return novo
      } catch (e) {
        reportSupabaseError('Cadastrar fotógrafo', e)
        return null
      }
    },
    [],
  )

  const updateFotografo = useCallback(
    async (id: string, updates: Partial<Pick<Fotografo, 'nome' | 'telefone' | 'ativo'>>) => {
      try {
        const { error } = await supabase
          .from('fotografos')
          .update({
            ...(updates.nome !== undefined ? { nome: updates.nome } : {}),
            ...(updates.telefone !== undefined ? { telefone: updates.telefone || null } : {}),
            ...(updates.ativo !== undefined ? { ativo: updates.ativo } : {}),
          })
          .eq('id', id)
        if (error) throw error
        setFotografos((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)))
      } catch (e) {
        reportSupabaseError('Atualizar fotógrafo', e)
      }
    },
    [],
  )

  const uploadFotoEquipamento = useCallback(async (equipamentoId: string, file: File, prefixo: string) => {
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${equipamentoId}/${prefixo}-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('equipamentos-fotos').upload(path, file, { upsert: true })
    if (error) throw error
    const { data } = supabase.storage.from('equipamentos-fotos').getPublicUrl(path)
    return `${data.publicUrl}?v=${Date.now()}`
  }, [])

  const addEquipamento = useCallback(
    async (input: { nome: string; categoria: string; codigo: string; observacoes: string; foto?: File | null }) => {
      try {
        const { data, error } = await supabase
          .from('equipamentos')
          .insert({
            nome: input.nome.trim(),
            categoria: input.categoria.trim() || null,
            codigo: input.codigo.trim() || null,
            observacoes: input.observacoes.trim() || null,
          })
          .select('*')
          .single()
        if (error) throw error
        let fotoUrl: string | null = null
        if (input.foto) {
          fotoUrl = await uploadFotoEquipamento(data.id, input.foto, 'cadastro')
          const { error: updErr } = await supabase
            .from('equipamentos')
            .update({ foto_url: fotoUrl })
            .eq('id', data.id)
          if (updErr) throw updErr
        }
        const novo = mapEquipamento({ ...data, foto_url: fotoUrl })
        setEquipamentos((prev) => [...prev, novo].sort((a, b) => a.nome.localeCompare(b.nome)))
        return novo
      } catch (e) {
        reportSupabaseError('Cadastrar equipamento', e)
        return null
      }
    },
    [uploadFotoEquipamento],
  )

  const updateEquipamento = useCallback(
    async (id: string, updates: Partial<Pick<Equipamento, 'nome' | 'categoria' | 'codigo' | 'observacoes' | 'ativo'>>) => {
      try {
        const { error } = await supabase
          .from('equipamentos')
          .update({
            ...(updates.nome !== undefined ? { nome: updates.nome } : {}),
            ...(updates.categoria !== undefined ? { categoria: updates.categoria || null } : {}),
            ...(updates.codigo !== undefined ? { codigo: updates.codigo || null } : {}),
            ...(updates.observacoes !== undefined ? { observacoes: updates.observacoes || null } : {}),
            ...(updates.ativo !== undefined ? { ativo: updates.ativo } : {}),
          })
          .eq('id', id)
        if (error) throw error
        setEquipamentos((prev) => prev.map((e) => (e.id === id ? { ...e, ...updates } : e)))
      } catch (e) {
        reportSupabaseError('Atualizar equipamento', e)
      }
    },
    [],
  )

  const registrarMovimentacao = useCallback(
    async (input: {
      equipamentoId: string
      fotografoId: string
      tipo: TipoMovimentacao
      foto: File
      observacao?: string
    }) => {
      try {
        const fotoUrl = await uploadFotoEquipamento(input.equipamentoId, input.foto, input.tipo)
        const { data, error } = await supabase
          .from('equipamento_movimentacoes')
          .insert({
            equipamento_id: input.equipamentoId,
            fotografo_id: input.fotografoId,
            tipo: input.tipo,
            foto_url: fotoUrl,
            observacao: input.observacao?.trim() || null,
            criado_por: user?.id || null,
          })
          .select('*')
          .single()
        if (error) throw error
        const nova = mapMovimentacao(data)
        setMovimentacoes((prev) => [nova, ...prev])
        return nova
      } catch (e) {
        reportSupabaseError('Registrar movimentação de equipamento', e)
        return null
      }
    },
    [uploadFotoEquipamento, user],
  )

  return {
    fotografos,
    equipamentos,
    movimentacoes,
    loading,
    refresh,
    getStatusEquipamento,
    addFotografo,
    updateFotografo,
    addEquipamento,
    updateEquipamento,
    registrarMovimentacao,
  }
}
