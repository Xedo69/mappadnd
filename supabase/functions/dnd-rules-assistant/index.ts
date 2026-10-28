import { createClient } from 'npm:@supabase/supabase-js@2'

const allowedOrigins = new Set(['https://xedo69.github.io'])
const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
}

function jsonResponse(body: Record<string, unknown>, status: number, origin = '') {
  const headers = new Headers({ ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' })
  if (allowedOrigins.has(origin)) headers.set('Access-Control-Allow-Origin', origin)
  return new Response(JSON.stringify(body), { status, headers })
}

function extractAnswer(payload: Record<string, any>): string {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : []
  const parts = candidates.flatMap((candidate: any) => Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [])
  return parts
    .filter((part: any) => typeof part?.text === 'string')
    .map((part: any) => part.text)
    .join('\n')
    .trim()
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('origin') ?? ''
  if (request.method === 'OPTIONS') return new Response('ok', { headers: {
    ...corsHeaders,
    ...(allowedOrigins.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
  } })
  if (origin && !allowedOrigins.has(origin)) return jsonResponse({ error: 'origin_not_allowed' }, 403, origin)
  if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, origin)

  const authorization = request.headers.get('authorization') ?? ''
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!bearer) return jsonResponse({ error: 'unauthorized' }, 401, origin)

  try {
    const rawBody = await request.text()
    if (new TextEncoder().encode(rawBody).byteLength > 16_000) return jsonResponse({ error: 'request_too_large' }, 413, origin)
    const body = JSON.parse(rawBody)
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
    const question = typeof body.question === 'string' ? body.question.trim() : ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
      return jsonResponse({ error: 'invalid_session' }, 400, origin)
    }
    if (!question || question.length > 500) return jsonResponse({ error: 'invalid_question' }, 400, origin)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const publishableKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}')
    const supabaseKey = publishableKeys.default || Deno.env.get('SUPABASE_ANON_KEY')
    if (!supabaseUrl || !supabaseKey) throw new Error('Supabase auth environment is unavailable')

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    })
    const { data: { user }, error: authError } = await supabase.auth.getUser(bearer)
    if (authError || !user) return jsonResponse({ error: 'unauthorized' }, 401, origin)

    const [sessionResult, membershipResult] = await Promise.all([
      supabase
        .from('game_sessions')
        .select('owner_id')
        .eq('id', sessionId)
        .maybeSingle(),
      supabase
        .from('game_session_members')
        .select('role')
        .eq('session_id', sessionId)
        .eq('user_id', user.id)
        .maybeSingle(),
    ])
    if (sessionResult.error || membershipResult.error) {
      console.error('Assistant session access check failed:', sessionResult.error?.code || membershipResult.error?.code)
      return jsonResponse({ error: 'session_check_failed' }, 500, origin)
    }
    const isMaster = sessionResult.data?.owner_id === user.id
    const isPlayer = membershipResult.data?.role === 'player'
    if (!isMaster && !isPlayer) return jsonResponse({ error: 'session_access_required' }, 403, origin)

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiApiKey) return jsonResponse({ error: 'assistant_not_configured' }, 503, origin)

    const history = Array.isArray(body.history) ? body.history.slice(-8) : []
    const safeHistory = history.flatMap((item: any) => {
      if (!['user', 'assistant'].includes(item?.role) || typeof item?.content !== 'string') return []
      const content = item.content.trim().slice(0, 1200)
      return content ? [{ role: item.role, content }] : []
    })
    const contents = [...safeHistory, { role: 'user', content: question }].map((item) => ({
      role: item.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: item.content }],
    }))
    const instructions = [
      'Sei un assistente di regole per giocatori e Master di Dungeons & Dragons. Rispondi in italiano in modo chiaro, pratico e conciso.',
      'Spiega le regole con parole tue, senza riportare lunghi brani di manuali. Non inventare regole o citazioni.',
      'Le regole variano tra edizioni e tavoli: quando serve, specifica l’assunzione usata o chiedi quale edizione stanno giocando.',
      'Distingui le regole ufficiali dalle interpretazioni e dalle regole della casa. Ricorda con garbo che la decisione finale spetta al Master.',
      'Non hai accesso alla mappa, alla sessione, ai personaggi o alle informazioni segrete della campagna. Non affermare di averle viste.',
    ].join(' ')

    const model = Deno.env.get('GEMINI_MODEL') || 'gemini-3.8-flash'
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': geminiApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: instructions }] },
        contents,
        generationConfig: { maxOutputTokens: 500, temperature: 0.4 },
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!response.ok) {
      console.error('Gemini API returned status:', response.status)
      return jsonResponse({ error: 'assistant_unavailable' }, 502, origin)
    }
    const answer = extractAnswer(await response.json())
    if (!answer) return jsonResponse({ error: 'empty_answer' }, 502, origin)
    return jsonResponse({ answer }, 200, origin)
  } catch (error) {
    console.error('D&D rules assistant request failed:', error instanceof Error ? error.name : 'unknown')
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    return jsonResponse({ error: timedOut ? 'assistant_timeout' : 'assistant_unavailable' }, timedOut ? 504 : 500, origin)
  }
})
