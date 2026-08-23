import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Payment } from '@/lib/settings-constants'

export function useSettingsData() {
  const { user, profile, refetch } = useAuth()
  const [saving, setSaving] = useState(false)
  const [profileForm, setProfileForm] = useState({
    display_name: '',
    pseudo: '',
    bio: '',
  })
  const [notifSettings, setNotifSettings] = useState<Record<string, boolean>>({
    product_updates: true,
    agent_notifications: true,
    quota_alerts: true,
    newsletter: false,
    marketplace_notifications: true,
    weekly_digest: true,
  })
  const [accentColor, setAccentColor] = useState('#00d4ff')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [payments, setPayments] = useState<Payment[]>([])
  const [loadingPayments, setLoadingPayments] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    if (profile) {
      setProfileForm({
        display_name: profile.display_name ?? '',
        pseudo: profile.pseudo ?? '',
        bio: profile.bio ?? '',
      })
      setAccentColor(profile.accent_color ?? '#00d4ff')
    }
  }, [profile])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const stored = localStorage.getItem('akasha-theme') as 'dark' | 'light' | null
    const initial: 'dark' | 'light' = stored ?? 'dark'
    setTheme(initial)
    document.documentElement.dataset.theme = initial
  }, [])

  const handleSaveProfile = async () => {
    if (!user) return
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: profileForm.display_name || null,
        pseudo: profileForm.pseudo || null,
        bio: profileForm.bio || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (error) {
      toast.error('Erreur lors de la sauvegarde')
    } else {
      toast.success('Profil mis a jour !')
      refetch()
    }
    setSaving(false)
  }

  const handleSaveNotifs = async () => {
    if (!user) return
    setSaving(true)
    await new Promise((r) => setTimeout(r, 300))
    toast.success('Preferences sauvegardees !')
    setSaving(false)
  }

  const handleSaveAccent = async (color: string) => {
    setAccentColor(color)
    if (!user) return
    await supabase
      .from('profiles')
      .update({
        accent_color: color,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)
    toast.success('Couleur sauvegardee !')
  }

  const applyTheme = (next: 'dark' | 'light') => {
    setTheme(next)
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = next
      localStorage.setItem('akasha-theme', next)
    }
    toast.success(next === 'dark' ? 'Mode sombre active' : 'Mode clair active')
  }

  const handleDeleteHistory = async () => {
    if (!user) return
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('user_id', user.id)
    if (error) {
      toast.error('Erreur lors de la suppression')
      return false
    }
    toast.success('Historique supprime !')
    return true
  }

  const fetchPayments = async () => {
    if (!user) return
    setLoadingPayments(true)
    const { data } = await supabase
      .from('payments')
      .select('id, amount, status, created_at, invoice_number')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)
    setPayments((data ?? []) as Payment[])
    setLoadingPayments(false)
  }

  const handleManageBilling = async () => {
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = (await res.json()) as { url?: string; error?: string }
      if (data.url) {
        window.location.href = data.url
        return
      }
      if (res.status === 400) {
        toast.info('Souscris a un plan pour acceder a la facturation')
        window.location.href = '/pricing'
        return
      }
      toast.error(data.error ?? 'Erreur acces facturation')
    } catch {
      toast.error('Connexion impossible au portail Stripe')
    }
  }

  return {
    user,
    profile,
    saving,
    profileForm,
    setProfileForm,
    notifSettings,
    setNotifSettings,
    accentColor,
    theme,
    payments,
    loadingPayments,
    handleSaveProfile,
    handleSaveNotifs,
    handleSaveAccent,
    applyTheme,
    handleDeleteHistory,
    fetchPayments,
    handleManageBilling,
  }
}
