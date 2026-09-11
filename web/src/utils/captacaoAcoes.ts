// Cadastro das "Ações de Captação": formulários públicos específicos por
// curso/evento (ex: ação de Direito num plantão/feira), mais rápidos que o
// link de captação normal, que terminam redirecionando pro grupo do
// WhatsApp da ação. Pra criar uma nova ação (outro curso, outro evento),
// só adicionar um item novo aqui — vira uma URL nova em /captacao/acao/<slug>.
export interface CampanhaCaptacao {
  slug: string
  curso: string
  whatsappLink: string
}

export const CAMPANHAS_CAPTACAO: CampanhaCaptacao[] = [
  {
    slug: 'direito',
    curso: 'Direito',
    whatsappLink: 'https://chat.whatsapp.com/LMPGHi5ayciL9wVMBw5Jwb?s=cl&p=i&mlu=4&ilr=4',
  },
]

export function getCampanhaCaptacao(slug: string | undefined): CampanhaCaptacao | undefined {
  if (!slug) return undefined
  return CAMPANHAS_CAPTACAO.find((c) => c.slug === slug)
}
