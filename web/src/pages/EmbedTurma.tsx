import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { useCRM } from '@/context/CRMContext'
import { useDealActions } from '@/hooks/useDealActions'
import { DealDetailModal } from '@/pages/Pipeline'

/**
 * Página "sem casca" (sem Layout/topbar/sidebar) pra abrir o painel completo
 * de uma turma dentro de um <iframe> — usada pela extensão do WhatsApp pra
 * deixar mexer na turma (notas, checklist, pacotes, contatos) sem sair do
 * WhatsApp Web. A sessão chega por postMessage do pai (a extensão), nunca
 * pela URL, pra não deixar token no histórico do navegador.
 */
export default function EmbedTurma() {
  const { turmaId } = useParams<{ turmaId: string }>()
  const [sessaoRecebida, setSessaoRecebida] = useState(false)
  const [erroSessao, setErroSessao] = useState<string | null>(null)
  const { isAuthenticated, loading } = useAuth()

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const data = ev.data
      if (!data || data.__amorin_embed !== 'sessao') return
      // só aceita a sessão vinda da extensão rodando dentro do WhatsApp Web —
      // evita que qualquer outra página que consiga postar mensagem pro
      // iframe finja ser a extensão.
      if (ev.origin !== 'https://web.whatsapp.com') return
      supabase.auth
        .setSession({ access_token: data.access_token, refresh_token: data.refresh_token })
        .then(({ error }) => {
          if (error) setErroSessao(error.message)
          else setSessaoRecebida(true)
        })
    }
    window.addEventListener('message', onMessage)
    // avisa o pai que já pode mandar a sessão (o iframe pode terminar de
    // carregar antes do listener acima existir, senão)
    window.parent.postMessage({ __amorin_embed: 'pronto' }, '*')
    return () => window.removeEventListener('message', onMessage)
  }, [])

  if (erroSessao) {
    return <TelaEmbed>Não consegui entrar: {erroSessao}</TelaEmbed>
  }
  if (!sessaoRecebida || loading) {
    return <TelaEmbed>Conectando com o CRM…</TelaEmbed>
  }
  if (!isAuthenticated) {
    return <TelaEmbed>Sessão inválida — feche e abra o painel de novo.</TelaEmbed>
  }
  return <ConteudoTurma turmaId={turmaId} />
}

function ConteudoTurma({ turmaId }: { turmaId?: string }) {
  const { deals, leads, members, stages, contacts, updateDeal, updateLead, addContact, deleteContact, marcarNaoResponde, marcarRespondeu } =
    useCRM()
  const { getProposalLink, persistProposalLink, handleToggleChecklistItem, handleDuplicateDeal, handleDeleteDealAndLead } =
    useDealActions()

  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads])
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const deal = useMemo(() => deals.find((d) => d.leadId === turmaId), [deals, turmaId])
  const lead = deal?.leadId ? leadById.get(deal.leadId) : undefined

  const fecharPeloPai = () => window.parent.postMessage({ __amorin_embed: 'fechar' }, '*')

  if (!deal) return <TelaEmbed>Turma não encontrada (ou ainda carregando).</TelaEmbed>

  return (
    <DealDetailModal
      deal={deal}
      lead={lead}
      owner={deal.ownerId ? memberById.get(deal.ownerId) : undefined}
      members={members}
      stages={stages}
      proposalLink={getProposalLink(deal)}
      onProposalLinkChange={(link) => persistProposalLink(deal.id, link)}
      onToggleChecklist={(key, checked) => handleToggleChecklistItem(deal.id, key, checked)}
      onUpdateDeal={(updates) => updateDeal(deal.id, updates)}
      onUpdateLead={(updates) => lead && updateLead(lead.id, updates)}
      onDuplicate={() => handleDuplicateDeal(deal, lead, fecharPeloPai)}
      onDelete={() => handleDeleteDealAndLead(deal, lead, fecharPeloPai)}
      onClose={fecharPeloPai}
      contatos={deal.leadId ? contacts.filter((c) => c.leadId === deal.leadId) : []}
      onAddContato={(nome, telefone) => deal.leadId && addContact({ leadId: deal.leadId, nome, telefone, email: '' })}
      onDeleteContato={(id) => deleteContact(id)}
      onMarcarNaoResponde={(id) => marcarNaoResponde(id)}
      onMarcarRespondeu={(id) => marcarRespondeu(id)}
    />
  )
}

function TelaEmbed({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0f14] flex items-center justify-center text-slate-400 text-sm p-4 text-center">
      {children}
    </div>
  )
}
