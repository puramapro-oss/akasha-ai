import type { createClient } from '@/lib/supabase'
import type { z } from 'zod'
import { ContactRequestSchema, MissionSchema } from '@/lib/entraide-contracts'

type BrowserClient = ReturnType<typeof createClient>
type SessionIdentity = { access_token: string; user: { id: string } }
type Route = 'profile' | 'matches' | 'missions' | 'contacts'
const REQUEST_DEADLINE_MS = 15_000
const MISSION_COLUMNS =
  'id,title,description,status,min_participants,max_participants,organizer_id,created_at,missions_collectives_participants(user_id)'
const CONTACT_COLUMNS = 'id,requester_id,recipient_id,status,message,created_at'

export class EntraideSessionChanged extends Error {
  constructor() {
    super('Session modifiée')
    this.name = 'AbortError'
  }
}
export class EntraideTimeoutError extends Error {
  constructor() {
    super('Délai dépassé. Actualisez les données pour vérifier l’état de l’opération avant de réessayer.')
    this.name = 'EntraideTimeoutError'
  }
}
export function isEntraideCancellation(error: unknown) {
  return error instanceof Error && error.name === 'AbortError'
}
function httpError(status: number) {
  if (status === 401) return new Error('Session expirée. Reconnectez-vous.')
  if (status === 403) return new Error('Vous ne pouvez pas effectuer cette action.')
  if (status === 404) return new Error('Élément Entraide introuvable.')
  if (status === 400) return new Error('Action refusée. Vérifiez les données et les conditions de la demande.')
  return new Error('Service Entraide indisponible. Réessayez.')
}
function checked<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new Error('Réponse Entraide invalide.')
  return parsed.data
}

// One immutable authentication epoch, invalidated even for A -> B -> A or a token refresh.
// This uses the existing browser auth client, never a second auth/session store.
export function createEntraideSession(
  client: BrowserClient, session: SessionIdentity, onInvalidated?: (restored: boolean) => void
) {
  const actor = session.user.id
  const token = session.access_token
  const controllers = new Set<AbortController>()
  let disposed = false
  let invalidated = false
  let restorationNotified = false
  const subscription: { current?: { unsubscribe(): void } } = {}

  function abortRequests() {
    for (const controller of controllers) controller.abort()
    controllers.clear()
  }
  function dispose() {
    disposed = true
    abortRequests()
    subscription.current?.unsubscribe()
  }
  function invalidate() {
    if (disposed || invalidated) return
    invalidated = true
    abortRequests()
    onInvalidated?.(false)
  }
  subscription.current = client.auth.onAuthStateChange((_event, current) => {
    if (disposed) return
    const sameIdentity = current?.user.id === actor && current.access_token === token
    if (!sameIdentity) invalidate()
    else if (invalidated && !restorationNotified) {
      // Keep observing until cleanup: a batched A -> B -> A needs a NEW epoch.
      // A stale A view observing only B never starts an automatic reload loop.
      restorationNotified = true
      onInvalidated?.(true)
    }
  }).data.subscription
  if (disposed) subscription.current.unsubscribe()

  function start() {
    const controller = new AbortController()
    let timedOut = false
    let closed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const interrupted = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => {
        if (timer !== undefined) clearTimeout(timer)
        reject(timedOut ? new EntraideTimeoutError() : new EntraideSessionChanged())
      }, { once: true })
    })
    // start() can be disposed before its first await; callers still observe the original rejection.
    void interrupted.catch(() => undefined)
    if (disposed || invalidated) controller.abort()
    else {
      controllers.add(controller)
      timer = setTimeout(() => { timedOut = true; controller.abort() }, REQUEST_DEADLINE_MS)
    }
    // A timeout can publish an error within its epoch; a manual/session cancellation cannot.
    function active() { return !disposed && !invalidated && !closed && (!controller.signal.aborted || timedOut) }
    async function bounded<T>(work: PromiseLike<T>): Promise<T> {
      try { return await Promise.race([Promise.resolve(work), interrupted]) }
      catch (error) {
        if (disposed || invalidated || closed) throw new EntraideSessionChanged()
        if (timedOut) throw new EntraideTimeoutError()
        throw error
      }
    }
    async function assertCurrent() {
      if (!active()) throw new EntraideSessionChanged()
      if (timedOut) throw new EntraideTimeoutError()
      // Supabase getSession has no AbortSignal. Bound waiting and discard its late continuation.
      const result = await bounded(client.auth.getSession())
      if (!active()) throw new EntraideSessionChanged()
      if (timedOut) throw new EntraideTimeoutError()
      if (result.error) throw new Error('Session indisponible. Réessayez.')
      const current = result.data.session
      if (!current || current.user.id !== actor || current.access_token !== token) {
        invalidate()
        throw new EntraideSessionChanged()
      }
    }
    async function request<T>(route: Route, schema: z.ZodType<T>, body?: unknown): Promise<T> {
      await assertCurrent()
      const response = await bounded(fetch('/api/entraide/' + route, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        cache: 'no-store', credentials: 'omit', signal: controller.signal,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }))
      await assertCurrent()
      if (!response.ok) throw httpError(response.status)
      let value: unknown
      try { value = await bounded(response.json()) }
      catch (error) {
        if (isEntraideCancellation(error) || error instanceof EntraideTimeoutError) throw error
        throw new Error('Réponse Entraide invalide.')
      }
      await assertCurrent()
      return checked(schema, value)
    }
    async function missions() {
      await assertCurrent()
      const result = await bounded(client.from('missions_collectives').select(MISSION_COLUMNS)
        .order('created_at', { ascending: false })
        .setHeader('Authorization', 'Bearer ' + token).abortSignal(controller.signal))
      await assertCurrent()
      if (result.error) throw new Error('Résolutions collectives indisponibles.')
      return checked(MissionSchema.array(), result.data)
    }
    async function contacts() {
      await assertCurrent()
      const result = await bounded(client.from('entraide_contact_requests').select(CONTACT_COLUMNS)
        .or(`requester_id.eq.${actor},recipient_id.eq.${actor}`)
        .order('created_at', { ascending: false })
        .setHeader('Authorization', 'Bearer ' + token).abortSignal(controller.signal))
      await assertCurrent()
      if (result.error) throw new Error('Demandes de contact indisponibles.')
      const rows = checked(ContactRequestSchema.array(), result.data)
      if (rows.some(row => row.requester_id !== actor && row.recipient_id !== actor)) {
        throw new Error('Réponse Entraide invalide.')
      }
      return {
        received: rows.filter(row => row.recipient_id === actor),
        sent: rows.filter(row => row.requester_id === actor),
      }
    }
    function finish() {
      closed = true
      if (timer !== undefined) clearTimeout(timer)
      controllers.delete(controller)
    }
    return {
      request, missions, contacts, assertCurrent, active,
      cancel() { closed = true; controller.abort(); finish() },
      finish,
    }
  }
  return { start, dispose }
}

export type EntraideSession = ReturnType<typeof createEntraideSession>
export type EntraideOperation = ReturnType<EntraideSession['start']>
