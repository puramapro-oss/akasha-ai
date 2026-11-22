import { createClient } from '@supabase/supabase-js'

export const USER = '11111111-1111-4111-8111-111111111111'
export const NOW = new Date('2026-11-22T12:00:00.000Z')
export type Values = Record<string, unknown>
type Delivery = Values & { state: string }
export function emailFixture() {
  const state = {
    preferences: { types: { newsletter: true }, paused_until: null } as Values | null,
    profiles: [{ id: USER, email: 'recipient@example.invalid', display_name: 'Mina', created_at: '2026-11-22T02:00:00.000Z' }],
    deliveries: new Map<string, Delivery>(), legacy: false, logs: 0,
    failProfiles: false, failAdmission: false, failCompletion: false, loseCompletion: false,
    invalidAdmission: false, invalidCompletion: false, failReconciliation: false,
    overrideCompletion: false, completionReceipt: null as unknown,
    queries: [] as URL[], rpc: [] as { name: string; input: Values }[],
  }
  const response = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(body === null ? null : JSON.stringify(body), {
      status, headers: { 'content-type': 'application/json', ...headers },
    })
  const error = () => response({ message: 'synthetic database failure', code: 'XX000' }, 500)
  const fetchFixture = async (input: RequestInfo | URL, options?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    if (url.hostname !== 'supabase.synthetic.invalid') throw new Error('External request refused')
    state.queries.push(url)
    if (url.pathname === '/rest/v1/profiles') {
      if (state.failProfiles) return error()
      const ranges = url.searchParams.getAll('created_at')
      const start = ranges.find(value => value.startsWith('gte.'))?.slice(4)
      const end = ranges.find(value => value.startsWith('lt.'))?.slice(3)
      const cursor = url.searchParams.get('or')
      const values = cursor ? [...cursor.matchAll(/"(?:\\.|[^"\\])*"/g)].map(match => JSON.parse(match[0]) as string) : null
      const micros = (value: string) => BigInt(Date.parse(value)) * BigInt(1000)
        + BigInt((/\.(\d+)/.exec(value)?.[1] ?? '').slice(3).padEnd(3, '0'))
      const type = url.searchParams.get('email_sequences.email_type')?.replace(/^eq\./, '')
      const profiles = state.profiles.filter(p => (!start || Date.parse(p.created_at) >= Date.parse(start))
        && (!end || Date.parse(p.created_at) < Date.parse(end))
        && (!values || micros(p.created_at) > micros(values[0]) || (micros(p.created_at) === micros(values[0]) && p.id > values[2]))
        && (!type || (!state.legacy && state.deliveries.get(`${p.id}/${type}`)?.state !== 'sent')))
        .sort((a, b) => micros(a.created_at) < micros(b.created_at) ? -1 : micros(a.created_at) > micros(b.created_at) ? 1 : a.id.localeCompare(b.id))
      return response(profiles.slice(0, Number(url.searchParams.get('limit') ?? 1000)))
    }
    if (url.pathname === '/rest/v1/email_sequences') {
      if (options?.method === 'HEAD') {
        if (state.failAdmission) return error()
        return response(null, 200, { 'content-range': `0-0/${state.legacy ? 1 : 0}` })
      }
      if (options?.method === 'POST') {
        if (state.failCompletion) return error()
        state.logs++
        return response(null, 201)
      }
    }
    const name = url.pathname.split('/rpc/')[1]
    if (!name) throw new Error(`Unexpected database operation: ${url.pathname}`)
    const args: Values = JSON.parse(String(options?.body))
    state.rpc.push({ name, input: args })
    const key = `${args.p_user_id}/${args.p_email_type}`
    const identity = { version: 1, user_id: args.p_user_id, email_type: args.p_email_type,
      attempt_token: args.p_attempt_token, payload_hash: args.p_payload_hash }
    if (name === 'claim_email_sequence_delivery') {
      if (state.failAdmission) return error()
      if (state.invalidAdmission) return response({ status: 'claimed', ...identity, user_id: 'wrong-user' })
      const pref = state.preferences
      if (!pref || !pref.types || typeof pref.types !== 'object' || Array.isArray(pref.types)
        || (pref.types as Values).newsletter !== true) return response({ ...identity, status: 'not_subscribed' })
      const choices = pref.types as Values
      if ((['welcome', 'tip_day1'].includes(String(args.p_email_type)) && choices.product_updates === false)
        || (args.p_email_type === 'tips_day7' && choices.weekly_digest === false)) {
        return response({ ...identity, status: 'not_subscribed' })
      }
      if (pref.paused_until && Date.parse(String(pref.paused_until)) > NOW.getTime()) {
        return response({ ...identity, status: 'paused' })
      }
      const prior = state.deliveries.get(key)
      if (prior) return response({ ...identity, status: prior.state === 'sent' ? 'already_sent' : 'reconciliation_required' })
      if (state.legacy) return response({ ...identity, status: 'reconciliation_required' })
      state.deliveries.set(key, { ...identity, state: 'sending' })
      return response({ ...identity, status: 'claimed' })
    }
    if (name === 'complete_email_sequence_delivery') {
      if (state.failCompletion) return error()
      const prior = state.deliveries.get(key)
      if (!prior || prior.attempt_token !== args.p_attempt_token) return error()
      state.deliveries.set(key, { ...prior, state: 'sent', provider_email_id: args.p_provider_email_id })
      state.logs++
      if (state.loseCompletion) throw new Error('synthetic response lost after database commit')
      if (state.overrideCompletion) return response(state.completionReceipt)
      return response({ ...identity, status: 'sent', provider_email_id: state.invalidCompletion ? 'wrong-id' : args.p_provider_email_id })
    }
    if (name === 'reconcile_email_sequence_delivery') {
      if (state.failReconciliation) return error()
      const prior = state.deliveries.get(key)
      if (!prior || prior.attempt_token !== args.p_attempt_token) return error()
      if (prior.state !== 'sent') state.deliveries.set(key, { ...prior, state: 'reconciliation_required' })
      return response({ ...identity, status: state.deliveries.get(key)?.state })
    }
    throw new Error(`Unexpected RPC ${name}`)
  }
  const client = createClient('https://supabase.synthetic.invalid', 'synthetic-service-key', {
    db: { schema: 'akasha_ai' }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: fetchFixture },
  })
  return { state, client }
}
