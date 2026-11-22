import { vi } from 'vitest'

export type CronUser = { id: string; email: string; display_name: string; created_at: string }
export const scheduledUser = (id = 'synthetic-user', createdAt = '2026-11-22T10:00:00.000Z'): CronUser => ({
  id, email: `${id}@example.invalid`, display_name: 'Mina', created_at: createdAt,
})

type ProfileQuery = {
  start: string; end: string; selection: string; filters: Record<string, string | null>
  orders: { field: string; ascending: boolean }[]; limit: number; cursor?: string
}
const micros = (value: string) => Date.parse(value) * 1000 + Number((value.split('.')[1]?.split(/[Z+-]/)[0] ?? '').slice(3).padEnd(3, '0'))
const after = (user: CronUser, createdAt: string, id: string) => micros(user.created_at) > micros(createdAt) || (micros(user.created_at) === micros(createdAt) && user.id > id)

export function installScheduledRecipients(serviceClient: ReturnType<typeof vi.fn>, users: CronUser[] = [scheduledUser()]) {
  const receipts = new Set<string>()
  const deliveries = new Map<string, { state: string; attempt_token: unknown; payload_hash: unknown }>()
  const profileReads: { start: string; end: string }[] = []
  const profileQueries: ProfileQuery[] = []
  const preference = vi.fn<(userId: string) => { data: unknown; error: unknown }>(userId => ({ data: { user_id: userId, types: { newsletter: true } }, error: null }))
  const receipt = vi.fn((userId: string, type: string): { data: unknown; count: number | null; error: unknown } => ({
    data: receipts.has(`${userId}/${type}`) ? { user_id: userId, email_type: type } : null,
    count: receipts.has(`${userId}/${type}`) ? 1 : 0, error: null,
  }))
  const profiles = vi.fn((start: string, end: string, query: ProfileQuery): { data: unknown; error: unknown } => {
    let rows = users.filter(user => Date.parse(user.created_at) >= Date.parse(start) && Date.parse(user.created_at) < Date.parse(end))
    if (query.filters.email_sequences === null) rows = rows.filter(user => !receipts.has(`${user.id}/${query.filters['email_sequences.email_type']}`))
    if (query.cursor) {
      const values = [...query.cursor.matchAll(/"(?:\\.|[^"\\])*"/g)].map(match => JSON.parse(match[0]) as string)
      if (values.length !== 3 || values[0] !== values[1]) throw new Error('Invalid fixture cursor')
      rows = rows.filter(user => after(user, values[0], values[2]))
    }
    if (query.orders.length) rows.sort((left, right) => micros(left.created_at) - micros(right.created_at) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    return { data: rows.slice(0, query.limit), error: null }
  })
  type Args = Record<string, unknown> & { p_user_id: string; p_email_type: string }
  const claim = vi.fn(async (args: Args): Promise<{ data: unknown; error: unknown }> => {
    const identity = { version: 1, user_id: args.p_user_id, email_type: args.p_email_type,
      attempt_token: args.p_attempt_token, payload_hash: args.p_payload_hash }
    const pref = preference(args.p_user_id)
    if (pref.error) return { data: null, error: pref.error }
    const row = pref.data as { user_id?: string; types?: Record<string, unknown>; paused_until?: string } | null
    const subscribed = row?.user_id === args.p_user_id && row.types?.newsletter === true
      && !(['welcome', 'tip_day1'].includes(args.p_email_type) && row.types.product_updates === false)
      && !(args.p_email_type === 'tips_day7' && row.types.weekly_digest === false)
    const key = `${args.p_user_id}/${args.p_email_type}`
    let status = 'claimed'
    if (!subscribed) status = 'not_subscribed'
    else if (row?.paused_until && Date.parse(row.paused_until) > Date.now()) status = 'paused'
    else if (deliveries.has(key)) status = deliveries.get(key)!.state === 'sent' ? 'already_sent' : 'reconciliation_required'
    else if (receipts.has(key)) status = 'reconciliation_required'
    else deliveries.set(key, { state: 'sending', attempt_token: args.p_attempt_token, payload_hash: args.p_payload_hash })
    return { data: { ...identity, status }, error: null }
  })
  const complete = vi.fn(async (args: Args): Promise<{ data: unknown; error: unknown }> => {
    const key = `${args.p_user_id}/${args.p_email_type}`
    const stored = deliveries.get(key)
    if (!stored || stored.attempt_token !== args.p_attempt_token || stored.payload_hash !== args.p_payload_hash) {
      return { data: null, error: { message: 'Wrong durable attempt' } }
    }
    stored.state = 'sent'; receipts.add(key)
    return { data: { version: 1, user_id: args.p_user_id, email_type: args.p_email_type,
      attempt_token: args.p_attempt_token, payload_hash: args.p_payload_hash,
      status: 'sent', provider_email_id: args.p_provider_email_id }, error: null }
  })
  const rpc = vi.fn((name: string, args: Args) => ({ abortSignal: async () => {
    if (name === 'claim_email_sequence_delivery') return claim(args)
    if (name === 'complete_email_sequence_delivery') return complete(args)
    if (name !== 'reconcile_email_sequence_delivery') throw new Error('Unexpected email RPC')
    const stored = deliveries.get(`${args.p_user_id}/${args.p_email_type}`)
    if (stored && stored.state !== 'sent') stored.state = 'reconciliation_required'
    return { data: { status: stored?.state }, error: null }
  } }))
  const from = vi.fn((table: string) => {
    const state: ProfileQuery = { start: '', end: '', selection: '', filters: {}, orders: [], limit: Infinity }
    const read = () => {
      if (table === 'profiles') {
        profileReads.push({ start: state.start, end: state.end })
        profileQueries.push(state)
        return profiles(state.start, state.end, state)
      }
      if (table === 'notification_preferences') return preference(state.filters.user_id as string)
      if (table === 'email_sequences') return receipt(state.filters.user_id as string, state.filters.email_type as string)
      throw new Error(`Unexpected table ${table}`)
    }
    const query = {
      select: vi.fn((selection: string) => { state.selection = selection; return query }),
      eq: vi.fn((key: string, value: string) => { state.filters[key] = value; return query }),
      is: vi.fn((key: string, value: null) => { state.filters[key] = value; return query }),
      gte: vi.fn((_key: string, value: string) => { state.start = value; return query }),
      lt: vi.fn((_key: string, value: string) => { state.end = value; return query }),
      order: vi.fn((field: string, options: { ascending: boolean }) => { state.orders.push({ field, ...options }); return query }),
      limit: vi.fn((limit: number) => { state.limit = limit; return query }),
      or: vi.fn((cursor: string) => { state.cursor = cursor; return query }),
      maybeSingle: vi.fn(async () => read()),
      abortSignal: vi.fn(() => query),
      then: (resolve: (value: ReturnType<typeof read>) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve().then(read).then(resolve, reject),
    }
    return query
  })
  serviceClient.mockReturnValue({ from, rpc })
  return { receipts, profileReads, profileQueries, preference, receipt, profiles, claim, complete, rpc, deliveries, from }
}
