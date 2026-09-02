// Recebe conversas do WhatsApp da extensão do Chrome e arquiva por turma.
//  - acao "resolver": telefone/grupo -> { turma_id, contato_id, origem }
//  - acao "salvar":  lote de mensagens -> upsert (dedupe por wa_msg_id),
//                    transcrevendo os áudios com o Gemini.
// A extensão manda o JWT do vendedor (login no CRM) no Authorization.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

const norm = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

const soDigitos = (s: string) => (s || '').replace(/\D/g, '')

function telefoneBate(a: string, b: string): boolean {
  const x = soDigitos(a)
  const y = soDigitos(b)
  if (!x || !y) return false
  const tailX = x.slice(-8)
  const tailY = y.slice(-8)
  return tailX.length === 8 && tailX === tailY
}

// nome completo da turma, curso+faculdade+turma+ano como tokens-chave
function tokensTurma(t: Record<string, any>): string[] {
  return [t.curso, t.faculdade, t.turma, t.ano_formatura]
    .filter((v) => v != null && String(v).trim() !== '')
    .map((v) => norm(String(v)))
    .flatMap((v) => v.split(' '))
    .filter(Boolean)
}

async function transcreverAudio(geminiKey: string, model: string, b64: string, mime: string): Promise<string> {
  const body = JSON.stringify({
    contents: [{
      parts: [
        { inline_data: { mime_type: mime || 'audio/ogg', data: b64 } },
        { text: 'Transcreva este áudio em português, apenas o texto falado, sem comentários.' },
      ],
    }],
    generationConfig: { maxOutputTokens: 4000 },
  })
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
    if (r.ok) {
      const j = await r.json()
      return (j.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '').trim()
    }
    if ([429, 500, 502, 503, 504].includes(r.status)) {
      await new Promise((res) => setTimeout(res, 4000 * (i + 1)))
      continue
    }
    break
  }
  return ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

  const authHeader = req.headers.get('Authorization') || ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'Não autenticado' }, 401)

  const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: u, error: uErr } = await caller.auth.getUser(jwt)
  if (uErr || !u?.user) return json({ error: 'Sessão inválida' }, 401)
  const vendedorId = u.user.id

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corpo inválido' }, 400)
  }

  // ────────────────────────── RESOLVER ──────────────────────────
  if (body.acao === 'resolver') {
    // --- Conversa direta (DM) ---
    if (body.telefone) {
      const { data: contatos } = await admin
        .from('contatos')
        .select('id, nome, telefone, turma_id')
      const c = (contatos || []).find((x: any) => telefoneBate(x.telefone || '', body.telefone))
      if (c && c.turma_id) {
        return json({ ok: true, origem: 'dm', turma_id: c.turma_id, contato_id: c.id, nome: c.nome })
      }
      return json({ ok: true, vincular: true, motivo: c ? 'contato sem turma' : 'telefone não cadastrado' })
    }

    // --- Grupo ---
    if (body.grupo_wa_id) {
      const { data: existente } = await admin
        .from('conversa_grupos')
        .select('*')
        .eq('grupo_wa_id', body.grupo_wa_id)
        .maybeSingle()

      if (existente?.ignorar) return json({ ok: true, ignorar: true })
      if (existente?.turma_id) {
        return json({ ok: true, origem: 'grupo', turma_id: existente.turma_id, grupo_nome: existente.grupo_nome })
      }

      // tenta casar o nome do grupo com uma turma (sem exigir o prefixo AIF/AFF...)
      const nomeGrupoNorm = norm(body.grupo_nome || '')
      let turmaId: string | null = null
      if (nomeGrupoNorm) {
        const { data: turmas } = await admin
          .from('turmas')
          .select('id, curso, faculdade, turma, ano_formatura')
        const candidatas = (turmas || []).filter((t: any) => {
          const toks = tokensTurma(t)
          return toks.length >= 2 && toks.every((tok) => nomeGrupoNorm.includes(tok))
        })
        if (candidatas.length === 1) turmaId = candidatas[0].id
      }

      await admin.from('conversa_grupos').upsert({
        grupo_wa_id: body.grupo_wa_id,
        grupo_nome: body.grupo_nome || '',
        turma_id: turmaId,
        vinculo: turmaId ? 'auto' : 'pendente',
        criado_por: vendedorId,
        updated_at: new Date().toISOString(),
      })

      if (turmaId) return json({ ok: true, origem: 'grupo', turma_id: turmaId, grupo_nome: body.grupo_nome })
      return json({ ok: true, vincular: true, motivo: 'grupo sem turma vinculada' })
    }

    return json({ error: 'informe telefone ou grupo_wa_id' }, 400)
  }

  // ────────────────────────── SALVAR ──────────────────────────
  if (body.acao === 'salvar') {
    const msgs: any[] = Array.isArray(body.mensagens) ? body.mensagens : []
    if (msgs.length === 0) return json({ ok: true, salvas: 0 })

    // chave do Gemini pra transcrever áudio
    const { data: cfg } = await admin.from('configuracoes').select('gemini_api_key, preferencias').maybeSingle()
    const geminiKey = (cfg?.gemini_api_key || '').trim()
    const geminiModel = (cfg?.preferencias?.geminiModel as string) || 'gemini-2.5-flash'

    // quais já existem?
    const ids = msgs.map((m) => m.wa_msg_id).filter(Boolean)
    const { data: jaTem } = await admin
      .from('conversas_whatsapp')
      .select('wa_msg_id')
      .in('wa_msg_id', ids)
    const existentes = new Set((jaTem || []).map((r: any) => r.wa_msg_id))

    const linhas: any[] = []
    for (const m of msgs) {
      if (!m.wa_msg_id || existentes.has(m.wa_msg_id)) continue
      let texto = m.texto || ''
      let transcrito = false
      if (m.tipo === 'audio' && m.midia_base64 && geminiKey) {
        try {
          const t = await transcreverAudio(geminiKey, geminiModel, m.midia_base64, m.midia_mime)
          if (t) {
            texto = t
            transcrito = true
          }
        } catch (_) { /* salva sem transcrição */ }
      }
      linhas.push({
        turma_id: m.turma_id || null,
        contato_id: m.contato_id || null,
        origem: m.origem || 'dm',
        chat_wa_id: m.chat_wa_id,
        grupo_nome: m.grupo_nome || null,
        wa_msg_id: m.wa_msg_id,
        de_mim: !!m.de_mim,
        direcao: m.de_mim ? 'enviada' : 'recebida',
        autor_nome: m.autor_nome || null,
        autor_telefone: m.autor_telefone ? soDigitos(m.autor_telefone) : null,
        tipo: m.tipo || 'texto',
        texto: texto || null,
        transcrito,
        midia_url: m.midia_url || null,
        enviada_em: m.enviada_em,
        vendedor_id: vendedorId,
        raw: m.raw || null,
      })
    }

    let salvas = 0
    if (linhas.length) {
      const { error } = await admin.from('conversas_whatsapp').insert(linhas)
      if (error) return json({ error: error.message }, 400)
      salvas = linhas.length
    }
    if (body.chat_wa_id) {
      await admin.from('conversa_grupos')
        .update({ ultima_sync: new Date().toISOString() })
        .eq('grupo_wa_id', body.chat_wa_id)
    }
    return json({ ok: true, salvas })
  }

  return json({ error: 'ação desconhecida' }, 400)
})
