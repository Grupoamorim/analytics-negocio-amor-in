import { useEffect, useMemo, useState } from 'react'
import { MessageSquare, Download, ExternalLink, CheckCircle2, Users, User, Wifi, FileText } from 'lucide-react'
import { useCRM } from '@/context/CRMContext'
import { useAcesso } from '@/context/AcessoContext'
import { fetchTodasConversas, type ConversaMsg } from '@/utils/conversas'
import { resumoPorVendedor, type ResumoVendedor } from '@/utils/conversasResumo'
import { supabase } from '@/lib/supabase/client'

type Aba = 'instalar' | 'status' | 'mensagens' | 'meu' | 'geral'

export default function WhatsappComercial() {
  const { deals } = useCRM()
  const { userId, nome, isAdmin, usuarios } = useAcesso()
  const [aba, setAba] = useState<Aba>('instalar')
  const [msgs, setMsgs] = useState<ConversaMsg[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    fetchTodasConversas()
      .then(setMsgs)
      .catch(() => setMsgs([]))
      .finally(() => setCarregando(false))
  }, [])

  const resumos = useMemo(
    () => resumoPorVendedor(msgs, deals, usuarios),
    [msgs, deals, usuarios],
  )
  const meu = resumos.find((r) => r.vendedorId === userId)

  const abas: { id: Aba; label: string; icon: typeof User }[] = [
    { id: 'instalar', label: 'Como instalar', icon: Download },
    { id: 'status', label: 'Status da extensão', icon: Wifi },
    { id: 'mensagens', label: 'Mensagens padrão', icon: FileText },
    { id: 'meu', label: 'Meu resumo', icon: User },
    ...(isAdmin ? [{ id: 'geral' as Aba, label: 'Resumo geral', icon: Users }] : []),
  ]

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-orange-400" />
        <h1 className="text-lg font-semibold text-white">WhatsApp Comercial</h1>
      </div>
      <p className="text-xs text-slate-400 -mt-2">
        Extensão que arquiva as conversas de WhatsApp das comissões e alunos por turma. O conteúdo
        de cada conversa fica na aba <strong>Conversas</strong> dentro da turma no Funil.
      </p>

      <div className="flex gap-1.5 border-b border-white/[0.06]">
        {abas.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px ${
              aba === a.id
                ? 'border-orange-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <a.icon className="w-3.5 h-3.5" />
            {a.label}
          </button>
        ))}
      </div>

      {aba === 'instalar' && <Instalar />}
      {aba === 'status' && <StatusExtensao />}
      {aba === 'mensagens' && <MensagensPadrao />}
      {aba === 'meu' && <ResumoPessoal nome={nome} r={meu} carregando={carregando} />}
      {aba === 'geral' && isAdmin && <ResumoGeral resumos={resumos} carregando={carregando} />}
    </div>
  )
}

function Passo({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex-none w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center">
        {n}
      </div>
      <div className="space-y-1.5 flex-1">
        <p className="font-semibold text-slate-200 text-sm">{titulo}</p>
        <div className="text-sm text-slate-400 space-y-1.5">{children}</div>
      </div>
    </div>
  )
}

function Instalar() {
  return (
    <div className="space-y-5 bg-[#111820] border border-white/[0.06] rounded-xl p-5">
      <p className="text-sm text-slate-300">
        Cada vendedor instala uma vez, no navegador que usa pra atender. Leva ~1 minuto e não
        precisa da Chrome Web Store.
      </p>

      <Passo n={1} titulo="Baixar a extensão">
        <a
          href="/extensao-whatsapp.zip"
          download
          className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-3 py-2"
        >
          <Download className="w-4 h-4" /> Baixar extensão (.zip)
        </a>
      </Passo>

      <Passo n={2} titulo="Descompactar">
        <p>
          Ache o arquivo <code className="text-orange-300">extensao-whatsapp.zip</code> na pasta de
          Downloads e descompacte (clique duas vezes no Mac; botão direito → Extrair no Windows).
          Vai virar uma pasta <code className="text-orange-300">extensao-whatsapp</code>.
        </p>
      </Passo>

      <Passo n={3} titulo="Abrir a página de extensões do Chrome">
        <p>
          Copie e cole na barra de endereço:{' '}
          <code className="text-orange-300 select-all">chrome://extensions</code>
        </p>
        <p>No canto superior direito, ligue o <strong>Modo do desenvolvedor</strong>.</p>
      </Passo>

      <Passo n={4} titulo="Carregar a extensão">
        <p>
          Clique em <strong>Carregar sem compactação</strong> e escolha a pasta{' '}
          <code className="text-orange-300">extensao-whatsapp</code> que você descompactou.
        </p>
        <p>Vai aparecer o ícone 🪶 “Amor In Gestão — Conversas do WhatsApp” na lista.</p>
      </Passo>

      <Passo n={5} titulo="Conectar o WhatsApp">
        <p>
          Depois de carregar a extensão, abra a aba <strong>Status da extensão</strong> aqui em cima
          e clique em <strong>Abrir o WhatsApp Web</strong>. Escaneie o QR code com o celular como
          sempre.
        </p>
        <p className="text-slate-500">
          Se a aba <strong>Status da extensão</strong> não mostrar nada: a extensão está
          desatualizada. Em <code className="text-orange-300">chrome://extensions</code>, clique no
          ícone de recarregar do card dela (ou remova e carregue de novo o .zip novo).
        </p>
      </Passo>

      <Passo n={6} titulo="Usar no dia a dia">
        <p>
          Com o WhatsApp Web aberto, aparece um painel <strong>🪶 Amor In</strong> encostado na
          beirada direita da tela (clique na aba vertical laranja pra abrir/fechar). Ele mostra a
          qual turma aquela conversa está vinculada, o histórico já arquivado e as{' '}
          <strong>mensagens padrão</strong> — um clique já envia na conversa aberta.
        </p>
        <p>
          Se estiver <strong>"Não vinculada"</strong>, clique em <strong>Vincular a uma turma</strong>,
          busque e escolha — pessoa vincula pelo telefone, grupo pelo nome. Enquanto não vincular,
          nada daquela conversa é salvo.
        </p>
      </Passo>

      <div className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg border bg-emerald-500/10 text-emerald-300 border-emerald-500/20">
        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          Os áudios são transcritos automaticamente. O conteúdo de cada conversa fica na aba{' '}
          <strong>Conversas</strong> dentro da turma no Funil.
        </span>
      </div>

      <div className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg border bg-white/[0.03] text-slate-400 border-white/[0.06]">
        <span>
          <strong className="text-slate-300">3 lugares da extensão:</strong> a aba{' '}
          <strong>Status da extensão</strong> aqui no CRM (pra conectar) · o painel{' '}
          <strong>🪶 Amor In</strong> (no WhatsApp Web, pra vincular turma e mandar mensagens padrão) ·
          o <strong>popup</strong> (clicando no ícone da extensão na barra do Chrome — fixe o ícone no
          quebra-cabeça 🧩).
        </span>
      </div>

      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer">Publicar na Chrome Web Store (opcional, só o admin)</summary>
        <div className="mt-2 space-y-1.5">
          <p>
            Deixa a instalação num clique pro time todo, mas exige a conta de desenvolvedor do
            Google (US$ 5, uma vez).
          </p>
          <a
            href="https://chrome.google.com/webstore/devconsole"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-orange-400 hover:underline"
          >
            Abrir o Developer Console <ExternalLink className="w-3 h-3" />
          </a>
          <p>
            Política de privacidade exigida:{' '}
            <a
              href="/privacidade-extensao.html"
              target="_blank"
              rel="noreferrer"
              className="text-orange-400 hover:underline"
            >
              /privacidade-extensao.html
            </a>
          </p>
        </div>
      </details>
    </div>
  )
}

function StatusExtensao() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">
        Status da conexão da extensão instalada neste navegador — usa a mesma sessão que você já tem
        aqui no CRM, não pede login de novo.
      </p>
      {/* A extensão (crm-panel.js) procura este container e renderiza o status aqui dentro.
          Sem ela instalada/atualizada, fica só o aviso abaixo. */}
      <div id="amorin-extensao-status" className="bg-[#111820] border border-white/[0.06] rounded-xl p-4">
        <p className="text-sm text-slate-500">
          Extensão não detectada neste navegador. Veja a aba <strong>Como instalar</strong>.
        </p>
      </div>
    </div>
  )
}

type MsgPadrao = { id: string; titulo: string; texto: string; ativo: boolean }

function MensagensPadrao() {
  const [itens, setItens] = useState<MsgPadrao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [titulo, setTitulo] = useState('')
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function carregar() {
    setCarregando(true)
    const { data } = await supabase
      .from('mensagens_padrao_whatsapp')
      .select('id, titulo, texto, ativo')
      .order('titulo', { ascending: true })
    setItens((data as MsgPadrao[]) || [])
    setCarregando(false)
  }

  useEffect(() => {
    carregar()
  }, [])

  async function adicionar() {
    if (!titulo.trim() || !texto.trim()) return
    setSalvando(true)
    const { error } = await supabase
      .from('mensagens_padrao_whatsapp')
      .insert({ titulo: titulo.trim(), texto: texto.trim() })
    setSalvando(false)
    if (!error) {
      setTitulo('')
      setTexto('')
      carregar()
    }
  }

  async function alternarAtivo(item: MsgPadrao) {
    setItens((prev) => prev.map((m) => (m.id === item.id ? { ...m, ativo: !item.ativo } : m)))
    await supabase.from('mensagens_padrao_whatsapp').update({ ativo: !item.ativo }).eq('id', item.id)
  }

  async function remover(id: string) {
    setItens((prev) => prev.filter((m) => m.id !== id))
    await supabase.from('mensagens_padrao_whatsapp').delete().eq('id', id)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Roteiros prontos que aparecem no painel <strong>🪶 Amor In</strong> dentro do WhatsApp Web —
        um clique já envia a mensagem na conversa aberta. Visível pra todo o time.
      </p>

      <div className="bg-[#111820] border border-white/[0.06] rounded-xl p-4 space-y-2">
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Título (ex: Boas-vindas)"
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500"
        />
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Texto da mensagem…"
          rows={3}
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500"
        />
        <button
          onClick={adicionar}
          disabled={salvando || !titulo.trim() || !texto.trim()}
          className="rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold px-3 py-2"
        >
          {salvando ? 'Salvando…' : 'Adicionar'}
        </button>
      </div>

      {carregando ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma mensagem padrão cadastrada ainda.</p>
      ) : (
        <div className="space-y-2">
          {itens.map((m) => (
            <div
              key={m.id}
              className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 flex items-start gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{m.titulo}</p>
                <p className="text-xs text-slate-400 whitespace-pre-wrap mt-0.5">{m.texto}</p>
              </div>
              <div className="flex flex-col gap-1 items-end shrink-0">
                <button
                  onClick={() => alternarAtivo(m)}
                  className={`text-[11px] px-2 py-1 rounded-md border whitespace-nowrap ${
                    m.ativo
                      ? 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10'
                      : 'border-white/[0.08] text-slate-500'
                  }`}
                >
                  {m.ativo ? 'Ativa' : 'Inativa'}
                </button>
                <button onClick={() => remover(m.id)} className="text-[11px] text-red-400 hover:underline">
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Metrica({ label, valor }: { label: string; valor: string | number }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3">
      <p className="text-lg font-bold text-white">{valor}</p>
      <p className="text-[11px] text-slate-400">{label}</p>
    </div>
  )
}

function ResumoPessoal({
  nome,
  r,
  carregando,
}: {
  nome: string
  r?: ResumoVendedor
  carregando: boolean
}) {
  if (carregando) return <p className="text-sm text-slate-500">Carregando…</p>
  if (!r)
    return (
      <p className="text-sm text-slate-500">
        Nenhuma conversa arquivada com o seu login ainda. Instale a extensão e conecte o WhatsApp.
      </p>
    )
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-300">Atividade de WhatsApp de <strong>{nome}</strong>:</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Metrica label="Mensagens enviadas" valor={r.enviadas} />
        <Metrica label="Áudios enviados" valor={r.audiosEnviados} />
        <Metrica label="Conversas" valor={r.conversas} />
        <Metrica label="Turmas atendidas" valor={r.turmasAtendidas} />
        <Metrica label="Turmas que fecharam" valor={r.turmasFechadas} />
        <Metrica label="Conversão" valor={`${Math.round(r.taxaConversao * 100)}%`} />
      </div>
      <p className="text-xs text-slate-500">
        Última mensagem enviada:{' '}
        {r.ultimaAtividade
          ? new Date(r.ultimaAtividade).toLocaleString('pt-BR')
          : '—'}
      </p>
    </div>
  )
}

function ResumoGeral({
  resumos,
  carregando,
}: {
  resumos: ResumoVendedor[]
  carregando: boolean
}) {
  if (carregando) return <p className="text-sm text-slate-500">Carregando…</p>
  if (resumos.length === 0)
    return <p className="text-sm text-slate-500">Nenhuma conversa arquivada ainda.</p>

  const tot = resumos.reduce(
    (a, r) => ({
      enviadas: a.enviadas + r.enviadas,
      audios: a.audios + r.audiosEnviados,
      turmas: a.turmas + r.turmasAtendidas,
      fechadas: a.fechadas + r.turmasFechadas,
    }),
    { enviadas: 0, audios: 0, turmas: 0, fechadas: 0 },
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Metrica label="Mensagens enviadas" valor={tot.enviadas} />
        <Metrica label="Áudios enviados" valor={tot.audios} />
        <Metrica label="Turmas atendidas" valor={tot.turmas} />
        <Metrica label="Turmas que fecharam" valor={tot.fechadas} />
      </div>

      <div className="overflow-x-auto bg-[#111820] border border-white/[0.06] rounded-xl">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 text-left">
              <th className="p-2.5 font-medium">Vendedor</th>
              <th className="p-2.5 font-medium text-right">Enviadas</th>
              <th className="p-2.5 font-medium text-right">Áudios</th>
              <th className="p-2.5 font-medium text-right">Conversas</th>
              <th className="p-2.5 font-medium text-right">Turmas</th>
              <th className="p-2.5 font-medium text-right">Fecharam</th>
              <th className="p-2.5 font-medium text-right">Conversão</th>
              <th className="p-2.5 font-medium text-right">Última atividade</th>
            </tr>
          </thead>
          <tbody>
            {resumos.map((r) => (
              <tr key={r.vendedorId} className="border-t border-white/[0.05] text-slate-300">
                <td className="p-2.5 font-medium text-white">{r.nome}</td>
                <td className="p-2.5 text-right">{r.enviadas}</td>
                <td className="p-2.5 text-right">{r.audiosEnviados}</td>
                <td className="p-2.5 text-right">{r.conversas}</td>
                <td className="p-2.5 text-right">{r.turmasAtendidas}</td>
                <td className="p-2.5 text-right">{r.turmasFechadas}</td>
                <td className="p-2.5 text-right font-semibold text-emerald-400">
                  {Math.round(r.taxaConversao * 100)}%
                </td>
                <td className="p-2.5 text-right text-slate-500">
                  {r.ultimaAtividade
                    ? new Date(r.ultimaAtividade).toLocaleDateString('pt-BR')
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
