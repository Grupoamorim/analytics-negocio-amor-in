import { useEffect, useState } from 'react'
import { Map as MapIcon } from 'lucide-react'
import { loadLeads, subscribeToLeads } from '@/utils/captacaoStorage'
import MarketMap from '@/components/MarketMap'

/**
 * Página dedicada "Mapa de Mercado".
 * Renderiza o mesmo componente MarketMap usado na aba de Captação, mas como
 * página própria (rota /mapa-mercado). Compartilha os dados de captação
 * (localStorage) e o contexto do CRM (deals/stages) para o filtro de funil.
 */
export default function MapaMercado() {
  const [leads, setLeads] = useState(() => loadLeads())

  useEffect(() => {
    const refresh = () => setLeads(loadLeads())
    refresh()
    return subscribeToLeads(refresh)
  }, [])

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      {/* Cabeçalho da página */}
      <div className="pb-2 border-b border-white/[0.06]">
        <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
          <MapIcon className="w-6 h-6 text-orange-400" />
          Mapa de Mercado
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Distribuição de turmas por curso, faculdade e cidade
        </p>
      </div>

      <MarketMap leads={leads} />
    </div>
  )
}
