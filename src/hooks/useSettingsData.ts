import { useState, useCallback, useEffect, useRef, type SetStateAction } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from './useTheme'
import { ASYNC_RESOURCE_TIMEOUT_MS, useAsyncResource } from './useAsyncResource'
import type { Payment } from '@/lib/settings-constants'

type ProfileForm = { display_name: string; pseudo: string; bio: string }
type Draft = { owner: () => boolean; profile: Partial<ProfileForm>; notifications: Record<string, boolean>; accent?: string }
const DEFAULT_NOTIFICATIONS: Record<string, boolean> = {
  product_updates: true, agent_notifications: true, quota_alerts: true, newsletter: false,
  marketplace_notifications: true, weekly_digest: true,
}
const PROFILE_FIELDS = ['display_name', 'pseudo', 'bio'] as const
function preferenceTypes(row: unknown, userId: string): Record<string, unknown> {
  if (row === null) return {}
  if (!row || typeof row !== 'object' || !('user_id' in row) || row.user_id !== userId || !('types' in row)) {
    throw new Error('Réponse de préférences invalide.')
  }
  if (row.types === null) return {}
  if (typeof row.types !== 'object' || Array.isArray(row.types)) throw new Error('Réponse de préférences invalide.')
  return row.types as Record<string, unknown>
}
function equalJson(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && equalJson(left[key], right[key]))
}

export function useSettingsData(billingEnabled = false) {
  const { user, profile, refetch, error: authError } = useAuth()
  const userId = user?.id
  const [supabase] = useState(createClient)
  const { theme: storedTheme, setTheme } = useTheme()
  const loadPreferences = useCallback(async (signal: AbortSignal) => {
    const { data, error } = await supabase.from('notification_preferences').select('user_id, types')
      .eq('user_id', userId!).abortSignal(signal).maybeSingle()
    if (error) throw new Error('Impossible de charger les préférences de notification.')
    return preferenceTypes(data, userId!)
  }, [supabase, userId])
  const preferences = useAsyncResource<Record<string, unknown>>(userId ?? null, loadPreferences, {})
  const { isCurrent } = preferences
  const [draft, setDraft] = useState<Draft | null>(null)
  const [observedProfile, setObservedProfile] = useState(profile)
  const [pending, setPending] = useState<{ owner: () => boolean; count: number } | null>(null)
  const jobs = useRef(new Map<() => boolean, Set<() => void>>())
  useEffect(() => {
    const registry = jobs.current
    return () => {
      const group = registry.get(isCurrent)
      if (group) for (const cancel of group) cancel()
      registry.delete(isCurrent)
    }
  }, [isCurrent])
  const owned = draft?.owner === isCurrent ? draft : null
  const serverForm: ProfileForm = {
    display_name: profile?.display_name ?? '', pseudo: profile?.pseudo ?? '', bio: profile?.bio ?? '',
  }
  // A changed canonical source can acknowledge matching edits. A failed read (null) cannot.
  if (observedProfile !== profile) {
    setObservedProfile(profile)
    if (profile && draft?.owner === isCurrent) {
      const patch = { ...draft.profile }
      let acknowledged = false
      for (const key of PROFILE_FIELDS) {
        if (patch[key] !== undefined && patch[key] === (profile[key] ?? '')) {
          delete patch[key]
          acknowledged = true
        }
      }
      if (acknowledged) setDraft({ ...draft, profile: patch })
    }
  }
  const profileForm = { ...serverForm, ...owned?.profile }
  const notifSettings = { ...DEFAULT_NOTIFICATIONS }
  for (const key of Object.keys(notifSettings)) {
    if (typeof preferences.data[key] === 'boolean') notifSettings[key] = preferences.data[key] as boolean
  }
  Object.assign(notifSettings, owned?.notifications)
  const accentColor = owned?.accent ?? profile?.accent_color ?? '#00d4ff'
  const saving = pending?.owner === isCurrent && pending.count > 0

  const setProfileForm = (update: SetStateAction<ProfileForm>) => {
    if (!isCurrent()) return
    setDraft(previous => {
      const current = previous?.owner === isCurrent ? previous : { owner: isCurrent, profile: {}, notifications: {} }
      const before = { ...serverForm, ...current.profile }
      const next = typeof update === 'function' ? update(before) : update
      const patch = { ...current.profile }
      for (const key of PROFILE_FIELDS) if (next[key] !== before[key]) patch[key] = next[key]
      return { ...current, profile: patch }
    })
  }
  const setNotifSettings = (update: SetStateAction<Record<string, boolean>>) => {
    if (!isCurrent()) return
    setDraft(previous => {
      const current = previous?.owner === isCurrent ? previous : { owner: isCurrent, profile: {}, notifications: {} }
      const before = { ...notifSettings, ...current.notifications }
      const next = typeof update === 'function' ? update(before) : update
      const patch = { ...current.notifications }
      for (const key of Object.keys(next)) if (next[key] !== before[key]) patch[key] = next[key]
      return { ...current, notifications: patch }
    })
  }
  const run = async <T,>(operation: (signal: AbortSignal) => Promise<T>, failure: string): Promise<T | undefined> => {
    if (!userId || !isCurrent()) return undefined
    const controller = new AbortController()
    let reject!: (reason: Error) => void
    const interruption = new Promise<never>((_resolve, fail) => { reject = fail })
    const cancel = () => { controller.abort(); reject(new Error('Cancelled')) }
    const group = jobs.current.get(isCurrent) ?? new Set<() => void>()
    jobs.current.set(isCurrent, group)
    group.add(cancel)
    const timer = setTimeout(() => {
      controller.abort()
      reject(new Error('Confirmation indisponible. Actualise pour vérifier l’état avant de réessayer.'))
    }, ASYNC_RESOURCE_TIMEOUT_MS)
    setPending(previous => ({ owner: isCurrent, count: previous?.owner === isCurrent ? previous.count + 1 : 1 }))
    try {
      const result = await Promise.race([operation(controller.signal), interruption])
      return isCurrent() ? result : undefined
    } catch (error) {
      if (isCurrent()) toast.error(error instanceof Error && error.message.startsWith('Confirmation indisponible') ? error.message : failure)
      return undefined
    } finally {
      clearTimeout(timer)
      group.delete(cancel)
      if (isCurrent()) setPending(previous => previous?.owner === isCurrent
        ? { ...previous, count: Math.max(0, previous.count - 1) } : previous)
    }
  }

  const handleSaveProfile = async () => {
    const submitted = { ...profileForm }
    const result = await run(async signal => {
      const { error } = await supabase.from('profiles').update({
        display_name: submitted.display_name || null, pseudo: submitted.pseudo || null, bio: submitted.bio || null,
        updated_at: new Date().toISOString(),
      }).eq('id', userId!).abortSignal(signal)
      if (error) throw new Error('profile save failed')
      return true
    }, 'Erreur lors de la sauvegarde')
    if (!result || !isCurrent()) return
    // Keep the complete submitted form until a canonical read confirms it, including untouched fields.
    setDraft(previous => {
      const current = previous?.owner === isCurrent ? previous : { owner: isCurrent, profile: {}, notifications: {} }
      return { ...current, profile: { ...submitted, ...current.profile } }
    })
    toast.success('Profil mis a jour !')
    try { await refetch() }
    catch { if (isCurrent()) toast.error('Profil sauvegardé, mais sa relecture a échoué. Actualise pour vérifier.') }
  }

  const handleSaveNotifs = async () => {
    const submitted = { ...notifSettings }
    const result = await run(async signal => {
      // Read again before merging to retain categories this UI does not own.
      const current = await supabase.from('notification_preferences').select('user_id, types')
        .eq('user_id', userId!).abortSignal(signal).maybeSingle()
      if (current.error) throw new Error('preference read failed')
      if (!isCurrent() || signal.aborted) return null
      const types = { ...preferenceTypes(current.data, userId!), ...submitted }
      const saved = await supabase.from('notification_preferences').upsert({ user_id: userId!, types }, { onConflict: 'user_id' })
        .select('user_id, types').abortSignal(signal).single()
      if (saved.error || !saved.data) throw new Error('preference save failed')
      const confirmed = preferenceTypes(saved.data, userId!)
      if (!equalJson(types, confirmed)) throw new Error('preference confirmation mismatch')
      return confirmed
    }, 'Impossible de sauvegarder les préférences.')
    if (!result || !isCurrent()) return
    preferences.setData(result)
    setDraft(previous => {
      if (previous?.owner !== isCurrent) return previous
      const patch = { ...previous.notifications }
      for (const key of Object.keys(submitted)) if (patch[key] === submitted[key]) delete patch[key]
      return { ...previous, notifications: patch }
    })
    toast.success('Preferences sauvegardees !')
  }

  const handleSaveAccent = async (color: string) => {
    if (!isCurrent()) return
    const before = accentColor
    setDraft(previous => ({
      ...(previous?.owner === isCurrent ? previous : { owner: isCurrent, profile: {}, notifications: {} }), accent: color,
    }))
    const result = await run(async signal => {
      const { error } = await supabase.from('profiles').update({ accent_color: color, updated_at: new Date().toISOString() })
        .eq('id', userId!).abortSignal(signal)
      if (error) throw new Error('accent save failed')
      return true
    }, 'Impossible de sauvegarder la couleur.')
    if (!isCurrent()) return
    if (result) toast.success('Couleur sauvegardee !')
    else setDraft(previous => previous?.owner === isCurrent && previous.accent === color ? { ...previous, accent: before } : previous)
  }
  const applyTheme = (next: 'dark' | 'light') => {
    setTheme(next)
    toast.success(next === 'dark' ? 'Mode sombre active' : 'Mode clair active')
  }
  const handleDeleteHistory = async () => {
    const result = await run(async signal => {
      const { error } = await supabase.from('conversations').delete().eq('user_id', userId!).abortSignal(signal)
      if (error) throw new Error('history delete failed')
      return true
    }, 'Erreur lors de la suppression')
    if (!result || !isCurrent()) return false
    toast.success('Historique supprime !')
    return true
  }

  const loadPayments = useCallback(async (signal: AbortSignal): Promise<Payment[]> => {
    const { data, error } = await supabase.from('payments').select('id, amount, status, created_at, invoice_number')
      .eq('user_id', userId!).order('created_at', { ascending: false }).limit(10).abortSignal(signal)
    if (error) throw new Error('Impossible de charger les paiements.')
    return (data ?? []) as Payment[]
  }, [supabase, userId])
  const paymentResource = useAsyncResource(billingEnabled && userId ? userId : null, loadPayments, [] as Payment[])
  const refetchPreferences = preferences.refetch
  const fetchPayments = paymentResource.refetch
  const retrySettings = useCallback(async () => {
    // The existing auth instance must recover its own error, including when no session is known yet.
    await Promise.allSettled([refetch(), refetchPreferences(), fetchPayments()])
  }, [refetch, refetchPreferences, fetchPayments])
  const handleManageBilling = async () => {
    const result = await run(async signal => {
      const response = await fetch('/api/stripe/portal', { method: 'POST', signal })
      const data = await response.json() as { url?: string }
      if (response.status === 400) return { needsPlan: true, url: '/pricing' }
      if (!response.ok || !data.url) throw new Error('billing unavailable')
      return { needsPlan: false, url: data.url }
    }, 'Connexion impossible au portail Stripe')
    if (!result || !isCurrent()) return
    if (result.needsPlan) toast.info('Souscris a un plan pour acceder a la facturation')
    window.location.href = result.url
  }
  return {
    user, profile, isCurrent, refetchPreferences, retrySettings, saving, profileForm, setProfileForm, notifSettings, setNotifSettings, accentColor,
    theme: storedTheme === 'light' ? 'light' as const : 'dark' as const,
    payments: paymentResource.data, loadingPayments: paymentResource.loading,
    error: preferences.error ?? paymentResource.error ?? (authError ? new Error(authError) : null),
    handleSaveProfile, handleSaveNotifs, handleSaveAccent, applyTheme, handleDeleteHistory,
    fetchPayments, handleManageBilling,
  }
}
