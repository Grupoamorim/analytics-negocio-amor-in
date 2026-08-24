// Pacotes de fotografia vendidos por turma (Luxo, Moderno, Clássico...) e
// geração automática da mensagem de WhatsApp de boas-vindas + informativo
// dos pacotes, usando os dados reais da turma (sem inventar nada).
import { supabase } from '@/lib/supabase/client'
import { callGemini, getGeminiApiKey } from '@/utils/geminiApi'
import type { Lead } from '@/types/crm'
import type { SGELink } from '@/utils/sgeIntegration'

export interface PacoteTurma {
  id: string
  turmaId: string
  nome: string
  valor: number
  parcelas: number
  itens: string[]
  ordem: number
}

function mapRow(row: {
  id: string
  turma_id: string
  nome: string
  valor: number
  parcelas: number
  itens: string[] | null
  ordem: number
}): PacoteTurma {
  return {
    id: row.id,
    turmaId: row.turma_id,
    nome: row.nome,
    valor: Number(row.valor) || 0,
    parcelas: row.parcelas || 1,
    itens: row.itens || [],
    ordem: row.ordem || 0,
  }
}

export async function listarPacotes(turmaId: string): Promise<PacoteTurma[]> {
  const { data, error } = await supabase
    .from('pacotes_turma')
    .select('*')
    .eq('turma_id', turmaId)
    .order('ordem')
  if (error || !data) return []
  return data.map(mapRow)
}

export async function adicionarPacote(
  turmaId: string,
  pacote: { nome: string; valor: number; parcelas: number; itens: string[]; ordem: number },
): Promise<PacoteTurma> {
  const { data, error } = await supabase
    .from('pacotes_turma')
    .insert({
      turma_id: turmaId,
      nome: pacote.nome,
      valor: pacote.valor,
      parcelas: pacote.parcelas,
      itens: pacote.itens,
      ordem: pacote.ordem,
    })
    .select()
    .single()
  if (error || !data) throw error || new Error('Erro ao criar pacote')
  return mapRow(data)
}

export async function atualizarPacote(
  id: string,
  patch: Partial<{ nome: string; valor: number; parcelas: number; itens: string[]; ordem: number }>,
): Promise<void> {
  const { error } = await supabase
    .from('pacotes_turma')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function removerPacote(id: string): Promise<void> {
  const { error } = await supabase.from('pacotes_turma').delete().eq('id', id)
  if (error) throw error
}

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const SAUDACAO_PADRAO = 'Estamos muito felizes em ter vocês conosco! ❤️'

/**
 * Gera a mensagem de boas-vindas + informativo dos pacotes.
 *
 * Importante: valores, parcelas, itens de cada pacote e o link/código do
 * contrato são SEMPRE montados aqui por código, nunca pela IA — em um teste
 * real, pedir pro Gemini reescrever a mensagem inteira fez ele *inventar*
 * um link/código falsos e *remover* itens reais de um pacote, o que viola a
 * regra do projeto de nunca inventar dado. A IA entra só pra escrever a
 * frase de saudação inicial (texto livre, sem número/valor nenhum), o resto
 * é sempre o dado real, exatamente como cadastrado.
 */
export async function gerarMensagemPacotes(
  lead: Lead,
  pacotes: PacoteTurma[],
  sgeLink?: SGELink | null,
): Promise<string> {
  const linkContrato = sgeLink ? `http://app.iformando.com.br/index.aspx?cod=${sgeLink.sgeProjectCode}` : ''
  const pacotesOrdenados = [...pacotes].sort((a, b) => a.valor - b.valor).reverse()

  const pacotesTexto = pacotesOrdenados
    .map((p) => {
      const parcela = p.parcelas > 0 ? p.valor / p.parcelas : p.valor
      const itens = p.itens.length > 0 ? p.itens.map((i) => `${i}`).join('\n') : ''
      return `👉  ${p.nome.toUpperCase()} - R$${brl(p.valor)} —> ${p.parcelas} PARCELAS - R$${brl(parcela)}\n\n${itens}`
    })
    .join('\n\n')

  const saudacao = await gerarSaudacao(lead)

  return `🎉 Bem-vindos à Família Amor IN! 🎉

${saudacao} O link abaixo dá acesso à nossa plataforma, onde vocês poderão escolher os pacotes de fotos e assinar o contrato de forma rápida e segura.
${linkContrato ? `\nLink para assinatura de contrato:\n${linkContrato}\n\nCódigo da turma: ${sgeLink?.sgeProjectCode}\n` : ''}
Como funciona?
1️⃣ Ao clicar no link, faça seu cadastro e escolha o pacote que mais te agrada.
2️⃣ No final da escolha, você encontrará o seu contrato. Leia atentamente e, se concordar, pode assiná-lo diretamente na plataforma.
3️⃣ Nossa plataforma também oferece um aplicativo – iFormando – super intuitivo, que vai facilitar seu acompanhamento financeiro, verificação de contratos e muitas outras funções.

INFORMATIVO DOS PACOTES 📸

${pacotesTexto}`
}

/** Só a frase de saudação — nunca contém valor, parcela ou link. */
async function gerarSaudacao(lead: Lead): Promise<string> {
  const apiKey = getGeminiApiKey()
  if (!apiKey) return SAUDACAO_PADRAO

  const prompt = `Escreva UMA frase curta (máximo 25 palavras), calorosa e vendável, de boas-vindas para a turma de formatura "${lead.curso} ${lead.faculdade} ${lead.turma} ${lead.anoFormatura} ${lead.cidade}" que acabou de fechar contrato com a Amor In Formaturas. Pode usar 1 emoji. NÃO mencione valores, preços, parcelas, links ou datas — fale só do sentimento de fazer parte da família Amor In e da jornada da formatura. Responda só com a frase, sem aspas.`

  try {
    const result = await callGemini(prompt, apiKey)
    const texto = result.trim().replace(/^["']|["']$/g, '')
    return texto || SAUDACAO_PADRAO
  } catch {
    return SAUDACAO_PADRAO
  }
}
