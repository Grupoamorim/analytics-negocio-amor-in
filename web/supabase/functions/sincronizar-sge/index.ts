import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  user_id?: string
  start_date?: string
  end_date?: string
}

function normalizeName(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractTurmaNameFromVenda(venda: any): string {
  return (
    venda?.nomeTurma ||
    venda?.turma ||
    venda?.nomeProjeto ||
    venda?.projetoNome ||
    venda?.descricao ||
    venda?.nome ||
    ''
  )
}

function extractCodeFromVenda(venda: any): string {
  const code =
    venda?.codigoProjeto ||
    venda?.codigo ||
    venda?.idProjeto ||
    venda?.codProjeto ||
    venda?.id ||
    ''
  return String(code).trim()
}

serve(async (req) => {
  // Trata CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Supabase credentials not configured on backend.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Obter payload
    let body: RequestBody = {}
    try {
      body = await req.json()
    } catch {
      body = {}
    }

    // Se user_id não foi passado no body, tenta pegar pelo JWT no header Authorization
    let targetUserId = body.user_id
    if (!targetUserId) {
      const authHeader = req.headers.get('Authorization')
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '')
        const {
          data: { user },
        } = await supabase.auth.getUser(token)
        if (user) {
          targetUserId = user.id
        }
      }
    }

    if (!targetUserId) {
      return new Response(JSON.stringify({ error: 'user_id é obrigatório.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Busca configurações do usuário
    const { data: config, error: configError } = await supabase
      .from('configuracoes')
      .select('sge_cnpj, sge_token')
      .eq('user_id', targetUserId)
      .maybeSingle()

    if (configError) {
      return new Response(
        JSON.stringify({ error: `Erro ao buscar configurações: ${configError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!config?.sge_cnpj || !config?.sge_token) {
      return new Response(
        JSON.stringify({
          error: 'Credenciais do SGE (CNPJ e Token) não configuradas para este usuário.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 2. Chamar a API do SGE
    const now = new Date()
    const past90 = new Date()
    past90.setDate(past90.getDate() - 90)

    const startDate = body.start_date || past90.toISOString().split('T')[0]
    const endDate = body.end_date || now.toISOString().split('T')[0]

    const sgeAuth = btoa(`${config.sge_cnpj.trim()}:${config.sge_token.trim()}`)
    const sgeApiUrl = `https://e-api.sge.com.br/api/emp/venda/listar-vendas-por-periodo?dataInicio=${encodeURIComponent(startDate)}&dataFim=${encodeURIComponent(endDate)}`

    let vendas: any[] = []
    try {
      const sgeResponse = await fetch(sgeApiUrl, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${sgeAuth}`,
          Accept: 'application/json',
        },
      })

      if (!sgeResponse.ok) {
        const errorText = await sgeResponse.text()
        return new Response(
          JSON.stringify({
            error: `Erro na API do SGE (${sgeResponse.status}): ${errorText || sgeResponse.statusText}`,
          }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const resData = await sgeResponse.json()
      vendas = Array.isArray(resData)
        ? resData
        : Array.isArray(resData?.dados)
          ? resData.dados
          : Array.isArray(resData?.vendas)
            ? resData.vendas
            : []
    } catch (apiErr: any) {
      return new Response(
        JSON.stringify({
          error: `Falha na requisição ao SGE: ${apiErr.message}`,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 3. Buscar todas as turmas do usuário no Supabase
    const { data: turmas, error: turmasError } = await supabase
      .from('turmas')
      .select(
        'id, empresa, curso, faculdade, turma, ano_formatura, cidade, funil_status, codigo_sge, fechamento_contrato',
      )
      .eq('user_id', targetUserId)

    if (turmasError) {
      return new Response(
        JSON.stringify({ error: `Erro ao buscar turmas: ${turmasError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 4. Buscar deals correspondentes
    const turmaIds = (turmas || []).map((t) => t.id)
    const { data: deals } = await supabase
      .from('deals')
      .select('id, turma_id, stage, outcome, probability')
      .in('turma_id', turmaIds)

    const dealsByTurmaId = new Map<string, any>()
    ;(deals || []).forEach((d) => dealsByTurmaId.set(d.turma_id, d))

    // 5. Cruzar vendas com turmas
    let vinculadas = 0
    let autoWon = 0
    let alreadyLinked = 0
    const matchedTurmaIds = new Set<string>()

    for (const venda of vendas) {
      const rawTurmaName = extractTurmaNameFromVenda(venda)
      const sgeCode = extractCodeFromVenda(venda)
      if (!rawTurmaName || !sgeCode) continue

      const normVendaName = normalizeName(rawTurmaName)

      let matchedTurma: any = null
      for (const t of turmas || []) {
        const full1 = normalizeName(
          `${t.empresa || ''} ${t.curso} ${t.faculdade} ${t.turma} ${t.ano_formatura || ''} ${t.cidade || ''}`,
        )
        const full2 = normalizeName(
          `${t.curso} ${t.faculdade} ${t.turma} ${t.ano_formatura || ''} ${t.cidade || ''}`,
        )
        const full3 = normalizeName(`${t.curso} ${t.faculdade} ${t.turma}`)
        const full4 = normalizeName(`${t.curso} - ${t.faculdade}`)

        if (
          full1 === normVendaName ||
          full2 === normVendaName ||
          full3 === normVendaName ||
          full4 === normVendaName
        ) {
          matchedTurma = t
          break
        }

        if (
          normVendaName.length > 5 &&
          (full1.includes(normVendaName) ||
            normVendaName.includes(full1) ||
            full2.includes(normVendaName) ||
            normVendaName.includes(full2) ||
            full3.includes(normVendaName) ||
            normVendaName.includes(full3))
        ) {
          matchedTurma = t
          break
        }
      }

      if (matchedTurma) {
        matchedTurmaIds.add(matchedTurma.id)
        const isNewLink = !matchedTurma.codigo_sge || matchedTurma.codigo_sge !== sgeCode

        if (isNewLink) {
          vinculadas++
          await supabase.from('turmas').update({ codigo_sge: sgeCode }).eq('id', matchedTurma.id)
        } else {
          alreadyLinked++
        }

        // Auto-win se não estiver em "Fechou ou Perdeu" (ou funil_status !== 'Convertido'/'Ganhou')
        const deal = dealsByTurmaId.get(matchedTurma.id)
        const isClosed =
          matchedTurma.funil_status === 'Fechou ou Perdeu' ||
          matchedTurma.funil_status === 'Convertido' ||
          deal?.stage === 'fechou-ou-perdeu' ||
          deal?.stage === 'stage-6'

        if (!isClosed) {
          autoWon++
          // Atualiza turma
          await supabase
            .from('turmas')
            .update({
              funil_status: 'Fechou ou Perdeu',
              fechamento_contrato: matchedTurma.fechamento_contrato || new Date().toISOString(),
            })
            .eq('id', matchedTurma.id)

          // Atualiza ou cria deal
          if (deal) {
            await supabase
              .from('deals')
              .update({
                stage: 'fechou-ou-perdeu',
                outcome: 'ganhou',
                probability: 100,
              })
              .eq('id', deal.id)

            // Registra transição
            await supabase.from('stage_transitions').insert({
              deal_id: deal.id,
              from_stage: deal.stage,
              to_stage: 'fechou-ou-perdeu',
            })
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          total_vendas_sge: vendas.length,
          turmas_vinculadas: vinculadas,
          ja_vinculadas: alreadyLinked,
          auto_win: autoWon,
          periodo: { inicio: startDate, fim: endDate },
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Erro inesperado no servidor.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
