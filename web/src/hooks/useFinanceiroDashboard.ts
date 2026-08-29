import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { fetchAllRows } from '@/utils/fetchAllRows'

// Carrega uma única vez pagamentos / contas a pagar / adesões e expõe agregados
// por período — mesma base de caixa usada em Financeiro/DRE (recebido pela
// data_pagamento, não pela data de vencimento).

export interface PagamentoRow {
  valor: number
  valor_pago: number | null
  status: string
  data_vencimento: string | null
  data_pagamento: string | null
  empresa: string | null
}
export interface ContaPagarRow {
  valor: number
  status: string
  data_vencimento: string | null
  data_pagamento: string | null
  empresa: string | null
}
export interface AdesaoRow {
  valor: number
  status: string
  data_adesao: string | null
  turma: string | null
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Desloca [ini,fim] um ano pra trás, pra comparação ano a ano. */
export function periodoAnoAnterior(ini: string, fim: string): { ini: string; fim: string } {
  const di = new Date(`${ini}T00:00:00`)
  const df = new Date(`${fim}T00:00:00`)
  di.setFullYear(di.getFullYear() - 1)
  df.setFullYear(df.getFullYear() - 1)
  return { ini: di.toISOString().slice(0, 10), fim: df.toISOString().slice(0, 10) }
}

export interface FinanceiroDashboardAgregado {
  recebido: number
  recebidoAnterior: number
  contasPagas: number
  resultado: number
  inadimplencia: number
  aReceberEmAberto: number
  aPagarProx30: number
  adesoesQtd: number
  adesoesValor: number
  adesoesTicket: number
  adesoesQtdAnterior: number
  adesoesValorAnterior: number
  fluxoMensal: { mes: string; recebido: number; previsto: number }[]
}

export function useFinanceiroDashboard(
  dtIni: string,
  dtFim: string,
  empresas: string[],
  ativo = true,
) {
  const [pagamentos, setPagamentos] = useState<PagamentoRow[]>([])
  const [contasPagar, setContasPagar] = useState<ContaPagarRow[]>([])
  const [adesoes, setAdesoes] = useState<AdesaoRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!ativo) {
      setLoading(false)
      return
    }
    let cancelado = false
    async function load() {
      setLoading(true)
      const [pg, cp, ad] = await Promise.all([
        fetchAllRows<any>(() =>
          supabase
            .from('pagamentos')
            .select('valor, valor_pago, status, data_vencimento, data_pagamento, turmas(empresa)')
            .neq('status', 'cancelado')
            .order('id') as any,
        ),
        fetchAllRows<any>(() =>
          supabase
            .from('contas_pagar')
            .select('valor, status, data_vencimento, data_pagamento, turmas(empresa)')
            .neq('status', 'cancelado')
            .order('id') as any,
        ),
        fetchAllRows<any>(() =>
          supabase
            .from('sge_adesoes')
            .select('valor, status, data_adesao, turma')
            .neq('status', 'cancelado')
            .order('id') as any,
        ),
      ])
      if (cancelado) return
      setPagamentos(pg.map((p) => ({ ...p, empresa: p.turmas?.empresa ?? null })))
      setContasPagar(cp.map((c) => ({ ...c, empresa: c.turmas?.empresa ?? null })))
      setAdesoes(ad as AdesaoRow[])
      setLoading(false)
    }
    load()
    return () => {
      cancelado = true
    }
  }, [ativo])

  const agregado: FinanceiroDashboardAgregado = useMemo(() => {
    const daEmpresa = (emp: string | null) => empresas.length === 0 || (!!emp && empresas.includes(emp))
    const noPeriodo = (d: string | null, ini = dtIni, fim = dtFim) => !!d && d >= ini && d <= fim
    const ant = periodoAnoAnterior(dtIni, dtFim)

    let recebido = 0
    let recebidoAnterior = 0
    let inadimplencia = 0
    let aReceberEmAberto = 0
    for (const p of pagamentos) {
      if (!daEmpresa(p.empresa)) continue
      if (p.status === 'pago') {
        if (noPeriodo(p.data_pagamento)) recebido += Number(p.valor_pago || 0)
        if (noPeriodo(p.data_pagamento, ant.ini, ant.fim))
          recebidoAnterior += Number(p.valor_pago || 0)
      } else {
        const aberto = Number(p.valor || 0) - Number(p.valor_pago || 0)
        aReceberEmAberto += aberto
        if (p.status === 'atrasado') inadimplencia += aberto
      }
    }

    let contasPagas = 0
    let aPagarProx30 = 0
    const h = hoje()
    const em30 = new Date()
    em30.setDate(em30.getDate() + 30)
    const lim30 = em30.toISOString().slice(0, 10)
    for (const c of contasPagar) {
      if (!daEmpresa(c.empresa)) continue
      if (c.status === 'pago' && noPeriodo(c.data_pagamento)) contasPagas += Number(c.valor || 0)
      if (c.status !== 'pago' && c.data_vencimento && c.data_vencimento >= h && c.data_vencimento <= lim30)
        aPagarProx30 += Number(c.valor || 0)
    }

    // Adesões (dados do SGE — não têm empresa direta, o texto da turma começa com a marca)
    const adesaoDaEmpresa = (turma: string | null) => {
      if (empresas.length === 0) return true
      const marca = (turma || '').trim().split(/\s+/)[0]
      return empresas.includes(marca)
    }
    let adesoesQtd = 0
    let adesoesValor = 0
    let adesoesQtdAnterior = 0
    let adesoesValorAnterior = 0
    for (const a of adesoes) {
      if (!adesaoDaEmpresa(a.turma)) continue
      if (noPeriodo(a.data_adesao)) {
        adesoesQtd += 1
        adesoesValor += Number(a.valor || 0)
      }
      if (noPeriodo(a.data_adesao, ant.ini, ant.fim)) {
        adesoesQtdAnterior += 1
        adesoesValorAnterior += Number(a.valor || 0)
      }
    }

    // Fluxo de caixa dos últimos 12 meses ATÉ o mês corrente — sem incluir
    // meses futuros (o SGE já agenda parcelas de anos à frente, e elas não
    // devem entrar num gráfico de "últimos 12 meses").
    const agora = new Date()
    const mesAtualKey = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`
    const inicioJanela = new Date(agora.getFullYear(), agora.getMonth() - 11, 1)
    const janelaKey = `${inicioJanela.getFullYear()}-${String(inicioJanela.getMonth() + 1).padStart(2, '0')}`
    const dentroJanela = (k: string) => k >= janelaKey && k <= mesAtualKey

    const porMes: Record<string, { mes: string; recebido: number; previsto: number }> = {}
    for (const p of pagamentos) {
      if (!daEmpresa(p.empresa)) continue
      if (p.data_vencimento) {
        const k = p.data_vencimento.slice(0, 7)
        if (dentroJanela(k)) (porMes[k] ||= { mes: k, recebido: 0, previsto: 0 }).previsto += Number(p.valor || 0)
      }
      if (p.status === 'pago' && p.data_pagamento) {
        const k = p.data_pagamento.slice(0, 7)
        if (dentroJanela(k)) (porMes[k] ||= { mes: k, recebido: 0, previsto: 0 }).recebido += Number(p.valor_pago || 0)
      }
    }
    const fluxoMensal = Object.values(porMes).sort((a, b) => a.mes.localeCompare(b.mes))

    return {
      recebido,
      recebidoAnterior,
      contasPagas,
      resultado: recebido - contasPagas,
      inadimplencia,
      aReceberEmAberto,
      aPagarProx30,
      adesoesQtd,
      adesoesValor,
      adesoesTicket: adesoesQtd > 0 ? adesoesValor / adesoesQtd : 0,
      adesoesQtdAnterior,
      adesoesValorAnterior,
      fluxoMensal,
    }
  }, [pagamentos, contasPagar, adesoes, dtIni, dtFim, empresas])

  return { agregado, loading }
}
