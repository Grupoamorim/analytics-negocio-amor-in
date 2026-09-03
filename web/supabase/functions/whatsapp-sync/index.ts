// Recebe conversas do WhatsApp da extensão do Chrome e arquiva por turma.
//  - acao "resolver": telefone/grupo -> { turma_id, contato_id, origem }
//  - acao "turmas":   lista de turmas pro seletor do widget do WhatsApp Web
//  - acao "vincular": liga uma conversa (DM por telefone / grupo por nome) a uma turma
//  - acao "salvar":   lote de mensagens -> upsert (dedupe por wa_msg_id),
//                     transcrevendo os áudios com o Gemini.
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
const tail8 = (s: string) => soDigitos(s).slice(-8)

function telefoneBate(a: string, b: string): boolean {
  const x = tail8(a)
  const y = tail8(b)
  return x.length === 8 && x === y
}

function tokensTurma(t: Record<string, any>): string[] {
  return [t.curso, t.faculdade, t.turma, t.ano_formatura]
    .filter((v) => v != null && String(v).trim() !== '')
    .map((v) => norm(String(v)))
    .flatMap((v) => v.split(' '))
    .filter(Boolean)
}

function nomeTurma(t: Record<string, any>): string {
  return ['empresa', 'curso', 'faculdade', 'turma', 'ano_formatura', 'cidade']
    .map((k) => t[k])
    .filter((v) => v != null && String(v).trim() !== '')
    .join(' ')
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

  // ─── LISTA DE TURMAS (pro seletor do widget) ───
  if (body.acao === 'turmas') {
    const { data: turmas } = await admin
      .from('turmas')
      .select('id, empresa, curso, faculdade, turma, ano_formatura, cidade, concluida, funil_status')
      .order('ano_formatura', { ascending: false })
    const lista = (turmas || [])
      .filter((t: any) => t.concluida !== true)
      .map((t: any) => ({ id: t.id, nome: nomeTurma(t), funil_status: t.funil_status }))
    return json({ ok: true, turmas: lista })
  }

  // ─── INFO DA CONVERSA (contagem do que já foi arquivado) ───
  if (body.acao === 'chat_info') {
    if (!body.chat_wa_id) return json({ error: 'chat_wa_id' }, 400)
    const { count } = await admin
      .from('conversas_whatsapp')
      .select('id', { count: 'exact', head: true })
      .eq('chat_wa_id', body.chat_wa_id)
    const { data: ult } = await admin
      .from('conversas_whatsapp')
      .select('enviada_em')
      .eq('chat_wa_id', body.chat_wa_id)
      .order('enviada_em', { ascending: false })
      .limit(1)
    return json({ ok: true, arquivadas: count || 0, ultima: ult?.[0]?.enviada_em || null })
  }

  // ─── MENSAGENS ARQUIVADAS DA CONVERSA (pra ver no painel, com áudio já em texto) ───
  if (body.acao === 'chat_mensagens') {
    if (!body.chat_wa_id) return json({ error: 'chat_wa_id' }, 400)
    const limite = Math.min(Number(body.limite) || 40, 120)
    const { data } = await admin
      .from('conversas_whatsapp')
      .select('de_mim, autor_nome, tipo, texto, transcrito, enviada_em')
      .eq('chat_wa_id', body.chat_wa_id)
      .order('enviada_em', { ascending: false })
      .limit(limite)
    return json({ ok: true, mensagens: (data || []).reverse() })
  }

  // ─── CRIAR CONTATO na turma (a partir da DM aberta) ───
  if (body.acao === 'criar_contato') {
    const nome = (body.nome || '').trim()
    const turmaId = body.turma_id
    const tel = soDigitos(body.telefone || '')
    if (!nome || !turmaId) return json({ error: 'nome e turma_id são obrigatórios' }, 400)

    // não duplica: se já existe contato com esse telefone, só garante a turma
    const { data: contatos } = await admin.from('contatos').select('id, telefone, turma_id')
    const existente = tel
      ? (contatos || []).find((c: any) => telefoneBate(c.telefone || '', tel))
      : null
    let contatoId = existente?.id || null
    if (contatoId) {
      await admin.from('contatos').update({ turma_id: turmaId, nome }).eq('id', contatoId)
    } else {
      const { data: novo, error } = await admin
        .from('contatos')
        .insert({ nome, telefone: tel || null, turma_id: turmaId, updated_by: vendedorId })
        .select('id')
        .single()
      if (error) return json({ error: error.message }, 400)
      contatoId = novo.id
    }

    // vincula a conversa (DM) e traz o histórico já arquivado pra turma
    if (tel) {
      await admin.from('conversa_dm').upsert({
        telefone: tel,
        chat_wa_id: body.chat_wa_id || null,
        nome,
        turma_id: turmaId,
        contato_id: contatoId,
        vinculo: 'manual',
        updated_at: new Date().toISOString(),
      })
    }
    if (body.chat_wa_id) {
      await admin
        .from('conversas_whatsapp')
        .update({ turma_id: turmaId, contato_id: contatoId })
        .eq('chat_wa_id', body.chat_wa_id)
        .is('turma_id', null)
    }
    return json({ ok: true, contato_id: contatoId, turma_id: turmaId })
  }

  // ─── RESOLVER ───
  if (body.acao === 'resolver') {
    // --- Conversa direta (DM) ---
    if (body.telefone) {
      const { data: contatos } = await admin.from('contatos').select('id, nome, telefone, turma_id')
      const c = (contatos || []).find((x: any) => telefoneBate(x.telefone || '', body.telefone))
      if (c && c.turma_id) {
        return json({ ok: true, origem: 'dm', turma_id: c.turma_id, contato_id: c.id, nome: c.nome, vinculo: 'contato' })
      }
      // vínculo manual salvo em conversa_dm (pelo telefone)
      const t8 = tail8(body.telefone)
      const { data: dms } = await admin.from('conversa_dm').select('*')
      const dm = (dms || []).find((x: any) => tail8(x.telefone || '') === t8)
      if (dm?.ignorar) return json({ ok: true, ignorar: true })
      if (dm?.turma_id) {
        return json({ ok: true, origem: 'dm', turma_id: dm.turma_id, contato_id: dm.contato_id || null, vinculo: 'manual' })
      }
      return json({ ok: true, vincular: true, origem: 'dm', motivo: c ? 'contato sem turma' : 'telefone não cadastrado' })
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
        return json({ ok: true, origem: 'grupo', turma_id: existente.turma_id, grupo_nome: existente.grupo_nome, vinculo: existente.vinculo || 'manual' })
      }

      const nomeGrupoNorm = norm(body.grupo_nome || '')
      let turmaId: string | null = null
      let temSemelhanca = false
      if (nomeGrupoNorm) {
        const { data: turmas } = await admin
          .from('turmas')
          .select('id, curso, faculdade, turma, ano_formatura')
        const candidatas = (turmas || []).filter((t: any) => {
          const toks = tokensTurma(t)
          return toks.length >= 2 && toks.every((tok) => nomeGrupoNorm.includes(tok))
        })
        if (candidatas.length === 1) turmaId = candidatas[0].id
        const palavras = ['turma', 'comissao', 'formatura', 'formandos', 'formando']
        temSemelhanca =
          palavras.some((p) => nomeGrupoNorm.includes(p)) ||
          (turmas || []).some((t: any) => {
            const alvos = [norm(String(t.curso || '')), norm(String(t.faculdade || ''))].filter((s) => s.length >= 4)
            return alvos.some((s) => nomeGrupoNorm.includes(s))
          })
      }

      // Só registra pendência de grupo que pareça ser de turma. Grupo pessoal não vira linha.
      if (turmaId || temSemelhanca) {
        await admin.from('conversa_grupos').upsert({
          grupo_wa_id: body.grupo_wa_id,
          grupo_nome: body.grupo_nome || '',
          turma_id: turmaId,
          vinculo: turmaId ? 'auto' : 'pendente',
          criado_por: vendedorId,
          updated_at: new Date().toISOString(),
        })
      }

      if (turmaId) return json({ ok: true, origem: 'grupo', turma_id: turmaId, grupo_nome: body.grupo_nome, vinculo: 'auto' })
      return json({ ok: true, vincular: true, origem: 'grupo', motivo: 'grupo sem turma vinculada' })
    }

    return json({ error: 'informe telefone ou grupo_wa_id' }, 400)
  }

  // ─── VINCULAR (manual, pelo widget) ───
  if (body.acao === 'vincular') {
    const turmaId = body.turma_id || null
    const ignorar = !!body.ignorar
    const agora = new Date().toISOString()

    if (body.tipo === 'grupo' && body.grupo_wa_id) {
      await admin.from('conversa_grupos').upsert({
        grupo_wa_id: body.grupo_wa_id,
        grupo_nome: body.grupo_nome || '',
        turma_id: turmaId,
        vinculo: turmaId ? 'manual' : 'pendente',
        ignorar,
        criado_por: vendedorId,
        updated_at: agora,
      })
      if (turmaId && body.grupo_wa_id) {
        await admin.from('conversas_whatsapp').update({ turma_id: turmaId }).eq('chat_wa_id', body.grupo_wa_id).is('turma_id', null)
      }
      return json({ ok: true, turma_id: turmaId })
    }

    if (body.tipo === 'dm' && body.telefone) {
      const tel = soDigitos(body.telefone)
      await admin.from('conversa_dm').upsert({
        telefone: tel,
        chat_wa_id: body.chat_wa_id || null,
        nome: body.nome || null,
        turma_id: turmaId,
        vinculo: turmaId ? 'manual' : 'auto',
        ignorar,
        updated_at: agora,
      })
      if (turmaId && body.chat_wa_id) {
        await admin.from('conversas_whatsapp').update({ turma_id: turmaId }).eq('chat_wa_id', body.chat_wa_id).is('turma_id', null)
      }
      return json({ ok: true, turma_id: turmaId })
    }

    return json({ error: 'informe tipo (dm|grupo) + telefone/grupo_wa_id' }, 400)
  }

  // ─── SALVAR ───
  if (body.acao === 'salvar') {
    const msgs: any[] = Array.isArray(body.mensagens) ? body.mensagens : []
    if (msgs.length === 0) return json({ ok: true, salvas: 0 })

    const { data: cfg } = await admin.from('configuracoes').select('gemini_api_key, preferencias').maybeSingle()
    const geminiKey = (cfg?.gemini_api_key || '').trim()
    const geminiModel = (cfg?.preferencias?.geminiModel as string) || 'gemini-2.5-flash'

    const ids = msgs.map((m) => m.wa_msg_id).filter(Boolean)
    const { data: jaTem } = await admin.from('conversas_whatsapp').select('wa_msg_id').in('wa_msg_id', ids)
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
      await admin.from('conversa_grupos').update({ ultima_sync: new Date().toISOString() }).eq('grupo_wa_id', body.chat_wa_id)
      await admin.from('conversa_dm').update({ ultima_sync: new Date().toISOString() }).eq('chat_wa_id', body.chat_wa_id)
    }
    return json({ ok: true, salvas })
  }

  return json({ error: 'ação desconhecida' }, 400)
})
