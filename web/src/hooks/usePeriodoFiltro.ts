import { useEffect, useMemo, useState } from 'react'

export type Periodo = 'mes' | 'trimestre' | 'semestre' | 'ano' | 'ate_hoje' | 'personalizado'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

/** Calcula De/Até para um período pré-definido, com ano/trimestre/semestre/mês
 * escolhidos explicitamente pelo usuário (não fica preso ao período atual —
 * dá pra navegar entre trimestres/semestres/anos passados). */
export function calcularPeriodo(
  periodo: Periodo,
  ano: number,
  trimestre: 1 | 2 | 3 | 4,
  semestre: 1 | 2,
  mes: number,
): { ini: string; fim: string } {
  if (periodo === 'mes') {
    return { ini: toISO(new Date(ano, mes - 1, 1)), fim: toISO(new Date(ano, mes, 0)) }
  }
  if (periodo === 'trimestre') {
    const inicioTri = (trimestre - 1) * 3
    return { ini: toISO(new Date(ano, inicioTri, 1)), fim: toISO(new Date(ano, inicioTri + 3, 0)) }
  }
  if (periodo === 'semestre') {
    const inicioSem = semestre === 1 ? 0 : 6
    return { ini: toISO(new Date(ano, inicioSem, 1)), fim: toISO(new Date(ano, inicioSem + 6, 0)) }
  }
  if (periodo === 'ate_hoje') {
    // Do dia 1º de janeiro do ano escolhido até hoje — nunca inclui meses
    // futuros que ainda não aconteceram (diferente de "Ano", que vai até 31/12).
    const hoje = new Date()
    const fimAno = new Date(ano, 11, 31)
    const fim = fimAno < hoje ? fimAno : hoje
    return { ini: toISO(new Date(ano, 0, 1)), fim: toISO(fim) }
  }
  // 'ano'
  return { ini: toISO(new Date(ano, 0, 1)), fim: toISO(new Date(ano, 11, 31)) }
}

/** Estado + lógica compartilhada do seletor de período (Mês/Trimestre/Semestre/
 * Ano/Até Hoje/Personalizado) usado no DRE e no Financeiro, pra manter os dois
 * consistentes e não duplicar a lógica de cálculo de datas. */
export function usePeriodoFiltro(periodoInicial: Periodo = 'ate_hoje') {
  const hoje = new Date()
  const anoAtual = hoje.getFullYear()
  const [periodo, setPeriodo] = useState<Periodo>(periodoInicial)
  const [anoRef, setAnoRef] = useState(anoAtual)
  const [trimestreRef, setTrimestreRef] = useState<1 | 2 | 3 | 4>(
    (Math.floor(hoje.getMonth() / 3) + 1) as 1 | 2 | 3 | 4,
  )
  const [semestreRef, setSemestreRef] = useState<1 | 2>(hoje.getMonth() < 6 ? 1 : 2)
  const [mesRef, setMesRef] = useState(hoje.getMonth() + 1)

  const inicial = calcularPeriodo(periodoInicial, anoAtual, 1, 1, 1)
  const [dtIni, setDtIni] = useState(inicial.ini)
  const [dtFim, setDtFim] = useState(inicial.fim)

  const [dtIniInput, setDtIniInput] = useState(inicial.ini)
  const [dtFimInput, setDtFimInput] = useState(inicial.fim)
  const [filtroAplicado, setFiltroAplicado] = useState(false)

  useEffect(() => {
    if (periodo === 'personalizado') return
    const { ini, fim } = calcularPeriodo(periodo, anoRef, trimestreRef, semestreRef, mesRef)
    setDtIni(ini)
    setDtFim(fim)
  }, [periodo, anoRef, trimestreRef, semestreRef, mesRef])

  const anosDisponiveis = useMemo(() => {
    const lista: number[] = []
    for (let a = anoAtual + 1; a >= anoAtual - 5; a--) lista.push(a)
    return lista
  }, [anoAtual])

  function selecionarPeriodo(p: Periodo) {
    setPeriodo(p)
    if (p === 'personalizado') {
      setDtIniInput(dtIni)
      setDtFimInput(dtFim)
      setFiltroAplicado(false)
    }
  }

  function aplicarFiltroPersonalizado() {
    setDtIni(dtIniInput)
    setDtFim(dtFimInput)
    setFiltroAplicado(true)
  }

  return {
    periodo,
    anoRef,
    setAnoRef,
    trimestreRef,
    setTrimestreRef,
    semestreRef,
    setSemestreRef,
    mesRef,
    setMesRef,
    dtIni,
    dtFim,
    dtIniInput,
    setDtIniInput: (v: string) => {
      setDtIniInput(v)
      setFiltroAplicado(false)
    },
    dtFimInput,
    setDtFimInput: (v: string) => {
      setDtFimInput(v)
      setFiltroAplicado(false)
    },
    filtroAplicado,
    anosDisponiveis,
    selecionarPeriodo,
    aplicarFiltroPersonalizado,
  }
}

export type PeriodoFiltroState = ReturnType<typeof usePeriodoFiltro>
