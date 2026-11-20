import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAsyncResource } from './useAsyncResource'
import type { AmbassadorData, AmbassadorStats, CommissionRow } from '@/types/ambassador'

const EMPTY_STATS: AmbassadorStats = { clicks: 0, signups: 0, conversions: 0, revenue: 0, conversion_rate: 0 }
type AmbassadorView = { ambassador: AmbassadorData | null; stats: AmbassadorStats; commissions: CommissionRow[] }
export function useAmbassadorData() {
  const { user, profile } = useAuth()
  const userId = user?.id
  const [supabase] = useState(createClient)
  const load = useCallback(async (signal: AbortSignal): Promise<AmbassadorView> => {
    const { data: ambassador, error } = await supabase.from('influencer_profiles').select('*')
      .eq('user_id', userId!).abortSignal(signal).maybeSingle()
    if (error) throw new Error('Impossible de charger le profil Ambassadeur.')
    if (!ambassador) return { ambassador: null, stats: EMPTY_STATS, commissions: [] }
    const [stats, commissions] = await Promise.all([
      supabase.from('influencer_stats').select('*').eq('user_id', userId!).abortSignal(signal).maybeSingle(),
      supabase.from('commissions').select('id, amount, type, status, created_at').eq('referrer_id', userId!)
        .order('created_at', { ascending: false }).limit(50).abortSignal(signal),
    ])
    if (stats.error || commissions.error) throw new Error('Impossible de charger les statistiques Ambassadeur.')
    return { ambassador: ambassador as AmbassadorData, stats: (stats.data as AmbassadorStats) ?? EMPTY_STATS, commissions: (commissions.data ?? []) as CommissionRow[] }
  }, [userId, supabase])
  const resource = useAsyncResource<AmbassadorView>(userId ?? null, load, { ambassador: null, stats: EMPTY_STATS, commissions: [] })
  const { isCurrent, refetch } = resource
  const [registeringScope, setRegisteringScope] = useState<(() => boolean) | null>(null)
  const registering = registeringScope === isCurrent

  const register = async () => {
    if (!userId || !profile || !isCurrent() || registering) return
    setRegisteringScope(() => isCurrent)
    try {
      const slug = (profile.display_name ?? profile.email ?? 'user').toLowerCase()
        .replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 20)
        + '-' + Math.random().toString(36).slice(2, 6)
      const { error } = await supabase.from('influencer_profiles').insert({
        user_id: userId, slug, bio: null, social_links: {}, approved: true, tier: 'bronze',
      })
      if (!isCurrent()) return
      if (error) throw new Error('Impossible de créer ton profil Ambassadeur')
      const stats = await supabase.from('influencer_stats').insert({ user_id: userId })
      if (!isCurrent()) return
      if (stats.error) {
        toast.error('Profil créé, mais les statistiques restent indisponibles. Actualise pour vérifier.')
      } else {
        toast.success('Bienvenue dans le programme Ambassadeur !')
      }
      await refetch()
    } catch {
      if (isCurrent()) toast.error('Impossible de créer ton profil Ambassadeur')
    } finally {
      if (isCurrent()) setRegisteringScope(null)
    }
  }
  return { ...resource.data, loading: resource.loading, error: resource.error, registering, register }
}
