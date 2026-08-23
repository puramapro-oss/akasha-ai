import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { AmbassadorData, AmbassadorStats, CommissionRow } from '@/types/ambassador'

export function useAmbassadorData() {
  const { user, profile } = useAuth()
  const [ambassador, setAmbassador] = useState<AmbassadorData | null>(null)
  const [stats, setStats] = useState<AmbassadorStats>({
    clicks: 0,
    signups: 0,
    conversions: 0,
    revenue: 0,
    conversion_rate: 0,
  })
  const [commissions, setCommissions] = useState<CommissionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [registering, setRegistering] = useState(false)
  const supabase = createClient()

  const load = useCallback(async () => {
    if (!user) return

    const { data: inf } = await supabase
      .from('influencer_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (inf) {
      setAmbassador(inf as AmbassadorData)

      const [statsRes, commissionsRes] = await Promise.all([
        supabase
          .from('influencer_stats')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('commissions')
          .select('id, amount, type, status, created_at')
          .eq('referrer_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ])

      if (statsRes.data) setStats(statsRes.data as AmbassadorStats)
      if (commissionsRes.data) setCommissions(commissionsRes.data as CommissionRow[])
    }

    setLoading(false)
  }, [user, supabase])

  useEffect(() => {
    load()
  }, [load])

  const register = async () => {
    if (!user || !profile) return
    setRegistering(true)

    const slug = (profile.display_name ?? profile.email ?? 'user')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 20) + '-' + Math.random().toString(36).slice(2, 6)

    const { error } = await supabase.from('influencer_profiles').insert({
      user_id: user.id,
      slug,
      bio: null,
      social_links: {},
      approved: true,
      tier: 'bronze',
    })

    if (error) {
      toast.error('Impossible de créer ton profil Ambassadeur')
    } else {
      await supabase.from('influencer_stats').insert({ user_id: user.id })
      toast.success('Bienvenue dans le programme Ambassadeur !')
      load()
    }
    setRegistering(false)
  }

  return {
    ambassador,
    stats,
    commissions,
    loading,
    registering,
    register,
  }
}
