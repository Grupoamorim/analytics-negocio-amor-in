import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Printer,
  Presentation as PresentationIcon,
} from 'lucide-react'
import { useCRM } from '@/context/CRMContext'
import { Lead, Deal } from '@/types/crm'
import EmpresaFilterBar from '@/components/EmpresaFilterBar'

const ORANGE = '#f97316'

function brl(v: number): string {
  return `R$ ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function trimestreDoMes(mes0: number): number {
  return Math.floor(mes0 / 3) + 1
}

function periodoTrimestre(tri: number, ano: number): { ini: string; fim: string } {
  const mesIni = (tri - 1) * 3
  return { ini: toISO(new Date(ano, mesIni, 1)), fim: toISO(new Date(ano, mesIni + 3, 0)) }
}

function trimestreAnterior(tri: number, ano: number): { tri: number; ano: number } {
  return tri === 1 ? { tri: 4, ano: ano - 1 } : { tri: tri - 1, ano }
}

function parseDataFlexivel(raw?: string | null): Date | null {
  if (!raw) return null
  const s = raw.trim()
  if (!s) return null
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (br) {
    const dt = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]))
    if (!isNaN(dt.getTime())) return dt
  }
  const dt = new Date(s)
  return isNaN(dt.getTime()) ? null : dt
}

function dentroPeriodo(d: Date | null, ini: string, fim: string): boolean {
  if (!d) return false
  const iso = toISO(d)
  return iso >= ini && iso <= fim
}

interface FechamentoInfo {
  lead: Lead
  deal: Deal | undefined
  closeDate: Date | null
  valor: number
}

const MESES_NOME = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export default function Relatorios() {
  const { leads: allLeads = [], deals: allDeals = [] } = useCRM()

  const [selectedEmpresas, setSelectedEmpresas] = useState<string[]>([])
  const empresaOptions = useMemo(() => {
    const set = new Set<string>()
    allLeads.forEach((l) => l.empresa && set.add(l.empresa))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [allLeads])

  const leads = useMemo(() => {
    if (selectedEmpresas.length === 0) return allLeads
    return allLeads.filter((l) => l.empresa && selectedEmpresas.includes(l.empresa))
  }, [allLeads, selectedEmpresas])
  const leadIds = useMemo(() => new Set(leads.map((l) => l.id)), [leads])
  const deals = useMemo(
    () => allDeals.filter((d) => !d.leadId || leadIds.has(d.leadId)),
    [allDeals, leadIds],
  )

  // Trimestre selecionado
  const hoje = new Date()
  const [tri, setTri] = useState<number>(trimestreDoMes(hoje.getMonth()))
  const [ano, setAno] = useState<number>(hoje.getFullYear())

  const periodo = useMemo(() => periodoTrimestre(tri, ano), [tri, ano])
  const periodoAnterior = useMemo(() => {
    const p = trimestreAnterior(tri, ano)
    return periodoTrimestre(p.tri, p.ano)
  }, [tri, ano])
  const periodoAnoAnterior = useMemo(() => periodoTrimestre(tri, ano - 1), [tri, ano])

  function irParaTrimestre(delta: number) {
    let novoTri = tri + delta
    let novoAno = ano
    if (novoTri > 4) {
      novoTri = 1
      novoAno += 1
    } else if (novoTri < 1) {
      novoTri = 4
      novoAno -= 1
    }
    setTri(novoTri)
    setAno(novoAno)
  }

  const dealByLeadId = useMemo(() => {
    const map = new Map<string, Deal>()
    deals.forEach((d) => d.leadId && map.set(d.leadId, d))
    return map
  }, [deals])

  function getCloseDate(lead: Lead, deal: Deal | undefined): Date | null {
    const explicit = parseDataFlexivel(lead.dataFechamento)
    if (explicit) return explicit
    if (deal) {
      const h = deal.stageHistory?.find((x) => x.stage === 'stage-6')
      if (h?.enteredAt) {
        const dt = new Date(h.enteredAt)
        if (!isNaN(dt.getTime())) return dt
      }
      if (deal.updatedAt) {
        const dt = new Date(deal.updatedAt)
        if (!isNaN(dt.getTime())) return dt
      }
    }
    return null
  }

  // Todas as turmas com data de fechamento resolvida (ganhas ou perdidas)
  const leadsComFechamento: FechamentoInfo[] = useMemo(() => {
    return leads
      .filter((l) => l.status === 'Convertido' || l.status === 'Perdido')
      .map((l) => {
        const deal = dealByLeadId.get(l.id)
        return {
          lead: l,
          deal,
          closeDate: getCloseDate(l, deal),
          valor: deal?.value || l.potentialValue || 0,
        }
      })
  }, [leads, dealByLeadId])

  function turmasFechadasEm(ini: string, fim: string) {
    return leadsComFechamento.filter((x) => x.lead.status === 'Convertido' && dentroPeriodo(x.closeDate, ini, fim))
  }
  function turmasPerdidasEm(ini: string, fim: string) {
    return leadsComFechamento.filter((x) => x.lead.status === 'Perdido' && dentroPeriodo(x.closeDate, ini, fim))
  }

  const turmasFechadas = useMemo(() => turmasFechadasEm(periodo.ini, periodo.fim), [leadsComFechamento, periodo])
  const turmasPerdidas = useMemo(() => turmasPerdidasEm(periodo.ini, periodo.fim), [leadsComFechamento, periodo])

  const vgvTotal = useMemo(() => turmasFechadas.reduce((acc, x) => acc + x.valor, 0), [turmasFechadas])
  const vgvAnoAnterior = useMemo(
    () => turmasFechadasEm(periodoAnoAnterior.ini, periodoAnoAnterior.fim).reduce((acc, x) => acc + x.valor, 0),
    [leadsComFechamento, periodoAnoAnterior],
  )
  const crescimentoPct = vgvAnoAnterior > 0 ? ((vgvTotal - vgvAnoAnterior) / vgvAnoAnterior) * 100 : null
  const crescimentoValor = vgvTotal - vgvAnoAnterior

  const adesoesTotais = useMemo(
    () => turmasFechadas.reduce((acc, x) => acc + (x.lead.alunosFechados || 0), 0),
    [turmasFechadas],
  )
  const taxaMediaPorTurma = turmasFechadas.length > 0 ? Math.round(adesoesTotais / turmasFechadas.length) : 0
  const totalNegociado = turmasFechadas.length + turmasPerdidas.length
  const pctPerdidas = totalNegociado > 0 ? (turmasPerdidas.length / totalNegociado) * 100 : 0

  // Performance mensal (3 meses do trimestre), com filtro opcional de cidade
  function performanceMensal(ini: string, cidade?: string) {
    const mesIniIdx = new Date(`${ini}T00:00:00`).getMonth()
    const anoBase = new Date(`${ini}T00:00:00`).getFullYear()
    return [0, 1, 2].map((i) => {
      const mesIdx = mesIniIdx + i
      const chave = `${anoBase}-${pad2(mesIdx + 1)}`
      const valor = turmasFechadas
        .filter((x) => {
          if (!x.closeDate) return false
          if (cidade && x.lead.cidade !== cidade) return false
          const c = `${x.closeDate.getFullYear()}-${pad2(x.closeDate.getMonth() + 1)}`
          return c === chave
        })
        .reduce((acc, x) => acc + x.valor, 0)
      return { mes: MESES_NOME[mesIdx % 12], valor }
    })
  }

  const performanceMensalGeral = useMemo(() => performanceMensal(periodo.ini), [turmasFechadas, periodo])
  const destaqueMes = useMemo(
    () => performanceMensalGeral.reduce((a, b) => (b.valor > a.valor ? b : a), performanceMensalGeral[0]),
    [performanceMensalGeral],
  )
  const piorMes = useMemo(
    () => performanceMensalGeral.reduce((a, b) => (b.valor < a.valor ? b : a), performanceMensalGeral[0]),
    [performanceMensalGeral],
  )
  const maxMensal = Math.max(...performanceMensalGeral.map((m) => m.valor), 1)

  // Cidades com pelo menos 1 turma fechada no período
  const cidadesComFechamento = useMemo(() => {
    const set = new Set<string>()
    turmasFechadas.forEach((x) => x.lead.cidade && set.add(x.lead.cidade))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [turmasFechadas])

  // Pipeline de oportunidades (turmas abertas) por curso -> faculdade
  const pipelinePorCurso = useMemo(() => {
    const abertos = leads.filter((l) => l.status !== 'Convertido' && l.status !== 'Perdido')
    const porCurso = new Map<string, Map<string, number>>()
    for (const l of abertos) {
      const curso = l.curso || 'Sem curso'
      if (!porCurso.has(curso)) porCurso.set(curso, new Map())
      const facMap = porCurso.get(curso)!
      const fac = l.faculdade || 'Sem faculdade'
      facMap.set(fac, (facMap.get(fac) || 0) + 1)
    }
    return Array.from(porCurso.entries())
      .map(([curso, facMap]) => ({
        curso,
        total: Array.from(facMap.values()).reduce((a, b) => a + b, 0),
        faculdades: Array.from(facMap.entries())
          .map(([faculdade, count]) => ({ faculdade, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 6),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3)
  }, [leads])

  // Market share: entre as turmas fechadas do período, % por faculdade dentro de cada curso
  const marketSharePorCurso = useMemo(() => {
    const porCurso = new Map<string, Map<string, number>>()
    for (const x of turmasFechadas) {
      const curso = x.lead.curso || 'Sem curso'
      if (!porCurso.has(curso)) porCurso.set(curso, new Map())
      const facMap = porCurso.get(curso)!
      const fac = x.lead.faculdade || 'Sem faculdade'
      facMap.set(fac, (facMap.get(fac) || 0) + 1)
    }
    return Array.from(porCurso.entries())
      .map(([curso, facMap]) => {
        const total = Array.from(facMap.values()).reduce((a, b) => a + b, 0)
        return {
          curso,
          total,
          faculdades: Array.from(facMap.entries())
            .map(([faculdade, count]) => ({ faculdade, count, pct: total > 0 ? (count / total) * 100 : 0 }))
            .sort((a, b) => b.count - a.count),
        }
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 3)
  }, [turmasFechadas])

  // Funil: apresentações p/ comissão (stage-3) e p/ turma (stage-4) — deals que
  // entraram nesses estágios dentro do período selecionado.
  const funil = useMemo(() => {
    let comissao = 0
    let turma = 0
    for (const d of deals) {
      const entrouComissao = d.stageHistory?.some((h) => h.stage === 'stage-3' && dentroPeriodo(new Date(h.enteredAt), periodo.ini, periodo.fim))
      const entrouTurma = d.stageHistory?.some((h) => h.stage === 'stage-4' && dentroPeriodo(new Date(h.enteredAt), periodo.ini, periodo.fim))
      if (entrouComissao) comissao += 1
      if (entrouTurma) turma += 1
    }
    const conversao = comissao > 0 ? Math.round((turma / comissao) * 100) : 0
    return { comissao, turma, conversao }
  }, [deals, periodo])

  // Navegação de slides
  const slideKeys = useMemo(() => {
    const keys = ['capa', 'vgv', 'resultados', 'performance-mensal']
    cidadesComFechamento.forEach((c) => keys.push(`cidade-${c}`))
    keys.push('pipeline', 'market-share', 'funil')
    return keys
  }, [cidadesComFechamento])

  const [slideIndex, setSlideIndex] = useState(0)
  useEffect(() => {
    setSlideIndex(0)
  }, [tri, ano, selectedEmpresas.length])
  useEffect(() => {
    if (slideIndex >= slideKeys.length) setSlideIndex(0)
  }, [slideKeys, slideIndex])

  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        setSlideIndex((i) => Math.min(i + 1, slideKeys.length - 1))
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setSlideIndex((i) => Math.max(i - 1, 0))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [slideKeys.length])

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      containerRef.current?.requestFullscreen().catch(() => {})
    }
  }

  function baixarPdf() {
    window.print()
  }

  const totalSlides = slideKeys.length

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #relatorio-print-area, #relatorio-print-area * { visibility: visible; }
          #relatorio-print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .relatorio-slide { break-after: page; page-break-after: always; height: 100vh; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Cabeçalho e controles (somem na impressão) */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <PresentationIcon className="w-6 h-6 text-orange-400" /> Relatórios
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Apresentação comercial pronta, gerada com os dados reais do período selecionado.
          </p>
        </div>
        <EmpresaFilterBar options={empresaOptions} selected={selectedEmpresas} onChange={setSelectedEmpresas} />
      </div>

      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 bg-[#111820] border border-white/[0.08] rounded-lg px-2 py-1.5">
          <button
            type="button"
            onClick={() => irParaTrimestre(-1)}
            className="p-1 rounded hover:bg-white/[0.08] text-slate-300"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-semibold text-white px-2 min-w-[110px] text-center">
            {tri}º Trimestre {ano}
          </span>
          <button
            type="button"
            onClick={() => irParaTrimestre(1)}
            className="p-1 rounded hover:bg-white/[0.08] text-slate-300"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={baixarPdf}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#111820] border border-white/[0.08] text-slate-300 hover:text-white hover:bg-white/[0.06] text-xs font-medium transition-colors"
          >
            <Printer className="w-3.5 h-3.5" /> Baixar PDF
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold transition-colors"
          >
            {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
            {isFullscreen ? 'Sair da Apresentação' : 'Apresentar'}
          </button>
        </div>
      </div>

      {/* Área da apresentação */}
      <div
        ref={containerRef}
        className={`relative bg-black rounded-xl overflow-hidden ${isFullscreen ? 'w-screen h-screen flex items-center justify-center' : ''}`}
      >
        <div id="relatorio-print-area" className={isFullscreen ? 'w-full h-full' : ''}>
          {slideKeys.map((key, i) => {
            const visivel = isFullscreen ? i === slideIndex : i === slideIndex
            return (
              <div
                key={key}
                className={`relatorio-slide ${visivel ? 'block' : 'hidden print:block'}`}
              >
                {renderSlide(key)}
              </div>
            )
          })}
        </div>

        {/* Setas de navegação */}
        {!isFullscreen && (
          <div className="no-print flex items-center justify-between px-2 py-3 bg-[#0a0a0a]">
            <button
              type="button"
              onClick={() => setSlideIndex((i) => Math.max(i - 1, 0))}
              disabled={slideIndex === 0}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/[0.06] text-slate-300 text-xs font-medium disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>
            <div className="flex items-center gap-1.5">
              {slideKeys.map((key, i) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSlideIndex(i)}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${
                    i === slideIndex ? 'w-4 bg-orange-400' : 'bg-white/20 hover:bg-white/40'
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setSlideIndex((i) => Math.min(i + 1, totalSlides - 1))}
              disabled={slideIndex === totalSlides - 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/[0.06] text-slate-300 text-xs font-medium disabled:opacity-30"
            >
              Próximo <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {isFullscreen && (
          <>
            <button
              type="button"
              onClick={() => setSlideIndex((i) => Math.max(i - 1, 0))}
              className="no-print absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              type="button"
              onClick={() => setSlideIndex((i) => Math.min(i + 1, totalSlides - 1))}
              className="no-print absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}
      </div>
    </div>
  )

  function renderSlide(key: string) {
    if (key === 'capa') return <SlideCapa tri={tri} ano={ano} vgvTotal={vgvTotal} />
    if (key === 'vgv')
      return (
        <SlideVgv
          titulo="Vitória"
          subtitulo={`VGV Total ${tri}º Tri`}
          vgv={vgvTotal}
          crescimentoPct={crescimentoPct}
          crescimentoValor={crescimentoValor}
          ano={ano}
        />
      )
    if (key === 'resultados')
      return (
        <SlideResultados
          tri={tri}
          turmasFechadas={turmasFechadas.length}
          turmasPerdidas={turmasPerdidas.length}
          totalNegociado={totalNegociado}
          pctPerdidas={pctPerdidas}
          adesoesTotais={adesoesTotais}
          taxaMediaPorTurma={taxaMediaPorTurma}
        />
      )
    if (key === 'performance-mensal')
      return (
        <SlidePerformanceMensal
          tri={tri}
          dados={performanceMensalGeral}
          maxValor={maxMensal}
          destaque={destaqueMes}
          pior={piorMes}
        />
      )
    if (key.startsWith('cidade-')) {
      const cidade = key.replace('cidade-', '')
      const dadosCidade = performanceMensal(periodo.ini, cidade)
      const maxCidade = Math.max(...dadosCidade.map((m) => m.valor), 1)
      const vgvAtualCidade = turmasFechadas
        .filter((x) => x.lead.cidade === cidade)
        .reduce((acc, x) => acc + x.valor, 0)
      const vgvAnteriorCidade = turmasFechadasEm(periodoAnterior.ini, periodoAnterior.fim)
        .filter((x) => x.lead.cidade === cidade)
        .reduce((acc, x) => acc + x.valor, 0)
      return (
        <SlidePerformanceMensalCidade
          cidade={cidade}
          tri={tri}
          triAnterior={trimestreAnterior(tri, ano).tri}
          dados={dadosCidade}
          maxValor={maxCidade}
          vgvAtual={vgvAtualCidade}
          vgvAnterior={vgvAnteriorCidade}
        />
      )
    }
    if (key === 'pipeline') return <SlidePipeline tri={tri} cursos={pipelinePorCurso} />
    if (key === 'market-share') return <SlideMarketShare tri={tri} cursos={marketSharePorCurso} />
    if (key === 'funil') return <SlideFunil tri={tri} funil={funil} />
    return null
  }
}

// ---------------------------------------------------------------------------
// Slides
// ---------------------------------------------------------------------------

function SlideChrome({
  eyebrow,
  titulo,
  children,
  destaque,
}: {
  eyebrow: string
  titulo: string
  children: React.ReactNode
  destaque?: React.ReactNode
}) {
  return (
    <div className="w-full aspect-[16/9] max-h-[calc(100vh-140px)] mx-auto bg-[#0a0a0a] text-white flex flex-col p-8 sm:p-10 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: ORANGE }} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-[11px] tracking-[0.2em] text-slate-400 uppercase">{eyebrow}</div>
          <h2 className="text-2xl sm:text-3xl font-bold mt-1">{titulo}</h2>
        </div>
        <div className="text-[11px] tracking-[0.15em] text-slate-500 uppercase font-semibold">
          Grupo Lucas Amorim
        </div>
      </div>
      <div className="flex-1 min-h-0">{children}</div>
      {destaque}
      <div className="flex items-center justify-between pt-4 mt-4 border-t border-white/10 text-[10px] tracking-[0.1em] text-slate-500 uppercase">
        <span>Grupo Lucas Amorim</span>
        <span>Confidencial</span>
      </div>
    </div>
  )
}

function SlideCapa({ tri, ano, vgvTotal }: { tri: number; ano: number; vgvTotal: number }) {
  return (
    <div className="w-full aspect-[16/9] max-h-[calc(100vh-140px)] mx-auto bg-black text-white flex flex-col items-center justify-center text-center p-10 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1.5" style={{ background: ORANGE }} />
      <div className="text-[11px] tracking-[0.3em] text-slate-400 uppercase mb-4">Grupo Lucas Amorim</div>
      <h1 className="text-4xl sm:text-5xl font-bold">
        Relatório Comercial <span style={{ color: ORANGE }} className="italic">{tri}º TRI</span>
      </h1>
      <div className="w-16 h-px bg-white/20 my-6" />
      <div className="text-xs tracking-[0.2em] text-slate-400 uppercase mb-2">VGV Total · {ano}</div>
      <div className="text-4xl sm:text-5xl font-bold" style={{ color: ORANGE }}>
        {brl(vgvTotal)}
      </div>
      <div className="absolute bottom-6 left-0 right-0 flex items-center justify-between px-10 text-[10px] tracking-[0.15em] text-slate-500 uppercase">
        <span>Relatório de Desempenho</span>
        <span>Confidencial · Uso Interno</span>
      </div>
    </div>
  )
}

function SlideVgv({
  subtitulo,
  vgv,
  crescimentoPct,
  crescimentoValor,
  ano,
}: {
  titulo: string
  subtitulo: string
  vgv: number
  crescimentoPct: number | null
  crescimentoValor: number
  ano: number
}) {
  return (
    <div className="w-full aspect-[16/9] max-h-[calc(100vh-140px)] mx-auto bg-black text-white flex flex-col items-center justify-center text-center p-10 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1.5" style={{ background: ORANGE }} />
      <div className="text-xs tracking-[0.2em] text-slate-400 uppercase mb-3">{subtitulo}</div>
      <div className="text-4xl sm:text-5xl font-bold" style={{ color: ORANGE }}>
        {brl(vgv)}
      </div>
      {crescimentoPct !== null ? (
        <div className="text-sm text-slate-300 mt-4">
          Crescimento de {brl(Math.abs(crescimentoValor))} ({crescimentoPct >= 0 ? '+' : ''}
          {crescimentoPct.toFixed(2)}%) em relação a {ano - 1}
        </div>
      ) : (
        <div className="text-sm text-slate-500 mt-4">Sem dados do mesmo período em {ano - 1} para comparar.</div>
      )}
      <div className="absolute bottom-6 left-0 right-0 flex items-center justify-between px-10 text-[10px] tracking-[0.15em] text-slate-500 uppercase">
        <span>Relatório de Desempenho</span>
        <span>Confidencial · Uso Interno</span>
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  sub,
  tone = 'primary',
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  tone?: 'primary' | 'red'
}) {
  return (
    <div className="bg-[#111111] border border-white/10 rounded-lg p-5 flex flex-col">
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wider uppercase text-slate-400 mb-3">
        {icon} {label}
      </div>
      <div className="text-3xl font-bold" style={{ color: tone === 'primary' ? ORANGE : '#f87171' }}>
        {value}
      </div>
      {sub && <div className="text-xs text-slate-400 mt-2">{sub}</div>}
    </div>
  )
}

function SlideResultados({
  tri,
  turmasFechadas,
  turmasPerdidas,
  totalNegociado,
  pctPerdidas,
  adesoesTotais,
  taxaMediaPorTurma,
}: {
  tri: number
  turmasFechadas: number
  turmasPerdidas: number
  totalNegociado: number
  pctPerdidas: number
  adesoesTotais: number
  taxaMediaPorTurma: number
}) {
  return (
    <SlideChrome eyebrow={`Relatório Comercial ${tri}º Tri`} titulo="Resultados de Fechamento">
      <div className="grid grid-cols-2 gap-4 h-full">
        <StatCard
          icon="🤝"
          label="Turmas Fechadas"
          value={String(turmasFechadas).padStart(2, '0')}
          sub={`${totalNegociado} turmas negociadas no período`}
        />
        <StatCard
          icon="✕"
          label="Turmas Perdidas"
          value={String(turmasPerdidas).padStart(2, '0')}
          tone="red"
          sub={`Representa ${pctPerdidas.toFixed(0)}% do volume total de propostas negociadas`}
        />
        <StatCard icon="👥" label="Adesões Totais" value={String(adesoesTotais)} sub="Alunos aderidos aos contratos fechados no período" />
        <StatCard icon="👥" label="Taxa Média por Turma" value={String(taxaMediaPorTurma)} sub="Alunos por turma fechada, em média" />
      </div>
    </SlideChrome>
  )
}

function BarChartSimples({ dados, maxValor }: { dados: { mes: string; valor: number }[]; maxValor: number }) {
  return (
    <div className="flex items-end justify-around h-full gap-4 px-2">
      {dados.map((m) => (
        <div key={m.mes} className="flex flex-col items-center flex-1 h-full justify-end">
          <div className="text-xs font-semibold text-white mb-2">{brl(m.valor)}</div>
          <div
            className="w-full rounded-t"
            style={{
              height: `${Math.max((m.valor / maxValor) * 100, 3)}%`,
              background: m.valor === maxValor ? ORANGE : '#3f3f46',
            }}
          />
          <div className="text-xs text-slate-400 mt-2">{m.mes}</div>
        </div>
      ))}
    </div>
  )
}

function SlidePerformanceMensal({
  tri,
  dados,
  maxValor,
  destaque,
  pior,
}: {
  tri: number
  dados: { mes: string; valor: number }[]
  maxValor: number
  destaque: { mes: string; valor: number }
  pior: { mes: string; valor: number }
}) {
  return (
    <SlideChrome eyebrow={`Relatório Comercial ${tri}º Tri`} titulo="Performance Mensal">
      <div className="grid grid-cols-3 gap-6 h-full">
        <div className="col-span-2 h-full">
          <BarChartSimples dados={dados} maxValor={maxValor} />
        </div>
        <div className="bg-[#111111] border border-white/10 rounded-lg p-4 space-y-4 text-xs">
          <div>
            <div className="uppercase tracking-wider font-semibold" style={{ color: ORANGE }}>
              Destaque do Trimestre
            </div>
            <div className="text-xl font-bold text-white mt-1">{destaque.mes}</div>
            <div className="font-semibold" style={{ color: ORANGE }}>
              {brl(destaque.valor)}
            </div>
          </div>
          <div>
            <div className="uppercase tracking-wider font-semibold text-slate-400">Pior Mês do Trimestre</div>
            <div className="text-xl font-bold text-white mt-1">
              {pior.mes} <span className="text-sm text-slate-400">{brl(pior.valor)}</span>
            </div>
          </div>
        </div>
      </div>
    </SlideChrome>
  )
}

function SlidePerformanceMensalCidade({
  cidade,
  tri,
  triAnterior,
  dados,
  maxValor,
  vgvAtual,
  vgvAnterior,
}: {
  cidade: string
  tri: number
  triAnterior: number
  dados: { mes: string; valor: number }[]
  maxValor: number
  vgvAtual: number
  vgvAnterior: number
}) {
  const variacao = vgvAnterior > 0 ? (vgvAtual / vgvAnterior) * 100 : null
  return (
    <SlideChrome eyebrow={`Relatório Comercial ${tri}º Tri`} titulo={`Performance Mensal ${cidade.toUpperCase()}`}>
      <div className="grid grid-cols-3 gap-6 h-full">
        <div className="col-span-2 h-full">
          <BarChartSimples dados={dados} maxValor={maxValor} />
        </div>
        <div className="bg-[#111111] border border-white/10 rounded-lg p-4 space-y-4 text-xs">
          <div>
            <div className="uppercase tracking-wider font-semibold" style={{ color: ORANGE }}>
              VGV {tri}º Trimestre
            </div>
            <div className="text-xl font-bold text-white mt-1">{brl(vgvAtual)}</div>
            {variacao !== null && (
              <div className="text-slate-400 mt-1">
                Representa {variacao.toFixed(2)}% do resultado do trimestre anterior.
              </div>
            )}
          </div>
          <div>
            <div className="uppercase tracking-wider font-semibold text-slate-400">
              VGV {triAnterior}º Trimestre
            </div>
            <div className="text-xl font-bold text-white mt-1">{brl(vgvAnterior)}</div>
          </div>
        </div>
      </div>
    </SlideChrome>
  )
}

function SlidePipeline({
  tri,
  cursos,
}: {
  tri: number
  cursos: { curso: string; total: number; faculdades: { faculdade: string; count: number }[] }[]
}) {
  return (
    <SlideChrome eyebrow={`Relatório Comercial ${tri}º Tri`} titulo="Pipeline de Oportunidades">
      {cursos.length === 0 ? (
        <div className="h-full flex items-center justify-center text-slate-500 text-sm">
          Nenhuma turma em aberto no funil.
        </div>
      ) : (
        <div className="grid gap-4 h-full" style={{ gridTemplateColumns: `repeat(${cursos.length}, minmax(0, 1fr))` }}>
          {cursos.map((c) => (
            <div key={c.curso} className="border-t-2 rounded-t-lg overflow-hidden flex flex-col" style={{ borderColor: ORANGE }}>
              <div className="bg-[#111111] px-4 py-3 flex items-center justify-between">
                <span className="font-bold text-lg">{c.curso}</span>
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: `${ORANGE}22`, color: ORANGE }}
                >
                  {c.total} ABERTAS
                </span>
              </div>
              <div className="flex-1 divide-y divide-white/5">
                {c.faculdades.map((f) => (
                  <div key={f.faculdade} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="text-slate-200 truncate pr-2">{f.faculdade}</span>
                    <span className="font-mono font-bold text-white">{String(f.count).padStart(2, '0')}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </SlideChrome>
  )
}

function SlideMarketShare({
  tri,
  cursos,
}: {
  tri: number
  cursos: { curso: string; total: number; faculdades: { faculdade: string; count: number; pct: number }[] }[]
}) {
  return (
    <SlideChrome eyebrow={`Relatório Comercial ${tri}º Tri`} titulo={`Market Share – ${tri}º TRI`}>
      {cursos.length === 0 ? (
        <div className="h-full flex items-center justify-center text-slate-500 text-sm">
          Nenhuma turma fechada neste período para calcular market share.
        </div>
      ) : (
        <div className="grid gap-6 h-full" style={{ gridTemplateColumns: `repeat(${cursos.length}, minmax(0, 1fr))` }}>
          {cursos.map((c) => (
            <div key={c.curso}>
              <div className="font-bold text-lg mb-4">{c.curso}</div>
              <div className="space-y-3">
                {c.faculdades.map((f) => (
                  <div key={f.faculdade}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-300">{f.faculdade}</span>
                      <span className="font-semibold text-white">{f.pct.toFixed(0)}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-white/[0.06] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.max(f.pct, 2)}%`, background: ORANGE }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </SlideChrome>
  )
}

function SlideFunil({
  tri,
  funil,
}: {
  tri: number
  funil: { comissao: number; turma: number; conversao: number }
}) {
  return (
    <SlideChrome eyebrow={`Relatório Comercial ${tri}º Tri`} titulo="Performance Comercial">
      <div className="grid grid-cols-2 gap-8 h-full items-center">
        <div className="space-y-3">
          <div className="bg-[#111111] border border-white/10 rounded-lg px-5 py-3 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Etapa 01</div>
              <div className="text-sm font-semibold text-white">Apresentações p/ Comissão</div>
            </div>
            <div className="text-2xl font-bold text-white">{String(funil.comissao).padStart(2, '0')}</div>
          </div>
          <div className="text-center text-slate-500">↓</div>
          <div className="bg-[#111111] border border-white/10 rounded-lg px-5 py-3 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Etapa 02</div>
              <div className="text-sm font-semibold text-white">Apresentações p/ Turma</div>
            </div>
            <div className="text-2xl font-bold text-white">{String(funil.turma).padStart(2, '0')}</div>
          </div>
          <div
            className="rounded-lg px-5 py-3 flex items-center justify-between mt-2"
            style={{ background: `${ORANGE}22`, border: `1px solid ${ORANGE}55` }}
          >
            <div className="text-[10px] uppercase tracking-wider" style={{ color: ORANGE }}>
              Resultado
            </div>
            <div className="text-2xl font-bold" style={{ color: ORANGE }}>
              {funil.conversao}%
            </div>
          </div>
        </div>
        <div className="space-y-4 text-xs">
          <div>
            <div className="font-semibold text-white mb-1">✓ Eficiência do Funil</div>
            <p className="text-slate-400 leading-relaxed">
              Relação entre apresentações para comissão e para turma, indicando a qualificação dos
              leads na entrada do funil.
            </p>
          </div>
          <div>
            <div className="font-semibold text-white mb-1">🏆 Taxa de Conversão</div>
            <p className="text-slate-400 leading-relaxed">
              {funil.conversao}% das apresentações para comissão avançaram para apresentação à turma
              inteira neste trimestre.
            </p>
          </div>
        </div>
      </div>
    </SlideChrome>
  )
}
