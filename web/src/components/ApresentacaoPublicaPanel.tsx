import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Trash2, Link2, Check, Globe, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  getOrCreateApresentacao,
  atualizarApresentacao,
  uploadFotoApresentacao,
  removerFotoApresentacao,
  linkPublicoApresentacao,
  type ApresentacaoPublica,
} from '@/utils/apresentacaoPublica'

export default function ApresentacaoPublicaPanel({ turmaId }: { turmaId: string }) {
  const { toast } = useToast()
  const [ap, setAp] = useState<ApresentacaoPublica | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [subindo, setSubindo] = useState(false)
  const [salvandoMsg, setSalvandoMsg] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getOrCreateApresentacao(turmaId)
      .then((a) => {
        setAp(a)
        setMensagem(a.mensagem || '')
      })
      .catch(() => toast({ title: 'Erro ao carregar apresentação', variant: 'destructive' }))
      .finally(() => setCarregando(false))
  }, [turmaId])

  async function onFiles(files: FileList | null) {
    if (!files || !ap) return
    setSubindo(true)
    try {
      const novas: string[] = []
      for (const f of Array.from(files)) {
        if (!f.type.startsWith('image/')) continue
        novas.push(await uploadFotoApresentacao(turmaId, f))
      }
      const fotos = [...ap.fotos, ...novas]
      await atualizarApresentacao(ap.id, { fotos })
      setAp({ ...ap, fotos })
    } catch (e: any) {
      toast({ title: 'Erro ao enviar foto', description: e.message, variant: 'destructive' })
    } finally {
      setSubindo(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function removerFoto(url: string) {
    if (!ap) return
    const fotos = ap.fotos.filter((f) => f !== url)
    await atualizarApresentacao(ap.id, { fotos })
    setAp({ ...ap, fotos })
    removerFotoApresentacao(url).catch(() => {})
  }

  async function togglePublicar() {
    if (!ap) return
    const publicada = !ap.publicada
    await atualizarApresentacao(ap.id, { publicada })
    setAp({ ...ap, publicada })
    toast({
      title: publicada ? 'Apresentação publicada' : 'Apresentação despublicada',
      description: publicada ? 'Já pode mandar o link pra turma.' : 'O link para de funcionar.',
    })
  }

  async function salvarMensagem() {
    if (!ap) return
    setSalvandoMsg(true)
    try {
      await atualizarApresentacao(ap.id, { mensagem: mensagem.trim() || null })
      setAp({ ...ap, mensagem: mensagem.trim() || null })
    } finally {
      setSalvandoMsg(false)
    }
  }

  function copiarLink() {
    if (!ap) return
    navigator.clipboard.writeText(linkPublicoApresentacao(ap.token))
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  if (carregando)
    return <p className="text-slate-500 text-xs">Carregando apresentação…</p>
  if (!ap) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200">
        <Globe className="w-3.5 h-3.5 text-orange-500" /> Apresentação pública
      </div>

      {/* Fotos */}
      <div className="grid grid-cols-4 gap-1.5">
        {ap.fotos.map((url) => (
          <div key={url} className="relative group aspect-square rounded-md overflow-hidden border border-white/10">
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => removerFoto(url)}
              className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={subindo}
          className="aspect-square rounded-md border border-dashed border-white/20 flex items-center justify-center text-slate-500 hover:text-orange-400 hover:border-orange-400/40"
        >
          {subindo ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => onFiles(e.target.files)}
        />
      </div>

      {/* Recado pra turma */}
      <div>
        <label className="text-[11px] text-slate-500 block mb-1">Recado pra turma (opcional)</label>
        <textarea
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          onBlur={salvarMensagem}
          rows={2}
          placeholder="ex: Galera, segue a apresentação com os pacotes e algumas fotos nossas 💛"
          className="w-full bg-[#0a0f14] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 placeholder-slate-600"
        />
        {salvandoMsg && <span className="text-[10px] text-slate-500">salvando…</span>}
      </div>

      {/* Publicar + link */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={togglePublicar}
          className={`text-xs font-semibold rounded-lg px-3 py-1.5 border transition-colors ${
            ap.publicada
              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
              : 'border-white/15 text-slate-300 hover:border-white/25'
          }`}
        >
          {ap.publicada ? 'Publicada ✓' : 'Publicar'}
        </button>
        <button
          type="button"
          onClick={copiarLink}
          disabled={!ap.publicada}
          className="text-xs rounded-lg px-3 py-1.5 border border-white/15 text-slate-300 hover:border-white/25 disabled:opacity-40 inline-flex items-center gap-1.5"
        >
          {copiado ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Link2 className="w-3.5 h-3.5" />}
          {copiado ? 'Copiado' : 'Copiar link'}
        </button>
        {ap.publicada && (
          <a
            href={linkPublicoApresentacao(ap.token)}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-slate-500 hover:text-orange-400 underline decoration-dotted"
          >
            abrir
          </a>
        )}
      </div>
      {!ap.publicada && (
        <p className="text-[10px] text-slate-500">
          Publique pra gerar o link. Fotos + pacotes ficam visíveis pra quem tiver o link.
        </p>
      )}
    </div>
  )
}
