'use client'

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'

export const MARKETPLACE_ACTION_TIMEOUT_MS = 15_000
type Scope = { key: string | null }
type Attempt = { scope: Scope; cancel: () => void }
type Result<T> = { kind: 'success'; value: T } | { kind: 'error' | 'cancelled' }

/** Keep a mutation's feedback within the account and view which started it. */
export function useMarketplaceAction(key: string | null) {
  const scope = useMemo<Scope>(() => ({ key }), [key])
  const committed = useRef<Scope | null>(null)
  const active = useRef<Attempt | null>(null)
  const [pending, setPending] = useState<{ scope: Scope; id: string } | null>(null)

  useLayoutEffect(() => {
    committed.current = scope
    return () => {
      if (committed.current === scope) committed.current = null
      if (active.current?.scope === scope) {
        active.current.cancel()
        active.current = null
      }
    }
  }, [scope])

  const run = useCallback(<T,>(
    id: string,
    action: (signal: AbortSignal) => Promise<T>,
    onSuccess: (value: T) => void,
    onError: () => void,
  ): Promise<void> => {
    if (!scope.key || committed.current !== scope || active.current) return Promise.resolve()
    const controller = new AbortController()
    let cancel!: (result: Result<T>) => void
    const stopped = new Promise<Result<T>>(resolve => { cancel = resolve })
    const attempt: Attempt = {
      scope,
      cancel: () => { controller.abort(); cancel({ kind: 'cancelled' }) },
    }
    active.current = attempt
    setPending({ scope, id })
    const current = () => committed.current === scope && active.current === attempt
    const deadline = setTimeout(() => {
      controller.abort()
      cancel({ kind: 'error' })
    }, MARKETPLACE_ACTION_TIMEOUT_MS)
    const work = Promise.resolve().then(() => {
      if (!current() || controller.signal.aborted) return { kind: 'cancelled' } as Result<T>
      return action(controller.signal).then(
        value => ({ kind: 'success', value }) as Result<T>,
        () => ({ kind: 'error' }) as Result<T>,
      )
    }).catch(() => ({ kind: 'error' }) as Result<T>)

    return Promise.race([work, stopped]).then(result => {
      if (!current() || result.kind === 'cancelled') return
      if (result.kind === 'success') onSuccess(result.value)
      else onError()
    }).catch(() => {
      if (current()) onError()
    }).finally(() => {
      clearTimeout(deadline)
      controller.abort()
      if (active.current === attempt) active.current = null
      if (committed.current === scope) setPending(null)
    })
  }, [scope])

  return { pendingId: pending?.scope === scope ? pending.id : null, run }
}
