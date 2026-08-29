// Cálculo de "pace" (ritmo) contra uma meta de período. Compara o realizado
// acumulado com a linha reta da meta e projeta o fechamento se o ritmo atual
// se mantiver.

export interface PontoDiario {
  data: string // YYYY-MM-DD
  valor: number // valor DO DIA (não acumulado)
}

export interface PaceResultado {
  meta: number
  realizado: number
  /** Fração do período já decorrida (0..1). */
  fracaoDecorrida: number
  /** Onde deveríamos estar hoje se a meta fosse linear. */
  metaProRata: number
  /** realizado ÷ metaProRata. >1 = adiantado. */
  indicePace: number
  /** Projeção de fechamento mantendo o ritmo atual. */
  projecao: number
  /** meta − realizado. */
  faltam: number
  diasRestantes: number
  /** Quanto precisa por dia / por semana daqui pra frente pra bater a meta. */
  ritmoDiarioNecessario: number
  ritmoSemanalNecessario: number
  /** Ritmo médio realizado por dia até agora. */
  ritmoDiarioAtual: number
  status: 'adiantado' | 'no ritmo' | 'atrasado' | 'batida'
  /** Série pro gráfico: acumulado realizado + linha da meta, dia a dia. */
  serie: { label: string; Realizado: number | null; Meta: number }[]
  /** label (MM-DD) do dia de hoje dentro da série. */
  hojeLabel: string
}

function diasEntre(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86400000,
  )
}

function addDias(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export function calcularPace(
  meta: number,
  ini: string,
  fim: string,
  pontos: PontoDiario[],
  hojeISO = new Date().toISOString().slice(0, 10),
): PaceResultado {
  const totalDias = Math.max(1, diasEntre(ini, fim) + 1)
  const hoje = hojeISO < ini ? ini : hojeISO > fim ? fim : hojeISO
  const diasDecorridos = Math.min(totalDias, Math.max(0, diasEntre(ini, hoje) + 1))
  const fracaoDecorrida = diasDecorridos / totalDias
  const diasRestantes = Math.max(0, totalDias - diasDecorridos)

  const porDia = new Map<string, number>()
  for (const p of pontos) {
    if (p.data < ini || p.data > fim) continue
    porDia.set(p.data, (porDia.get(p.data) || 0) + (p.valor || 0))
  }

  let acumulado = 0
  let realizado = 0
  const serie: PaceResultado['serie'] = []
  for (let i = 0; i < totalDias; i++) {
    const dia = addDias(ini, i)
    acumulado += porDia.get(dia) || 0
    const passou = dia > hoje
    if (!passou) realizado = acumulado
    serie.push({
      label: dia.slice(5), // MM-DD
      Realizado: passou ? null : Math.round(acumulado),
      Meta: Math.round((meta * (i + 1)) / totalDias),
    })
  }

  const metaProRata = meta * fracaoDecorrida
  const indicePace = metaProRata > 0 ? realizado / metaProRata : realizado > 0 ? 2 : 0
  const projecao = fracaoDecorrida > 0 ? realizado / fracaoDecorrida : 0
  const faltam = Math.max(0, meta - realizado)
  const ritmoDiarioNecessario = diasRestantes > 0 ? faltam / diasRestantes : faltam
  const ritmoDiarioAtual = diasDecorridos > 0 ? realizado / diasDecorridos : 0

  let status: PaceResultado['status']
  if (realizado >= meta) status = 'batida'
  else if (indicePace >= 1.03) status = 'adiantado'
  else if (indicePace >= 0.92) status = 'no ritmo'
  else status = 'atrasado'

  return {
    meta,
    realizado,
    fracaoDecorrida,
    metaProRata,
    indicePace,
    projecao,
    faltam,
    diasRestantes,
    ritmoDiarioNecessario,
    ritmoSemanalNecessario: ritmoDiarioNecessario * 7,
    ritmoDiarioAtual,
    status,
    serie,
    hojeLabel: hoje.slice(5),
  }
}
