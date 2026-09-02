import { useEffect, useMemo, useState } from 'react'
import { MessageSquare, Download, ExternalLink, CheckCircle2, Users, User } from 'lucide-react'
import { useCRM } from '@/context/CRMContext'
import { useAcesso } from '@/context/AcessoContext'
import { fetchTodasConversas, type ConversaMsg } from '@/utils/conversas'
import { resumoPorVendedor, type ResumoVendedor } from '@/utils/conversasResumo'

type Aba = 'instalar' | 'meu' | 'geral'

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
          Abra o CRM (esta mesma página serve) e clique na aba lateral laranja{' '}
          <strong>WHATSAPP</strong> que aparece na direita da tela.
        </p>
        <p>
          Clique em <strong>Abrir o WhatsApp Web</strong>, escaneie o QR code com o celular como
          sempre. Pronto — a partir daí, toda conversa de uma turma cadastrada é arquivada sozinha.
        </p>
      </Passo>

      <div className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg border bg-emerald-500/10 text-emerald-300 border-emerald-500/20">
        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          Os áudios são transcritos automaticamente. Grupos que não baterem sozinhos com uma turma
          ficam pendentes — dá pra vinculá-los na aba <strong>Conversas</strong> de cada turma.
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
