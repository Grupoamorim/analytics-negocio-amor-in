import { useEffect, useState } from 'react'
import { getFullTurmaName } from '@/types/crm'
import type { Lead } from '@/types/crm'
import type { PacoteTurma } from '@/utils/pacotesTurma'
import type { SGELink } from '@/utils/sgeIntegration'
import { fotosDaTurma } from '@/utils/apresentacaoPublica'
import { useConfiguracoes } from '@/hooks/useConfiguracoes'
import SlideDeck, { type DeckData } from '@/components/apresentacao/SlideDeck'

interface ApresentacaoPacotesModalProps {
  lead: Lead
  pacotes: PacoteTurma[]
  sgeLink?: SGELink | null
  onClose: () => void
}

export default function ApresentacaoPacotesModal({
  lead,
  pacotes,
  sgeLink,
  onClose,
}: ApresentacaoPacotesModalProps) {
  const { config } = useConfiguracoes()
  const [fotos, setFotos] = useState<string[]>([])
  useEffect(() => {
    fotosDaTurma(lead.id).then(setFotos).catch(() => {})
  }, [lead.id])

  const data: DeckData = {
    nomeTurma: getFullTurmaName(lead),
    subtitulo: 'Orçamento de Pacotes',
    logoUrl: config.logoUrl || null,
    fotos,
    pacotes: pacotes.map((p) => ({
      nome: p.nome,
      valor: p.valor,
      parcelas: p.parcelas,
      itens: p.itens,
    })),
    codigoTurma: sgeLink?.sgeProjectCode || null,
    confidencial: true,
  }

  return <SlideDeck data={data} onClose={onClose} showPrint />
}
