/**
 * Cliente para integração com a API Google Gemini.
 * Armazena a chave e o modelo escolhido em localStorage.
 */

export const GEMINI_API_KEY_STORAGE = 'gemini_api_key'
export const GEMINI_MODEL_STORAGE = 'gemini_model'
export const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash'

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

export function getGeminiModel(): string {
  try {
    return localStorage.getItem(GEMINI_MODEL_STORAGE) || GEMINI_DEFAULT_MODEL
  } catch {
    return GEMINI_DEFAULT_MODEL
  }
}

export function saveGeminiModel(model: string): void {
  try {
    localStorage.setItem(GEMINI_MODEL_STORAGE, model.trim() || GEMINI_DEFAULT_MODEL)
  } catch (e) {
    console.error('Erro ao salvar modelo Gemini:', e)
  }
}

export const GEMINI_SYSTEM_PROMPT_STORAGE = 'gemini_system_prompt'

export function getCustomSystemPrompt(): string {
  try {
    return localStorage.getItem(GEMINI_SYSTEM_PROMPT_STORAGE) || ''
  } catch {
    return ''
  }
}

export function saveCustomSystemPrompt(prompt: string): void {
  try {
    localStorage.setItem(GEMINI_SYSTEM_PROMPT_STORAGE, prompt)
  } catch (e) {
    console.error('Erro ao salvar instruções personalizadas:', e)
  }
}

export interface GeminiTestResult {
  ok: boolean
  message: string
}

/**
 * Faz uma chamada mínima ao Gemini só para confirmar que a chave é válida e está funcionando.
 */
export async function testGeminiConnection(apiKey: string, model?: string): Promise<GeminiTestResult> {
  if (!apiKey.trim()) {
    return { ok: false, message: 'Informe a chave de API antes de testar.' }
  }
  try {
    await callGemini('Responda apenas "ok".', apiKey, model)
    return { ok: true, message: 'Conexão com o Gemini estabelecida com sucesso!' }
  } catch (err: any) {
    return { ok: false, message: err.message || 'Não foi possível conectar ao Gemini.' }
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

interface GeminiRequestBody {
  contents: { role?: string; parts: { text: string }[] }[]
  systemInstruction?: { parts: { text: string }[] }
  generationConfig: { temperature: number; maxOutputTokens: number }
}

/** Chamada de baixo nível ao endpoint generateContent do Gemini. */
async function postGemini(body: GeminiRequestBody, apiKey?: string, model?: string): Promise<string> {
  const key = (apiKey || getGeminiApiKey()).trim()
  if (!key) {
    throw new Error('Chave API Gemini não configurada. Configure em Configurações.')
  }
  const modelId = model || getGeminiModel()

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(
    key,
  )}`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
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
 * Chama o Gemini (modelo configurável, padrão gemini-2.5-flash) para gerar conteúdo a partir de um prompt.
 */
export async function callGemini(prompt: string, apiKey?: string, model?: string): Promise<string> {
  return postGemini(
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
    },
    apiKey,
    model,
  )
}

export interface ChatMessage {
  role: 'user' | 'model'
  content: string
}

/**
 * Chama o Gemini em modo conversa (múltiplos turnos), com uma instrução de sistema fixa
 * que ancora as respostas nos dados fornecidos e proíbe invenção de informação.
 */
export async function callGeminiChat(
  messages: ChatMessage[],
  systemInstruction: string,
  apiKey?: string,
  model?: string,
): Promise<string> {
  return postGemini(
    {
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: messages.map((m) => ({ role: m.role, parts: [{ text: m.content }] })),
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
    },
    apiKey,
    model,
  )
}

/**
 * Analisa transcrição de reunião usando o Gemini e retorna JSON estruturado.
 */
export async function analyzeTranscriptWithGemini(
  content: string,
  turmaContext?: string,
  apiKey?: string,
  model?: string,
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

  const raw = await callGemini(prompt, apiKey, model)
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
