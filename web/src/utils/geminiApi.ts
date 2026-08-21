/**
 * Cliente para integração com a API Google Gemini (gemini-1.5-flash).
 * Armazena a chave em localStorage ('gemini_api_key').
 */

export const GEMINI_API_KEY_STORAGE = 'gemini_api_key'

export function getGeminiApiKey(): string {
  try {
    return localStorage.getItem(GEMINI_API_KEY_STORAGE) || ''
  } catch {
    return ''
  }
}

export function saveGeminiApiKey(key: string): void {
  try {
    localStorage.setItem(GEMINI_API_KEY_STORAGE, key.trim())
    window.dispatchEvent(new Event('gemini_key_changed'))
  } catch (e) {
    console.error('Erro ao salvar chave Gemini:', e)
  }
}

export interface GeminiTranscriptAnalysis {
  probabilidade: number // 0-100
  sentimento: 'positivo' | 'neutro' | 'negativo'
  pontosFortes: string[]
  pontosAtencao: string[]
  resumo: string
  recomendacao: string
}

/**
 * Chama o modelo gemini-1.5-flash para gerar conteúdo baseado em um prompt.
 */
export async function callGemini(prompt: string, apiKey?: string): Promise<string> {
  const key = (apiKey || getGeminiApiKey()).trim()
  if (!key) {
    throw new Error('Chave API Gemini não configurada. Configure em Configurações.')
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(
    key,
  )}`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 2048,
      },
    }),
  })

  if (!response.ok) {
    let errorMsg = `Erro na API Gemini (${response.status})`
    try {
      const errJson = await response.json()
      if (errJson.error?.message) {
        errorMsg = errJson.error.message
      }
    } catch {
      // ignore
    }
    throw new Error(errorMsg)
  }

  const data = await response.json()
  const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!candidate) {
    throw new Error('Nenhuma resposta retornada pelo Gemini.')
  }

  return candidate
}

/**
 * Analisa transcrição de reunião usando Gemini 1.5 Flash e retorna JSON estruturado.
 */
export async function analyzeTranscriptWithGemini(
  content: string,
  turmaContext?: string,
  apiKey?: string,
): Promise<GeminiTranscriptAnalysis> {
  const prompt = `Você é um analista especialista em vendas de formatura e SDR educacional.
Analise a transcrição de reunião abaixo ${turmaContext ? `referente à turma "${turmaContext}"` : ''}.

Transcrição:
"""
${content.substring(0, 15000)}
"""

Retorne OBRIGATORIAMENTE APENAS um JSON válido (sem tags markdown de código e sem texto antes ou depois) com o seguinte formato:
{
  "probabilidade": <número inteiro de 0 a 100 indicando a chance de avançar para a próxima fase ou fechar contrato>,
  "sentimento": <"positivo" | "neutro" | "negativo">,
  "pontosFortes": [<array de strings com pontos positivos identificados>],
  "pontosAtencao": [<array de strings com objeções, riscos ou preocupações identificadas>],
  "resumo": "<string com 2 a 3 frases resumindo a reunião>",
  "recomendacao": "<string com o próximo passo sugerido para o SDR/closer>"
}`

  const raw = await callGemini(prompt, apiKey)
  return parseGeminiJsonResponse(raw)
}

/**
 * Faz parse defensivo do JSON retornado pelo Gemini.
 */
function parseGeminiJsonResponse(raw: string): GeminiTranscriptAnalysis {
  let cleaned = raw.trim()

  // Remove blocos de código ```json ... ``` se vierem
  if (cleaned.startsWith('```')) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()
  }

  try {
    const parsed = JSON.parse(cleaned)

    let prob = Number(parsed.probabilidade)
    if (isNaN(prob)) prob = 50
    prob = Math.max(0, Math.min(100, Math.round(prob)))

    let sent = String(parsed.sentimento || '')
      .toLowerCase()
      .trim()
    if (!['positivo', 'neutro', 'negativo'].includes(sent)) {
      sent = prob >= 65 ? 'positivo' : prob <= 40 ? 'negativo' : 'neutro'
    }

    return {
      probabilidade: prob,
      sentimento: sent as 'positivo' | 'neutro' | 'negativo',
      pontosFortes: Array.isArray(parsed.pontosFortes) ? parsed.pontosFortes.map(String) : [],
      pontosAtencao: Array.isArray(parsed.pontosAtencao) ? parsed.pontosAtencao.map(String) : [],
      resumo: typeof parsed.resumo === 'string' ? parsed.resumo : 'Reunião analisada.',
      recomendacao:
        typeof parsed.recomendacao === 'string' ? parsed.recomendacao : 'Realizar follow-up.',
    }
  } catch (err) {
    console.error('Falha ao interpretar JSON do Gemini:', raw, err)
    // Fallback defensivo
    return {
      probabilidade: 50,
      sentimento: 'neutro',
      pontosFortes: ['Reunião realizada e registrada'],
      pontosAtencao: ['Verificar pontos da proposta'],
      resumo: raw.slice(0, 200),
      recomendacao: 'Fazer contato com a comissão para alinhar próximos passos.',
    }
  }
}
