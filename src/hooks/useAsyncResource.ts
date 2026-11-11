'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

export const ASYNC_RESOURCE_TIMEOUT_MS = 15_000
type Scope<T> = { key: string | null; loader: (signal: AbortSignal) => Promise<T> }
type Snapshot<T> = { scope: Scope<T>; data: T; loading: boolean; error: Error | null }
type Controls<T> = { scope: Scope<T>; active: boolean; cancel: () => void; run: () => Promise<void> }

/**
 * A read resource, not an authentication boundary. Stabilize loader with useCallback.
 * initialData is a fixed, neutral seed for this mounted instance (for example []),
 * never another actor's fetched data. Include actor and parameters in key/loader.
 * A fresh scope immediately masks old data; only genuine async completions publish.
 */
export function useAsyncResource<T>(
  key: string | null,
  loader: (signal: AbortSignal) => Promise<T>,
  initialData: T,
) {
  const [seed] = useState(() => initialData)
  const scope = useMemo<Scope<T>>(() => ({ key, loader }), [key, loader])
  const [snapshot, setSnapshot] = useState<Snapshot<T> | null>(null)
  const controls = useRef<Controls<T> | null>(null)
  const committedScope = useRef<Scope<T> | null>(null)

  // Revoke old callbacks during commit, before passive-effect cleanup or user events.
  useLayoutEffect(() => {
    committedScope.current = scope
    return () => {
      if (committedScope.current === scope) committedScope.current = null
      const control = controls.current
      if (control?.scope === scope) { control.active = false; control.cancel() }
    }
  }, [scope])

  useEffect(() => {
    if (scope.key === null) return
    let generation = 0
    const control: Controls<T> = { scope, active: true, cancel: () => undefined, run: () => Promise.resolve() }
    const run = () => {
      control.cancel()
      const request = ++generation
      const controller = new AbortController()
      let finished = false
      let resolve!: () => void
      const completion = new Promise<void>(accept => { resolve = accept })
      const current = () => !finished && control.active && controls.current === control && committedScope.current === scope && generation === request
      const finish = () => {
        finished = true
        clearTimeout(deadline)
        resolve()
      }
      const publishError = (error: unknown) => {
        if (!current()) return
        setSnapshot(previous => ({
          scope, data: previous?.scope === scope ? previous.data : seed, loading: false,
          error: error instanceof Error ? error : new Error('Impossible de charger les données. Réessaie.'),
        }))
        finish()
      }
      const deadline = setTimeout(() => {
        if (!current()) return
        controller.abort()
        publishError(new Error('Le chargement a dépassé le délai prévu. Réessaie.'))
      }, ASYNC_RESOURCE_TIMEOUT_MS)
      control.cancel = () => {
        if (finished) return
        controller.abort()
        finish()
      }
      let pending: Promise<T>
      try { pending = scope.loader(controller.signal) }
      catch (error) { pending = Promise.reject(error) }
      pending.then(data => {
        if (!current()) return
        setSnapshot({ scope, data, loading: false, error: null })
        finish()
      }, publishError)
      return completion
    }
    control.run = run
    controls.current = control
    void run()
    return () => {
      control.active = false
      control.cancel()
      if (controls.current === control) controls.current = null
    }
  }, [scope, seed])

  const isCurrent = useCallback(() => {
    const control = controls.current
    return committedScope.current === scope && control?.scope === scope && control.active
  }, [scope])

  const refetch = useCallback(() => {
    const control = controls.current
    if (committedScope.current !== scope || control?.scope !== scope || !control.active) return Promise.resolve()
    setSnapshot(previous => ({
      scope, data: previous?.scope === scope ? previous.data : seed, loading: true, error: null,
    }))
    return control.run()
  }, [scope, seed])

  const setData = useCallback((update: T | ((previous: T) => T)) => {
    const control = controls.current
    if (committedScope.current !== scope || control?.scope !== scope || !control.active) return
    control.cancel()
    setSnapshot(previous => {
      const before = previous?.scope === scope ? previous.data : seed
      const data = typeof update === 'function' ? (update as (value: T) => T)(before) : update
      return { scope, data, loading: false, error: null }
    })
  }, [scope, seed])

  const view = snapshot?.scope === scope && key !== null ? snapshot : null
  return {
    data: view ? view.data : seed,
    loading: key !== null && (view?.loading ?? true),
    error: view?.error ?? null,
    refetch, setData, isCurrent,
  }
}
