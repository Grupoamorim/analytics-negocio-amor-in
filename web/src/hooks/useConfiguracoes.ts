import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import type { Database } from '@/lib/supabase/types'

type ConfiguracaoRow = Database['public']['Tables']['configuracoes']['Row']
type ConfiguracaoInsert = Database['public']['Tables']['configuracoes']['Insert']
type ConfiguracaoUpdate = Database['public']['Tables']['configuracoes']['Update']

const LOCAL_STORAGE_KEY = 'crm_configuracoes'

export interface ConfiguracoesData {
  sgeCnpj: string
  sgeToken: string
  geminiApiKey: string
  logoUrl: string
  filtrosSalvos: any[]
  preferencias: {
    notifyOnNewLead?: boolean
    notifyOnDealWon?: boolean
    autoSyncSGE?: boolean
    [key: string]: any
  }
}

const DEFAULT_CONFIG: ConfiguracoesData = {
  sgeCnpj: '',
  sgeToken: '',
  geminiApiKey: '',
  logoUrl: '',
  filtrosSalvos: [],
  preferencias: {
    notifyOnNewLead: true,
    notifyOnDealWon: true,
    autoSyncSGE: false,
  },
}

function mapRowToConfig(row: ConfiguracaoRow): ConfiguracoesData {
  return {
    sgeCnpj: row.sge_cnpj || '',
    sgeToken: row.sge_token || '',
    geminiApiKey: row.gemini_api_key || '',
    logoUrl: row.logo_url || '',
    filtrosSalvos: (row.filtros_salvos as any[]) || [],
    preferencias: (row.preferencias as any) || DEFAULT_CONFIG.preferencias,
  }
}

export function useConfiguracoes() {
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [config, setConfig] = useState<ConfiguracoesData>(DEFAULT_CONFIG)
  const [configId, setConfigId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const updateConfig = async (updates: Partial<ConfiguracoesData>) => {
    return saveConfig(updates)
  }
  const isMigratingRef = useRef(false)

  // Configuração é ÚNICA e GLOBAL (SGE/Gemini valem pro site inteiro) — não
  // é mais uma linha por usuário, senão cada login via login enxergava
  // tudo vazio e parecia que "não salvava". Sempre pega a primeira (e
  // única) linha da tabela, independente de quem está logado.
  const fetchConfig = useCallback(async () => {
    if (!isAuthenticated || !user) {
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
        if (stored) {
          setConfig(JSON.parse(stored))
        }
      } catch {
        setConfig(DEFAULT_CONFIG)
      }
      return
    }

    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('configuracoes')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (err) throw err

      if (data) {
        setConfigId(data.id)
        const mapped = mapRowToConfig(data)
        setConfig(mapped)
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mapped))
      } else if (!isMigratingRef.current) {
        isMigratingRef.current = true
        // Primeira vez no sistema inteiro: cria a linha global única.
        let localToMigrate: ConfiguracoesData = DEFAULT_CONFIG
        try {
          const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
          if (stored) localToMigrate = JSON.parse(stored)
        } catch {
          // ignora
        }

        const insertPayload: ConfiguracaoInsert = {
          user_id: user.id,
          sge_cnpj: localToMigrate.sgeCnpj || '',
          sge_token: localToMigrate.sgeToken || '',
          gemini_api_key: localToMigrate.geminiApiKey || '',
          logo_url: localToMigrate.logoUrl || '',
          filtros_salvos: localToMigrate.filtrosSalvos || [],
          preferencias: localToMigrate.preferencias || DEFAULT_CONFIG.preferencias,
        }

        const { data: inserted, error: insertErr } = await supabase
          .from('configuracoes')
          .insert(insertPayload)
          .select()
          .single()

        if (!insertErr && inserted) {
          setConfigId(inserted.id)
          const mapped = mapRowToConfig(inserted)
          setConfig(mapped)
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mapped))
        }
        isMigratingRef.current = false
      }
    } catch (e: any) {
      console.warn('Erro ao carregar configurações do Supabase, usando cache local:', e)
      setError(e.message || 'Erro ao sincronizar com Supabase')
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, user])

  useEffect(() => {
    if (authLoading) return

    if (isAuthenticated) {
      fetchConfig()
    } else {
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
        if (stored) setConfig(JSON.parse(stored))
        else setConfig(DEFAULT_CONFIG)
      } catch {
        setConfig(DEFAULT_CONFIG)
      }
      setLoading(false)
    }
  }, [isAuthenticated, authLoading, fetchConfig])

  const saveConfig = async (updates: Partial<ConfiguracoesData>): Promise<void> => {
    const updated: ConfiguracoesData = {
      ...config,
      ...updates,
      preferencias: {
        ...config.preferencias,
        ...(updates.preferencias || {}),
      },
    }

    if (isAuthenticated && user) {
      try {
        const updatePayload: ConfiguracaoUpdate = {
          sge_cnpj: updated.sgeCnpj,
          sge_token: updated.sgeToken,
          gemini_api_key: updated.geminiApiKey,
          logo_url: updated.logoUrl,
          filtros_salvos: updated.filtrosSalvos,
          preferencias: updated.preferencias,
          user_id: user.id,
        }

        if (configId) {
          // Atualiza a linha global única — nunca cria uma nova por usuário.
          const { error: err } = await supabase
            .from('configuracoes')
            .update(updatePayload)
            .eq('id', configId)
          if (err) throw err
        } else {
          const insertPayload: ConfiguracaoInsert = { ...updatePayload, user_id: user.id }
          const { data: inserted, error: err } = await supabase
            .from('configuracoes')
            .insert(insertPayload)
            .select()
            .single()
          if (err) throw err
          if (inserted) setConfigId(inserted.id)
        }
      } catch (e: any) {
        console.warn('Erro ao salvar configurações no Supabase:', e)
        setError(e.message)
      }
    }

    setConfig(updated)
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated))
      if (updated.sgeToken) localStorage.setItem('crm_sge_token', updated.sgeToken)
      if (updated.sgeCnpj) localStorage.setItem('crm_sge_cnpj', updated.sgeCnpj)
      if (updated.geminiApiKey) localStorage.setItem('crm_gemini_api_key', updated.geminiApiKey)
    } catch {
      // ignora
    }
  }

  return {
    config,
    loading,
    error,
    saveConfig,
    updateConfig,
    refreshConfiguracoes: fetchConfig,
  }
}
