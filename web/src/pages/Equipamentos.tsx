import { useMemo, useState, useRef } from 'react'
import {
  Package,
  Search,
  Plus,
  Camera,
  ArrowUpRight,
  ArrowDownLeft,
  Phone,
  Pencil,
  ImageIcon,
  ChevronDown,
} from 'lucide-react'
import {
  useEquipamentos,
  type Equipamento,
  type Fotografo,
  type TipoMovimentacao,
} from '@/hooks/useEquipamentos'
import { SortControl, sortByField, type SortDirection } from '@/components/SortControl'
import { matchesSearch } from '@/utils/searchMatch'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

const SORT_OPTIONS = [
  { value: 'nome', label: 'Nome (A-Z)' },
  { value: 'categoria', label: 'Categoria' },
  { value: 'createdAt', label: 'Cadastrado em' },
]

function formatarQuando(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function Equipamentos() {
  const {
    fotografos,
    equipamentos,
    movimentacoes,
    loading,
    getStatusEquipamento,
    addFotografo,
    updateFotografo,
    addEquipamento,
    updateEquipamento,
    registrarMovimentacao,
  } = useEquipamentos()
  const { toast } = useToast()

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'todos' | 'disponivel' | 'em_uso' | 'inativo'>('todos')
  const [sortField, setSortField] = useState('nome')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [mostrarFotografos, setMostrarFotografos] = useState(false)

  const [equipamentoForm, setEquipamentoForm] = useState<Equipamento | null | 'novo'>(null)
  const [movimentar, setMovimentar] = useState<{ equipamento: Equipamento; tipo: TipoMovimentacao } | null>(null)

  const fotografoPorId = useMemo(() => new Map(fotografos.map((f) => [f.id, f])), [fotografos])
  const equipamentoPorId = useMemo(() => new Map(equipamentos.map((e) => [e.id, e])), [equipamentos])

  const enriched = useMemo(
    () =>
      equipamentos.map((e) => {
        const status = getStatusEquipamento(e.id)
        const statusChave: 'disponivel' | 'em_uso' | 'inativo' = !e.ativo
          ? 'inativo'
          : status.disponivel
            ? 'disponivel'
            : 'em_uso'
        return { ...e, status, statusChave }
      }),
    [equipamentos, getStatusEquipamento],
  )

  const filtered = useMemo(() => {
    const base = enriched.filter((e) => {
      if (statusFilter !== 'todos' && e.statusChave !== statusFilter) return false
      if (searchQuery.trim() && !matchesSearch([e.nome, e.categoria, e.codigo], searchQuery)) return false
      return true
    })
    return sortByField(base, sortField, sortDirection, (e, f) => (e as any)[f])
  }, [enriched, statusFilter, searchQuery, sortField, sortDirection])

  const atividadeRecente = useMemo(() => movimentacoes.slice(0, 15), [movimentacoes])

  const emUsoCount = enriched.filter((e) => e.statusChave === 'em_uso').length

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <Package className="w-6 h-6 text-orange-400" />
            Equipamentos
            <span className="text-xs px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-300 font-semibold border border-orange-500/25">
              {equipamentos.length}
            </span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Saída e entrada de equipamentos por fotógrafo, com foto de comprovação em cada
            movimentação — sempre dá pra ver com quem está e quem foi a última pessoa a pegar.
            {emUsoCount > 0 && <span className="text-amber-400"> {emUsoCount} em uso agora.</span>}
          </p>
        </div>
        <Button
          onClick={() => setEquipamentoForm('novo')}
          className="bg-orange-500 hover:bg-orange-600 text-white shrink-0"
        >
          <Plus className="w-4 h-4 mr-1.5" /> Novo equipamento
        </Button>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-[#111820] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
          >
            <option value="todos">Todos os status</option>
            <option value="disponivel">Disponível</option>
            <option value="em_uso">Em uso</option>
            <option value="inativo">Inativo</option>
          </select>
          <SortControl
            options={SORT_OPTIONS}
            field={sortField}
            direction={sortDirection}
            onFieldChange={setSortField}
            onDirectionToggle={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
          />
        </div>
        <div className="relative flex-1 sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome, categoria, código..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#111820] border border-white/[0.08] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>
      </div>

      <div className="space-y-2.5">
        {filtered.map((e) => (
          <EquipamentoRow
            key={e.id}
            equipamento={e}
            statusChave={e.statusChave}
            fotografoAtual={e.status.fotografoId ? fotografoPorId.get(e.status.fotografoId) : undefined}
            ultimoFotografo={e.status.ultimoFotografoId ? fotografoPorId.get(e.status.ultimoFotografoId) : undefined}
            onEditar={() => setEquipamentoForm(e)}
            onMovimentar={(tipo) => setMovimentar({ equipamento: e, tipo })}
          />
        ))}
        {!loading && filtered.length === 0 && (
          <div className="py-12 text-center text-slate-400 text-sm bg-[#0f1419] border border-white/[0.06] rounded-xl">
            Nenhum equipamento encontrado com os filtros atuais.
          </div>
        )}
        {loading && (
          <div className="py-12 text-center text-slate-400 text-sm">Carregando...</div>
        )}
      </div>

      <FotografosPanel
        open={mostrarFotografos}
        onToggle={() => setMostrarFotografos((v) => !v)}
        fotografos={fotografos}
        emUsoPorFotografo={useMemo(() => {
          const map = new Map<string, number>()
          enriched.forEach((e) => {
            if (e.status.fotografoId) map.set(e.status.fotografoId, (map.get(e.status.fotografoId) || 0) + 1)
          })
          return map
        }, [enriched])}
        onAdd={addFotografo}
        onUpdate={updateFotografo}
      />

      {atividadeRecente.length > 0 && (
        <div className="bg-[#0f1419] border border-white/[0.06] rounded-xl p-4">
          <h2 className="text-sm font-semibold text-white mb-3">Atividade recente</h2>
          <div className="space-y-2">
            {atividadeRecente.map((m) => {
              const equip = equipamentoPorId.get(m.equipamentoId)
              const foto = fotografoPorId.get(m.fotografoId)
              return (
                <div key={m.id} className="flex items-center gap-3 text-xs py-1.5 border-b border-white/[0.03] last:border-0">
                  <a href={m.fotoUrl} target="_blank" rel="noreferrer" className="shrink-0">
                    <img src={m.fotoUrl} alt="Comprovação" className="w-9 h-9 rounded-lg object-cover border border-white/10" />
                  </a>
                  <div className="min-w-0 flex-1">
                    <span className="text-slate-200 font-medium">{foto?.nome || 'Fotógrafo removido'}</span>{' '}
                    {m.tipo === 'saida' ? (
                      <span className="text-orange-300">pegou</span>
                    ) : (
                      <span className="text-emerald-300">devolveu</span>
                    )}{' '}
                    <span className="text-slate-300">{equip?.nome || 'equipamento removido'}</span>
                    {m.observacao && <span className="text-slate-500"> — {m.observacao}</span>}
                  </div>
                  <span className="text-slate-500 shrink-0">{formatarQuando(m.createdAt)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {equipamentoForm && (
        <EquipamentoFormModal
          equipamento={equipamentoForm === 'novo' ? null : equipamentoForm}
          onClose={() => setEquipamentoForm(null)}
          onSave={async (input) => {
            if (equipamentoForm === 'novo') {
              const novo = await addEquipamento(input)
              if (novo) toast({ title: 'Equipamento cadastrado' })
            } else if (equipamentoForm) {
              await updateEquipamento(equipamentoForm.id, input)
              toast({ title: 'Equipamento atualizado' })
            }
            setEquipamentoForm(null)
          }}
        />
      )}

      {movimentar && (
        <MovimentarModal
          equipamento={movimentar.equipamento}
          tipo={movimentar.tipo}
          fotografos={fotografos}
          fotografoSugerido={
            movimentar.tipo === 'entrada' ? getStatusEquipamento(movimentar.equipamento.id).fotografoId : null
          }
          onClose={() => setMovimentar(null)}
          onAddFotografo={addFotografo}
          onSave={async (input) => {
            const ok = await registrarMovimentacao({ ...input, equipamentoId: movimentar.equipamento.id, tipo: movimentar.tipo })
            if (ok) {
              toast({
                title: movimentar.tipo === 'saida' ? 'Saída registrada' : 'Entrada registrada',
                description: `${movimentar.equipamento.nome}`,
              })
              setMovimentar(null)
            }
          }}
        />
      )}
    </div>
  )
}

function statusBadge(chave: 'disponivel' | 'em_uso' | 'inativo', nomeFotografo?: string) {
  if (chave === 'inativo') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full bg-white/[0.04] text-slate-400 border border-white/[0.08]">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-500" /> Inativo
      </span>
    )
  }
  if (chave === 'disponivel') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/25">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Disponível
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/25">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Com {nomeFotografo || 'alguém'}
    </span>
  )
}

function EquipamentoRow({
  equipamento,
  statusChave,
  fotografoAtual,
  ultimoFotografo,
  onEditar,
  onMovimentar,
}: {
  equipamento: Equipamento
  statusChave: 'disponivel' | 'em_uso' | 'inativo'
  fotografoAtual?: Fotografo
  ultimoFotografo?: Fotografo
  onEditar: () => void
  onMovimentar: (tipo: TipoMovimentacao) => void
}) {
  return (
    <div className="bg-[#0f1419] border border-white/[0.06] rounded-xl p-3.5 flex items-center gap-3.5 hover:border-white/[0.12] transition-colors">
      <div className="w-11 h-11 rounded-lg border border-white/[0.08] bg-white/[0.02] flex items-center justify-center overflow-hidden shrink-0">
        {equipamento.fotoUrl ? (
          <img src={equipamento.fotoUrl} alt={equipamento.nome} className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-4.5 h-4.5 text-slate-600" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-white text-sm truncate">{equipamento.nome}</span>
          {statusBadge(statusChave, fotografoAtual?.nome)}
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5 truncate">
          {[equipamento.categoria, equipamento.codigo].filter(Boolean).join(' · ') || 'Sem categoria/código'}
          {ultimoFotografo && (
            <span className="text-slate-500"> · última pessoa a pegar: {ultimoFotografo.nome}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={onEditar}
          className="w-8 h-8 rounded-lg border border-white/[0.08] flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors"
          title="Editar equipamento"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        {statusChave !== 'inativo' &&
          (statusChave === 'disponivel' ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs border-orange-500/30 text-orange-300 hover:bg-orange-500/10 hover:text-orange-200"
              onClick={() => onMovimentar('saida')}
            >
              <ArrowUpRight className="w-3.5 h-3.5 mr-1" /> Saída
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200"
              onClick={() => onMovimentar('entrada')}
            >
              <ArrowDownLeft className="w-3.5 h-3.5 mr-1" /> Entrada
            </Button>
          ))}
      </div>
    </div>
  )
}

function FotografosPanel({
  open,
  onToggle,
  fotografos,
  emUsoPorFotografo,
  onAdd,
  onUpdate,
}: {
  open: boolean
  onToggle: () => void
  fotografos: Fotografo[]
  emUsoPorFotografo: Map<string, number>
  onAdd: (nome: string, telefone: string) => Promise<Fotografo | null>
  onUpdate: (id: string, updates: Partial<Pick<Fotografo, 'nome' | 'telefone' | 'ativo'>>) => Promise<void>
}) {
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [salvando, setSalvando] = useState(false)

  const handleAdd = async () => {
    if (!nome.trim()) return
    setSalvando(true)
    await onAdd(nome, telefone)
    setNome('')
    setTelefone('')
    setSalvando(false)
  }

  return (
    <div className="bg-[#0f1419] border border-white/[0.06] rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="text-sm font-semibold text-white">
          Fotógrafos <span className="text-slate-500 font-normal">({fotografos.length})</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="p-4 pt-0 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Nome do fotógrafo"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="text-xs"
            />
            <Input
              placeholder="Telefone (opcional)"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              className="text-xs sm:w-48"
            />
            <Button size="sm" disabled={!nome.trim() || salvando} onClick={handleAdd} className="bg-orange-500 hover:bg-orange-600 text-white shrink-0">
              <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar
            </Button>
          </div>
          <div className="space-y-1.5">
            {fotografos.map((f) => (
              <div key={f.id} className="flex items-center gap-3 text-xs py-1.5 px-2 rounded-lg hover:bg-white/[0.02]">
                <span className={`flex-1 truncate ${f.ativo ? 'text-slate-200' : 'text-slate-500 line-through'}`}>
                  {f.nome}
                </span>
                {f.telefone && (
                  <span className="text-slate-500 flex items-center gap-1 shrink-0">
                    <Phone className="w-3 h-3" /> {f.telefone}
                  </span>
                )}
                {(emUsoPorFotografo.get(f.id) || 0) > 0 && (
                  <span className="text-amber-300 shrink-0">{emUsoPorFotografo.get(f.id)} com ele agora</span>
                )}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] text-slate-500">Ativo</span>
                  <Switch checked={f.ativo} onCheckedChange={(v) => onUpdate(f.id, { ativo: v })} />
                </div>
              </div>
            ))}
            {fotografos.length === 0 && (
              <p className="text-xs text-slate-500 py-2">Nenhum fotógrafo cadastrado ainda.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function EquipamentoFormModal({
  equipamento,
  onClose,
  onSave,
}: {
  equipamento: Equipamento | null
  onClose: () => void
  onSave: (input: { nome: string; categoria: string; codigo: string; observacoes: string; foto?: File | null; ativo?: boolean }) => Promise<void>
}) {
  const [nome, setNome] = useState(equipamento?.nome || '')
  const [categoria, setCategoria] = useState(equipamento?.categoria || '')
  const [codigo, setCodigo] = useState(equipamento?.codigo || '')
  const [observacoes, setObservacoes] = useState(equipamento?.observacoes || '')
  const [ativo, setAtivo] = useState(equipamento?.ativo ?? true)
  const [foto, setFoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(equipamento?.fotoUrl || null)
  const [salvando, setSalvando] = useState(false)

  const handleFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFoto(f)
    setPreview(URL.createObjectURL(f))
  }

  const handleSubmit = async () => {
    if (!nome.trim()) return
    setSalvando(true)
    await onSave({ nome, categoria, codigo, observacoes, foto, ...(equipamento ? { ativo } : {}) })
    setSalvando(false)
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{equipamento ? 'Editar equipamento' : 'Novo equipamento'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-lg border border-dashed border-white/15 bg-white/[0.02] flex items-center justify-center overflow-hidden shrink-0">
              {preview ? (
                <img src={preview} alt="" className="w-full h-full object-cover" />
              ) : (
                <ImageIcon className="w-5 h-5 text-slate-600" />
              )}
            </div>
            <label className="text-xs text-orange-400 hover:text-orange-300 cursor-pointer">
              {preview ? 'Trocar foto' : 'Adicionar foto'} (opcional)
              <input type="file" accept="image/*" className="hidden" onChange={handleFoto} />
            </label>
          </div>
          <div>
            <Label htmlFor="eq-nome">Nome *</Label>
            <Input id="eq-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Câmera Sony A7III #2" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="eq-categoria">Categoria</Label>
              <Input id="eq-categoria" list="categorias-equip" value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Câmera, lente..." />
              <datalist id="categorias-equip">
                <option value="Câmera" />
                <option value="Lente" />
                <option value="Flash" />
                <option value="Bateria" />
                <option value="Cartão de memória" />
                <option value="Tripé" />
                <option value="Iluminação" />
              </datalist>
            </div>
            <div>
              <Label htmlFor="eq-codigo">Código / patrimônio</Label>
              <Input id="eq-codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Opcional" />
            </div>
          </div>
          <div>
            <Label htmlFor="eq-obs">Observações</Label>
            <Textarea id="eq-obs" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} />
          </div>
          {equipamento && (
            <div className="flex items-center justify-between pt-1">
              <div>
                <Label>Ativo</Label>
                <p className="text-[11px] text-slate-500">Desative se o equipamento quebrou ou sumiu de vez.</p>
              </div>
              <Switch checked={ativo} onCheckedChange={setAtivo} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!nome.trim() || salvando} onClick={handleSubmit} className="bg-orange-500 hover:bg-orange-600 text-white">
            {salvando ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MovimentarModal({
  equipamento,
  tipo,
  fotografos,
  fotografoSugerido,
  onClose,
  onAddFotografo,
  onSave,
}: {
  equipamento: Equipamento
  tipo: TipoMovimentacao
  fotografos: Fotografo[]
  fotografoSugerido?: string | null
  onClose: () => void
  onAddFotografo: (nome: string, telefone: string) => Promise<Fotografo | null>
  onSave: (input: { fotografoId: string; foto: File; observacao?: string }) => Promise<void>
}) {
  const ativos = fotografos.filter((f) => f.ativo)
  const [fotografoId, setFotografoId] = useState(fotografoSugerido || ativos[0]?.id || '')
  const [criandoFotografo, setCriandoFotografo] = useState(ativos.length === 0)
  const [novoNome, setNovoNome] = useState('')
  const [novoTelefone, setNovoTelefone] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFoto(f)
    setPreview(URL.createObjectURL(f))
  }

  const handleCriarFotografo = async () => {
    if (!novoNome.trim()) return
    const novo = await onAddFotografo(novoNome, novoTelefone)
    if (novo) {
      setFotografoId(novo.id)
      setCriandoFotografo(false)
      setNovoNome('')
      setNovoTelefone('')
    }
  }

  const handleSubmit = async () => {
    if (!fotografoId || !foto) return
    setSalvando(true)
    await onSave({ fotografoId, foto, observacao })
    setSalvando(false)
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {tipo === 'saida' ? (
              <ArrowUpRight className="w-4 h-4 text-orange-400" />
            ) : (
              <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
            )}
            {tipo === 'saida' ? 'Registrar saída' : 'Registrar entrada'} — {equipamento.nome}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{tipo === 'saida' ? 'Quem está pegando' : 'Quem está devolvendo'} *</Label>
            {!criandoFotografo ? (
              <div className="flex items-center gap-2">
                <select
                  value={fotografoId}
                  onChange={(e) => setFotografoId(e.target.value)}
                  className="flex-1 bg-[#111820] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                >
                  {ativos.map((f) => (
                    <option key={f.id} value={f.id}>{f.nome}</option>
                  ))}
                </select>
                <Button type="button" size="sm" variant="outline" onClick={() => setCriandoFotografo(true)}>
                  + Novo
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 border border-white/[0.08] rounded-lg p-2.5 bg-white/[0.02]">
                <Input placeholder="Nome do fotógrafo" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} className="text-xs" />
                <Input placeholder="Telefone (opcional)" value={novoTelefone} onChange={(e) => setNovoTelefone(e.target.value)} className="text-xs" />
                <div className="flex gap-2">
                  <Button type="button" size="sm" className="flex-1 bg-orange-500 hover:bg-orange-600 text-white" disabled={!novoNome.trim()} onClick={handleCriarFotografo}>
                    Salvar fotógrafo
                  </Button>
                  {ativos.length > 0 && (
                    <Button type="button" size="sm" variant="outline" onClick={() => setCriandoFotografo(false)}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
          <div>
            <Label>Foto de comprovação *</Label>
            <div className="flex items-center gap-3 mt-1">
              <div className="w-16 h-16 rounded-lg border border-dashed border-white/15 bg-white/[0.02] flex items-center justify-center overflow-hidden shrink-0">
                {preview ? (
                  <img src={preview} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Camera className="w-5 h-5 text-slate-600" />
                )}
              </div>
              <label className="text-xs text-orange-400 hover:text-orange-300 cursor-pointer">
                {preview ? 'Trocar foto' : 'Tirar / escolher foto'}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFoto} />
              </label>
            </div>
          </div>
          <div>
            <Label htmlFor="mov-obs">Observação</Label>
            <Textarea id="mov-obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} placeholder="Opcional — ex: estado do equipamento" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={!fotografoId || !foto || salvando}
            onClick={handleSubmit}
            className={tipo === 'saida' ? 'bg-orange-500 hover:bg-orange-600 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}
          >
            {salvando ? 'Salvando...' : tipo === 'saida' ? 'Confirmar saída' : 'Confirmar entrada'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
