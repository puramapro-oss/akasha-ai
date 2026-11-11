'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { PLAN_LIMITS, SUPER_ADMIN_EMAIL } from '@/lib/constants'
import type { Profile } from '@/types'
import type { Session } from '@supabase/supabase-js'

export const AUTH_READ_TIMEOUT_MS = 15_000
const SESSION_ERROR = 'Impossible de vérifier la connexion. Réessaie dans quelques instants.'
const PROFILE_ERROR = 'Impossible de charger ton profil. Réessaie dans quelques instants.'
interface AuthView { session: Session | null; profile: Profile | null; loading: boolean; error: string | null }
interface ReadJob { cancel: () => void; promise: Promise<void> }
interface AuthControls { refetch: () => Promise<void>; clear: () => void; report: (error: string) => void }
const initialView: AuthView = { session: null, profile: null, loading: true, error: null }

async function authAction(action: () => Promise<{ error: { message: string } | null }>) {
  try { const { error } = await action(); return { error } }
  catch { return { error: { message: 'Le service de connexion est indisponible. Réessaie dans quelques instants.' } } }
}

export function useAuth() {
  const [supabase] = useState(createClient)
  const [state, setState] = useState<AuthView>(initialView)
  const controls = useRef<AuthControls | null>(null)

  useEffect(() => {
    let disposed = false, hasEvent = false, hasNonInitialEvent = false
    let view = initialView
    let profileJob: ReadJob | null = null, sessionJob: ReadJob | null = null
    const publish = (patch: Partial<AuthView>) => {
      if (disposed) return
      view = { ...view, ...patch }; setState(view)
    }
    const cancelProfile = () => { const job = profileJob; profileJob = null; job?.cancel() }
    const cancelSession = () => { const job = sessionJob; sessionJob = null; job?.cancel() }

    function readProfile(userId: string): Promise<void> {
      cancelProfile()
      if (disposed) return Promise.resolve()
      publish({ profile: null, loading: true, error: null })
      const abort = new AbortController()
      let resolve!: () => void
      const promise = new Promise<void>(yes => { resolve = yes })
      const job: ReadJob = { promise, cancel: () => { clearTimeout(scheduled); clearTimeout(deadline); abort.abort(); resolve() } }
      profileJob = job
      const current = () => !disposed && profileJob === job && view.session?.user.id === userId
      const finish = (profile: Profile | null, error: string | null) => {
        if (!current()) return
        profileJob = null; job.cancel(); publish({ profile, error, loading: false })
      }
      const deadline = setTimeout(() => finish(null, PROFILE_ERROR), AUTH_READ_TIMEOUT_MS)
      // Auth notifications must finish before another Supabase call is started.
      const scheduled = setTimeout(() => {
        if (!current()) return
        void Promise.resolve().then(() => supabase.from('profiles').select('*').eq('id', userId)
          .abortSignal(abort.signal).single()).then(({ data, error }) => {
          if (!current()) return
          if (error || !data || data.id !== userId || !Object.hasOwn(PLAN_LIMITS, data.plan)
              || !['user', 'admin', 'super_admin'].includes(data.role)) { finish(null, PROFILE_ERROR); return }
          finish(data as Profile, null)
        }, () => finish(null, PROFILE_ERROR))
      }, 0)
      return promise
    }

    function acceptSession(session: Session | null, forceProfile = false) {
      if (disposed) return
      cancelSession()
      if (!session?.user?.id) {
        cancelProfile(); publish({ session: null, profile: null, loading: false, error: null }); return
      }
      const sameIdentity = view.session?.user.id === session.user.id
      if (!sameIdentity || forceProfile) {
        cancelProfile(); publish({ session, profile: null, error: null, loading: true })
        void readProfile(session.user.id)
      } else {
        publish({ session })
        if (!view.profile && !profileJob) void readProfile(session.user.id)
      }
    }

    function readSession(): Promise<void> {
      cancelSession()
      if (disposed) return Promise.resolve()
      publish({ loading: true, error: null })
      let resolve!: () => void
      const promise = new Promise<void>(yes => { resolve = yes })
      const job: ReadJob = { promise, cancel: () => { clearTimeout(deadline); resolve() } }
      sessionJob = job
      const current = () => !disposed && sessionJob === job
      const fail = () => {
        if (!current()) return
        sessionJob = null; job.cancel(); cancelProfile()
        publish({ session: null, profile: null, loading: false, error: SESSION_ERROR })
      }
      const deadline = setTimeout(fail, AUTH_READ_TIMEOUT_MS)
      void Promise.resolve().then(() => supabase.auth.getSession()).then(({ data, error }) => {
        if (!current()) return
        if (error) { fail(); return }
        acceptSession(data.session)
      }, fail)
      return promise
    }

    const api: AuthControls = {
      refetch: () => view.session?.user.id ? readProfile(view.session.user.id) : readSession(),
      clear: () => { hasEvent = true; hasNonInitialEvent = true; acceptSession(null) },
      report: error => publish({ error }),
    }
    controls.current = api
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (disposed || (event === 'INITIAL_SESSION' && hasNonInitialEvent)) return
      hasEvent = true
      if (event !== 'INITIAL_SESSION') hasNonInitialEvent = true
      acceptSession(session, event === 'USER_UPDATED')
    })
    if (!hasEvent) void readSession()
    return () => {
      disposed = true; subscription.unsubscribe(); cancelSession(); cancelProfile()
      if (controls.current === api) controls.current = null
    }
  }, [supabase])

  const signIn = useCallback((email: string, password: string) => authAction(() =>
    supabase.auth.signInWithPassword({ email, password })), [supabase])
  const signUp = useCallback((email: string, password: string, displayName: string) => authAction(() =>
    supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } })), [supabase])
  const signInWithGoogle = useCallback(() => authAction(() => supabase.auth.signInWithOAuth({
    provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` },
  })), [supabase])
  const signOut = useCallback(async () => {
    const result = await authAction(() => supabase.auth.signOut())
    if (result.error) { controls.current?.report('La déconnexion a échoué. Réessaie dans quelques instants.'); return result }
    controls.current?.clear()
    // Supabase owns its credentials. Other apps' storage and preferences are not ours to erase.
    window.location.href = '/login'
    return result
  }, [supabase])
  const resetPassword = useCallback((email: string) => authAction(() => supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/callback?next=/dashboard/settings`,
  })), [supabase])
  const updatePassword = useCallback((password: string) => authAction(() => supabase.auth.updateUser({ password })), [supabase])
  const refetch = useCallback(() => controls.current?.refetch() ?? Promise.resolve(), [])

  const user = state.session?.user ?? null
  const profile = state.profile?.id === user?.id ? state.profile : null
  return {
    ...state, user, profile,
    signIn, signUp, signInWithGoogle, signOut, resetPassword, updatePassword, refetch,
    isAuthenticated: !!user,
    isSuperAdmin: user?.email === SUPER_ADMIN_EMAIL,
    isAdmin: profile?.role === 'admin' || profile?.role === 'super_admin',
    plan: profile?.plan ?? 'free',
  }
}
