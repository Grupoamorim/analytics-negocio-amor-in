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
    filtrosSalvos: (row.filtros_salvos as any[]) || [],
    preferencias: (row.preferencias as any) || DEFAULT_CONFIG.preferencias,
  }
}

export function useConfiguracoes() {
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [config, setConfig] = useState<ConfiguracoesData>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const updateConfig = async (updates: Partial<ConfiguracoesData>) => {
    return saveConfig(updates)
  }
  const isMigratingRef = useRef(false)

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
        .eq('user_id', user.id)
        .maybeSingle()

      if (err) throw err

      if (data) {
        const mapped = mapRowToConfig(data)
        setConfig(mapped)
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mapped))
      } else if (!isMigratingRef.current) {
        isMigratingRef.current = true
        // Criar registro inicial para este usuário
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
          filtros_salvos: localToMigrate.filtrosSalvos || [],
          preferencias: localToMigrate.preferencias || DEFAULT_CONFIG.preferencias,
        }

        const { data: inserted, error: insertErr } = await supabase
          .from('configuracoes')
          .insert(insertPayload)
          .select()
          .single()

        if (!insertErr && inserted) {
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
          filtros_salvos: updated.filtrosSalvos,
          preferencias: updated.preferencias,
        }

        const { error: err } = await supabase
          .from('configuracoes')
          .upsert({ user_id: user.id, ...updatePayload })

        if (err) throw err
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
