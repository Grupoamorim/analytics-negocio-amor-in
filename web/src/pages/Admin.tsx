import { useEffect, useMemo, useState } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { ShieldCheck, Users, UploadCloud, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'

interface Perfil {
  id: string
  email: string
  nome: string
  role: 'admin' | 'financeiro' | 'comercial' | 'membro'
  created_at: string
}

const CARGOS: { value: Perfil['role']; label: string }[] = [
  { value: 'admin', label: 'Administrador' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'membro', label: 'Membro' },
]

type TipoImportacao = 'receber' | 'pagar'

const CAMPOS_RECEBER = [
  { key: 'data_vencimento', label: 'Data de Vencimento', obrigatorio: true },
  { key: 'valor', label: 'Valor', obrigatorio: true },
  { key: 'valor_pago', label: 'Valor Pago', obrigatorio: false },
  { key: 'data_pagamento', label: 'Data de Pagamento', obrigatorio: false },
] as const

const CAMPOS_PAGAR = [
  { key: 'data_vencimento', label: 'Data de Vencimento', obrigatorio: true },
  { key: 'valor', label: 'Valor', obrigatorio: true },
  { key: 'descricao', label: 'Descrição', obrigatorio: false },
  { key: 'fornecedor', label: 'Fornecedor', obrigatorio: false },
  { key: 'categoria', label: 'Categoria', obrigatorio: false },
  { key: 'data_pagamento', label: 'Data de Pagamento', obrigatorio: false },
] as const

function hashSimples(txt: string): string {
  let h = 0
  for (let i = 0; i < txt.length; i++) {
    h = (h << 5) - h + txt.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h).toString(36)
}

function paraDataISO(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') {
    // número serial do Excel
    const d = XLSX.SSF.parse_date_code(v)
    if (!d) return null
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const txt = String(v).trim()
  // dd/mm/aaaa
  const br = txt.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`
  // aaaa-mm-dd (já no formato certo)
  const iso = txt.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  return null
}

function paraNumero(v: unknown): number {
  if (typeof v === 'number') return v
  if (!v) return 0
  const limpo = String(v)
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3},)/g, '')
    .replace(',', '.')
  const n = parseFloat(limpo)
  return isNaN(n) ? 0 : n
}

export default function Admin() {
  const { user } = useAuth()
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [carregandoPerfis, setCarregandoPerfis] = useState(true)
  const [salvandoId, setSalvandoId] = useState<string | null>(null)

  const [tipo, setTipo] = useState<TipoImportacao>('receber')
  const [linhas, setLinhas] = useState<Record<string, unknown>[]>([])
  const [colunas, setColunas] = useState<string[]>([])
  const [mapa, setMapa] = useState<Record<string, string>>({})
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)

  useEffect(() => {
    async function carregar() {
      setCarregandoPerfis(true)
      const { data } = await supabase.from('profiles').select('*').order('created_at')
      setPerfis((data || []) as Perfil[])
      setCarregandoPerfis(false)
    }
    carregar()
  }, [])

  async function mudarCargo(id: string, role: Perfil['role']) {
    setSalvandoId(id)
    await supabase.from('profiles').update({ role }).eq('id', id)
    setPerfis((prev) => prev.map((p) => (p.id === id ? { ...p, role } : p)))
    setSalvandoId(null)
  }

  function handleArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    setResultado(null)

    if (arquivo.name.toLowerCase().endsWith('.csv')) {
      Papa.parse(arquivo, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          const linhas = res.data as Record<string, unknown>[]
          setLinhas(linhas)
          setColunas(res.meta.fields || [])
          setMapa({})
        },
      })
    } else {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const wb = XLSX.read(ev.target?.result, { type: 'binary', cellDates: false })
        const primeiraAba = wb.SheetNames[0]
        const json = XLSX.utils.sheet_to_json(wb.Sheets[primeiraAba], { defval: '' }) as Record<
          string,
          unknown
        >[]
        setLinhas(json)
        setColunas(json.length ? Object.keys(json[0]) : [])
        setMapa({})
      }
      reader.readAsBinaryString(arquivo)
    }
  }

  const camposAlvo = tipo === 'receber' ? CAMPOS_RECEBER : CAMPOS_PAGAR
  const mapaCompleto = camposAlvo.every((c) => !c.obrigatorio || mapa[c.key])

  async function importar() {
    setImportando(true)
    setResultado(null)
    try {
      const registros = linhas
        .map((linha) => {
          const dataVenc = paraDataISO(linha[mapa['data_vencimento']])
          if (!dataVenc) return null
          const valor = paraNumero(linha[mapa['valor']])
          const chaveBase = `${dataVenc}|${valor}|${JSON.stringify(linha)}`
          const codigoSge = `import-${hashSimples(chaveBase)}`

          if (tipo === 'receber') {
            const valorPago = mapa['valor_pago'] ? paraNumero(linha[mapa['valor_pago']]) : 0
            const dataPagamento = mapa['data_pagamento'] ? paraDataISO(linha[mapa['data_pagamento']]) : null
            const hoje = new Date().toISOString().slice(0, 10)
            const status =
              valorPago > 0 && valorPago >= valor ? 'pago' : dataVenc < hoje ? 'atrasado' : 'pendente'
            return {
              codigo_sge: codigoSge,
              data_vencimento: dataVenc,
              data_pagamento: dataPagamento,
              valor,
              valor_pago: valorPago,
              status,
            }
          }

          const dataPagamento = mapa['data_pagamento'] ? paraDataISO(linha[mapa['data_pagamento']]) : null
          const hoje = new Date().toISOString().slice(0, 10)
          const status = dataPagamento ? 'pago' : dataVenc < hoje ? 'atrasado' : 'pendente'
          return {
            codigo_sge: codigoSge,
            descricao: mapa['descricao'] ? String(linha[mapa['descricao']] || 'Sem descrição') : 'Importado',
            fornecedor: mapa['fornecedor'] ? String(linha[mapa['fornecedor']] || '') : null,
            categoria: mapa['categoria'] ? String(linha[mapa['categoria']] || '') : null,
            data_vencimento: dataVenc,
            data_pagamento: dataPagamento,
            valor,
            status,
          }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)

      const tabela = tipo === 'receber' ? 'pagamentos' : 'contas_pagar'
      let total = 0
      for (let i = 0; i < registros.length; i += 500) {
        const lote = registros.slice(i, i + 500)
        const { error } = await supabase.from(tabela).upsert(lote, { onConflict: 'codigo_sge' })
        if (error) throw error
        total += lote.length
      }
      setResultado(`✅ ${total} lançamentos importados com sucesso.`)
      setLinhas([])
      setColunas([])
      setMapa({})
    } catch (err) {
      setResultado(`⚠️ Erro ao importar: ${(err as Error).message}`)
    } finally {
      setImportando(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-orange-400" /> Administração
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Gerencie usuários, cargos e importe o histórico financeiro do SGE
        </p>
      </div>

      {/* Usuários */}
      <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-orange-400" /> Usuários e Cargos
        </h2>
        {carregandoPerfis ? (
          <div className="text-sm text-slate-400">Carregando...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 text-xs uppercase border-b border-white/[0.06]">
                <th className="py-2">Nome</th>
                <th className="py-2">E-mail</th>
                <th className="py-2">Cargo</th>
              </tr>
            </thead>
            <tbody>
              {perfis.map((p) => (
                <tr key={p.id} className="border-b border-white/[0.04]">
                  <td className="py-2.5 text-slate-200">
                    {p.nome} {p.id === user?.id && <span className="text-orange-400 text-xs">(você)</span>}
                  </td>
                  <td className="py-2.5 text-slate-400">{p.email}</td>
                  <td className="py-2.5">
                    <select
                      value={p.role}
                      disabled={salvandoId === p.id}
                      onChange={(e) => mudarCargo(p.id, e.target.value as Perfil['role'])}
                      className="bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-1 text-slate-200 text-xs"
                    >
                      {CARGOS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Importação de planilhas */}
      <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
          <UploadCloud className="w-4 h-4 text-orange-400" /> Importar Histórico do SGE
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          Suba a planilha (CSV ou Excel) exportada do SGE pra completar o histórico que a API não
          alcança (mais de 2 meses atrás). Pode importar quantas vezes precisar — arquivos repetidos não
          duplicam os lançamentos.
        </p>

        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => {
              setTipo('receber')
              setMapa({})
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
              tipo === 'receber'
                ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
                : 'text-slate-400 border-white/[0.08]'
            }`}
          >
            Contas a Receber
          </button>
          <button
            onClick={() => {
              setTipo('pagar')
              setMapa({})
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
              tipo === 'pagar'
                ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
                : 'text-slate-400 border-white/[0.08]'
            }`}
          >
            Contas a Pagar
          </button>
        </div>

        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleArquivo}
          className="text-xs text-slate-400 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-orange-500 file:text-white file:text-xs file:font-semibold"
        />

        {colunas.length > 0 && (
          <div className="mt-5 space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-slate-300 mb-2">
                Diga qual coluna da planilha é cada informação
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {camposAlvo.map((campo) => (
                  <div key={campo.key} className="flex items-center gap-2">
                    <label className="text-xs text-slate-400 w-40 flex-shrink-0">
                      {campo.label}
                      {campo.obrigatorio && <span className="text-orange-400"> *</span>}
                    </label>
                    <select
                      value={mapa[campo.key] || ''}
                      onChange={(e) => setMapa((m) => ({ ...m, [campo.key]: e.target.value }))}
                      className="flex-1 bg-[#0a0f14] border border-white/[0.1] rounded-lg px-2 py-1.5 text-slate-200 text-xs"
                    >
                      <option value="">— não mapeado —</option>
                      {colunas.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs text-slate-500">{linhas.length} linhas detectadas na planilha.</p>

            <Button
              onClick={importar}
              disabled={!mapaCompleto || importando}
              className="bg-orange-500 hover:bg-orange-600 text-white font-semibold"
            >
              {importando ? 'Importando...' : `Importar ${linhas.length} lançamentos`}
            </Button>
          </div>
        )}

        {resultado && (
          <div className="mt-4 text-sm flex items-center gap-2 text-slate-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> {resultado}
          </div>
        )}
      </div>
    </div>
  )
}
