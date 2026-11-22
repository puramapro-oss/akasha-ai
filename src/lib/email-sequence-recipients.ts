import { setTimeout as delay } from 'node:timers/promises'
import type { createServiceClient } from '@/lib/supabase'
import type { ScheduledType } from '@/lib/email-sequence-policy'

type ServiceClient = ReturnType<typeof createServiceClient>

export async function hasReceipt(supabase: ServiceClient, userId: string, type: ScheduledType): Promise<boolean> {
  const { data, error } = await supabase.from('email_sequences')
    .select('user_id, email_type').eq('user_id', userId).eq('email_type', type).maybeSingle()
  if (error) throw new Error('Email receipt read failed')
  if (data === null) return false
  if (!data || data.user_id !== userId || data.email_type !== type) throw new Error('Invalid email receipt')
  return true
}

export class EmailRunDeferred extends Error {}

export class EmailRunBudget {
  private readonly deadline = Date.now() + 45_000
  private attempts = 0
  private nextSendAt = 0

  check() {
    if (Date.now() >= this.deadline || this.attempts >= 75) throw new EmailRunDeferred('Email run limit reached')
  }

  async beforeSend() {
    this.check()
    const wait = Math.max(0, this.nextSendAt - Date.now())
    if (Date.now() + wait >= this.deadline) throw new EmailRunDeferred('Email run time budget reached')
    if (wait) await delay(wait)
    this.check()
    this.attempts++
    // Leave headroom for other team traffic; a provider 429 stops this run.
    this.nextSendAt = Date.now() + 550
  }
}

type CohortUser = { id: string; email: string | null; display_name: string | null; created_at: string }

function timestampMicros(value: string): bigint {
  const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d{1,6}))?(?:Z|[+-]\d{2}:\d{2})$/.exec(value)
  const milliseconds = Date.parse(value)
  if (!timestamp || !Number.isFinite(milliseconds)) throw new Error('Invalid cohort timestamp')
  return BigInt(milliseconds) * BigInt(1000) + BigInt((timestamp[1] ?? '').slice(3).padEnd(3, '0'))
}

export async function* emailCohortPages(supabase: ServiceClient, type: ScheduledType, start: Date, end: Date, budget: EmailRunBudget) {
  let cursor: CohortUser | undefined
  while (true) {
    budget.check()
    let query = supabase.from('profiles')
      .select('id, email, display_name, created_at, email_sequences()')
      .gte('created_at', start.toISOString()).lt('created_at', end.toISOString())
      .eq('email_sequences.email_type', type).is('email_sequences', null)
      .order('created_at', { ascending: true }).order('id', { ascending: true }).limit(100)
    if (cursor) {
      // Quote filter values and preserve PostgreSQL's microseconds, including ties.
      const time = JSON.stringify(cursor.created_at), id = JSON.stringify(cursor.id)
      query = query.or(`created_at.gt.${time},and(created_at.eq.${time},id.gt.${id})`)
    }
    const { data, error } = await query
    if (error || !Array.isArray(data) || data.length > 100) throw new Error('Email cohort read failed')
    if (data.length === 0) return
    let previous = cursor
    for (const row of data) {
      if (!row || typeof row.id !== 'string' || !row.id || typeof row.created_at !== 'string' ||
          (row.email !== null && typeof row.email !== 'string') ||
          (row.display_name !== null && typeof row.display_name !== 'string')) throw new Error('Invalid email cohort')
      const micros = timestampMicros(row.created_at)
      if (Date.parse(row.created_at) < start.getTime() || Date.parse(row.created_at) >= end.getTime() ||
          (previous && (micros < timestampMicros(previous.created_at) ||
          (micros === timestampMicros(previous.created_at) && row.id <= previous.id)))) throw new Error('Email cohort did not advance')
      previous = row
    }
    yield data as CohortUser[]
    cursor = previous
    // Even a short page may be capped by the API; only an empty page proves completion.
  }
}
