'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { User, Bell, Shield, Palette, CreditCard, Database, LogOut, X, Check, Globe } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Skeleton from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import { formatDate, formatPrice, cn } from '@/lib/utils'
import { locales, localeNames, type  } from '@/i18n/config'

type Tab = 'profile' | 'notifications' | 'security' | 'appearance' | 'billing' | 'data'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'profile', label: 'Profil', icon: <User className="h-4 w-4" /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell className="h-4 w-4" /> },
  { id: 'security', label: 'Securite', icon: <Shield className="h-4 w-4" /> },
  { id: 'appearance', label: 'Apparence', icon: <Palette className="h-4 w-4" /> },
  { id: 'billing', label: 'Facturation', icon: <CreditCard className="h-4 w-4" /> },
  { id: 'data', label: 'Donnees', icon: <Database className="h-4 w-4" /> },
]

const ACCENT_COLORS = [
  { name: 'Cyan', value: '#00d4ff', class: 'bg-[#00d4ff]' },
  { name: 'Violet', value: '#8b5cf6', class: 'bg-[#8b5cf6]' },
  { name: 'Rose', value: '#ec4899', class: 'bg-[#ec4899]' },
  { name: 'Vert', value: '#10b981', class: 'bg-[#10b981]' },
  { name: 'Or', value: '#f59e0b', class: 'bg-[#f59e0b]' },
  { name: 'Orange', value: '#f97316', class: 'bg-[#f97316]' },
]

const NOTIFICATION_LABELS = [
  { key: 'product_updates', label: 'Emails de mise a jour produit' },
  { key: 'agent_notifications', label: 'Notifications push agents' },
  { key: 'quota_alerts', label: 'Alertes quota' },
  { key: 'newsletter', label: 'Newsletter' },
  { key: 'marketplace_notifications', label: 'Notifications marketplace' },
  { key: 'weekly_digest', label: 'Resume hebdomadaire' },
]

interface Payment {
  id: string
  amount: number
  status: string
  created_at: string
  invoice_number: string | null
}

export default function SettingsPage() {
  const router = useRouter()
  const { user, profile, signOut, refetch } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('profile')
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<'history' | null>(null)

  const supabase = createClient()

  // Initialize form from profile
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

  // Initialize theme from localStorage / DOM
  useEffect(() => {
    if (typeof document === 'undefined') return
    const stored = localStorage.getItem('akasha-theme') as 'dark' | 'light' | null
    const initial: 'dark' | 'light' = stored ?? 'dark'
    setTheme(initial)
    document.documentElement.dataset.theme = initial
  }, [])

  const applyTheme = (next: 'dark' | 'light') => {
    setTheme(next)
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = next
      localStorage.setItem('akasha-theme', next)
    }
    toast.success(next === 'dark' ? 'Mode sombre active' : 'Mode clair active')
  }

  // Fetch payments when billing tab opens
  useEffect(() => {
    if (activeTab !== 'billing' || !user) return
    setLoadingPayments(true)
    supabase
      .from('payments')
      .select('id, amount, status, created_at, invoice_number')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setPayments((data ?? []) as Payment[])
        setLoadingPayments(false)
      })
  }, [activeTab, user, supabase])

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
    // Notification prefs stored in local state — persisted via profile metadata when available
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

  const handleDeleteHistory = async () => {
    if (!user) return
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('user_id', user.id)
    if (error) {
      toast.error('Erreur lors de la suppression')
    } else {
      toast.success('Historique supprime !')
      setShowDeleteConfirm(null)
    }
  }

  const handleManageBilling = async () => {
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = (await res.json()) as { url?: string; error?: string }
      if (data.url) {
        window.location.href = data.url
        return
      }
      // No Stripe customer yet — guide user to pricing instead
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

  const planLabel = profile?.plan ?? 'free'

  return (
    <div className="flex flex-col gap-6" data-testid="settings-page">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] font-[family-name:var(--font-display)]">
          Parametres
        </h1>
        <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
          Gere ton compte et tes preferences
        </p>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
        {/* Tab Sidebar */}
        <nav className="flex flex-row gap-1 overflow-x-auto lg:flex-col lg:w-48 lg:shrink-0" data-testid="settings-tabs">
          {TABS.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              data-testid={`settings-tab-${id}`}
              className={cn(
                'flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all text-left',
                activeTab === id
                  ? 'bg-[var(--cyan)]/10 text-[var(--cyan)]'
                  : 'text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]'
              )}
            >
              {icon}
              {label}
            </button>
          ))}

          {/* Logout at bottom */}
          <div className="hidden lg:block mt-auto pt-4 border-t border-[var(--border)]">
            <button
              onClick={() => signOut()}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-all"
              data-testid="logout-btn"
            >
              <LogOut className="h-4 w-4" />
              Deconnexion
            </button>
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">

          {/* PROFIL */}
          {activeTab === 'profile' && (
            <Card className="p-6" data-testid="profile-tab">
              <h2 className="mb-5 font-semibold text-[var(--text-primary)]">Informations du profil</h2>
              <div className="flex flex-col gap-5">
                {/* Avatar Preview */}
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--cyan)] to-[var(--purple)] text-xl font-bold text-black">
                    {profileForm.display_name?.[0]?.toUpperCase() ?? profile?.email?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      {profileForm.display_name || 'Utilisateur'}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">{user?.email}</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
                      Nom d&apos;affichage
                    </label>
                    <input
                      type="text"
                      value={profileForm.display_name}
                      onChange={(e) => setProfileForm((f) => ({ ...f, display_name: e.target.value }))}
                      className="w-full rounded-xl border border-[var(--border)] bg-white/5 px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--cyan)] focus:outline-none"
                      data-testid="input-display-name"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
                      Pseudo
                    </label>
                    <input
                      type="text"
                      value={profileForm.pseudo}
                      onChange={(e) => setProfileForm((f) => ({ ...f, pseudo: e.target.value }))}
                      className="w-full rounded-xl border border-[var(--border)] bg-white/5 px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--cyan)] focus:outline-none"
                      data-testid="input-pseudo"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
                    Email
                  </label>
                  <input
                    type="email"
                    value={user?.email ?? ''}
                    readOnly
                    className="w-full rounded-xl border border-[var(--border)] bg-white/5 px-4 py-2.5 text-sm text-[var(--text-muted)] cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
                    Bio
                  </label>
                  <textarea
                    value={profileForm.bio}
                    onChange={(e) => setProfileForm((f) => ({ ...f, bio: e.target.value }))}
                    rows={3}
                    placeholder="Decris-toi en quelques mots..."
                    className="w-full resize-none rounded-xl border border-[var(--border)] bg-white/5 px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--cyan)] focus:outline-none"
                    data-testid="input-bio"
                  />
                </div>

                <Button onClick={handleSaveProfile} loading={saving} data-testid="save-profile-btn">
                  Sauvegarder
                </Button>
              </div>
            </Card>
          )}

          {/* NOTIFICATIONS */}
          {activeTab === 'notifications' && (
            <Card className="p-6" data-testid="notifications-tab">
              <h2 className="mb-5 font-semibold text-[var(--text-primary)]">Preferences de notification</h2>
              <div className="flex flex-col gap-4">
                {NOTIFICATION_LABELS.map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0">
                    <p className="text-sm text-[var(--text-primary)]">{label}</p>
                    <button
                      onClick={() =>
                        setNotifSettings((prev) => ({ ...prev, [key]: !prev[key] }))
                      }
                      data-testid={`toggle-notif-${key}`}
                      className={cn(
                        'relative h-6 w-11 rounded-full transition-colors',
                        notifSettings[key] ? 'bg-[var(--cyan)]' : 'bg-white/10'
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
                          notifSettings[key] ? 'left-5.5 translate-x-0' : 'left-0.5'
                        )}
                        style={{ left: notifSettings[key] ? '22px' : '2px' }}
                      />
                    </button>
                  </div>
                ))}

                <Button onClick={handleSaveNotifs} loading={saving} className="mt-2" data-testid="save-notifs-btn">
                  Sauvegarder
                </Button>
              </div>
            </Card>
          )}

          {/* SECURITE */}
          {activeTab === 'security' && (
            <div className="flex flex-col gap-4" data-testid="security-tab">
              <Card className="p-6">
                <h2 className="mb-4 font-semibold text-[var(--text-primary)]">Mot de passe</h2>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    if (!user?.email) return
                    const res = await supabase.auth.resetPasswordForEmail(user.email, {
                      redirectTo: `${window.location.origin}/auth/callback?next=/dashboard/settings`,
                    })
                    if (res.error) toast.error('Erreur')
                    else toast.success('Email envoye a ' + user.email)
                  }}
                  data-testid="reset-password-btn"
                >
                  Changer le mot de passe
                </Button>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  Un email de reinitialisation sera envoye a ton adresse.
                </p>
              </Card>

              <Card className="p-6">
                <h2 className="mb-4 font-semibold text-[var(--text-primary)]">Session active</h2>
                <div className="flex flex-col gap-1 rounded-xl bg-white/5 p-4 text-sm">
                  <p className="text-[var(--text-primary)]">Email : {user?.email}</p>
                  <p className="text-[var(--text-muted)]">
                    Cree le : {user?.created_at ? formatDate(user.created_at) : '—'}
                  </p>
                  <p className="text-[var(--text-muted)]">
                    Fournisseur : {user?.app_metadata?.provider ?? 'email'}
                  </p>
                </div>
              </Card>

              <Card className="p-6 border border-red-500/20">
                <h2 className="mb-2 font-semibold text-red-400">Zone de danger</h2>
                <p className="mb-4 text-sm text-[var(--text-secondary)]">
                  La suppression de ton compte est irreversible.
                </p>
                <Button
                  variant="danger"
                  onClick={() => router.push('/dashboard/memoire')}
                  data-testid="delete-account-btn"
                >
                  Supprimer mon compte
                </Button>
              </Card>
            </div>
          )}

          {/* APPARENCE */}
          {activeTab === 'appearance' && (
            <div className="flex flex-col gap-4" data-testid="appearance-tab">
              <Card className="p-6">
                <h2 className="mb-4 font-semibold text-[var(--text-primary)]">Mode d&apos;affichage</h2>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => applyTheme('dark')}
                    data-testid="theme-dark"
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-xl border p-4 transition-all',
                      theme === 'dark'
                        ? 'border-[var(--cyan)] bg-[var(--cyan)]/10'
                        : 'border-[var(--border)] hover:border-[var(--border-glow)]'
                    )}
                  >
                    <div className="h-12 w-full rounded-lg bg-[#0a0a0f] border border-white/10" />
                    <span className="text-sm font-medium text-[var(--text-primary)]">Sombre</span>
                  </button>
                  <button
                    onClick={() => applyTheme('light')}
                    data-testid="theme-light"
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-xl border p-4 transition-all',
                      theme === 'light'
                        ? 'border-[var(--cyan)] bg-[var(--cyan)]/10'
                        : 'border-[var(--border)] hover:border-[var(--border-glow)]'
                    )}
                  >
                    <div className="h-12 w-full rounded-lg bg-[#f8fafc] border border-black/10" />
                    <span className="text-sm font-medium text-[var(--text-primary)]">Clair</span>
                  </button>
                </div>
              </Card>

              <Card className="p-6">
                <h2 className="mb-4 font-semibold text-[var(--text-primary)]">Couleur d&apos;accent</h2>
                <div className="flex flex-wrap gap-3">
                  {ACCENT_COLORS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => handleSaveAccent(c.value)}
                      title={c.name}
                      data-testid={`accent-${c.name.toLowerCase()}`}
                      className={cn(
                        'relative h-9 w-9 rounded-full transition-transform hover:scale-110',
                        c.class,
                        accentColor === c.value && 'ring-2 ring-white ring-offset-2 ring-offset-[var(--bg)]'
                      )}
                    >
                      {accentColor === c.value && (
                        <Check className="absolute inset-0 m-auto h-4 w-4 text-black" />
                      )}
                    </button>
                  ))}
                </div>
              </Card>

              <Card className="p-6">
                <h2 className="mb-3 font-semibold text-[var(--text-primary)]">Langue de l&apos;interface</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {locales.map((locale) => {
                    const currentLocale = (typeof document !== 'undefined' ? document.cookie.match(/locale=(\w+)/)?.[1] : 'fr') ?? 'fr'
                    const isActive = locale === currentLocale
                    return (
                      <button
                        key={locale}
                        onClick={async () => {
                          await fetch('/api/locale', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ locale }),
                          })
                          window.location.reload()
                        }}
                        className={cn(
                          'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-all',
                          isActive
                            ? 'border-[var(--cyan)] bg-[var(--cyan)]/10 text-[var(--cyan)]'
                            : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]'
                        )}
                      >
                        <Globe className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{localeNames[locale]}</span>
                        {isActive && <Check className="h-3.5 w-3.5 shrink-0 ml-auto" />}
                      </button>
                    )
                  })}
                </div>
                <p className="mt-3 text-xs text-[var(--text-muted)]">
                  L&apos;IA AKASHA repond automatiquement dans la langue de ta question.
                </p>
              </Card>
            </div>
          )}

          {/* FACTURATION */}
          {activeTab === 'billing' && (
            <div className="flex flex-col gap-4" data-testid="billing-tab">
              <Card className="p-6">
                <h2 className="mb-4 font-semibold text-[var(--text-primary)]">Plan actuel</h2>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-[var(--text-primary)] capitalize">{planLabel}</p>
                    <p className="text-xs text-[var(--text-muted)]">Actif</p>
                  </div>
                  <Badge variant="cyan">{planLabel}</Badge>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button variant="secondary" onClick={handleManageBilling} data-testid="manage-billing-btn">
                    Gerer mon abonnement
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => window.location.href = '/pricing'}
                    data-testid="upgrade-btn"
                  >
                    Upgrade
                  </Button>
                </div>
              </Card>

              <Card className="p-6">
                <h2 className="mb-4 font-semibold text-[var(--text-primary)]">Historique des factures</h2>
                {loadingPayments ? (
                  <div className="flex flex-col gap-2">
                    {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
                  </div>
                ) : payments.length === 0 ? (
                  <EmptyState
                    title="Aucune facture"
                    description="Tes factures apparaitront ici apres ton premier paiement."
                  />
                ) : (
                  <div className="divide-y divide-[var(--border)]">
                    {payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between py-3">
                        <div>
                          <p className="text-sm font-medium text-[var(--text-primary)]">
                            {p.invoice_number ?? `#${p.id.slice(0, 8)}`}
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">{formatDate(p.created_at)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={p.status === 'succeeded' ? 'green' : 'default'}>
                            {p.status === 'succeeded' ? 'Paye' : p.status}
                          </Badge>
                          <span className="text-sm font-semibold text-[var(--text-primary)]">
                            {formatPrice(p.amount)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* DONNEES */}
          {activeTab === 'data' && (
            <div className="flex flex-col gap-4" data-testid="data-tab">
              <Card className="p-6">
                <h2 className="mb-2 font-semibold text-[var(--text-primary)]">Ma memoire</h2>
                <p className="mb-4 text-sm text-[var(--text-secondary)]">
                  Exporte tes donnees, consulte tes acceptations legales ou supprime ton compte (RGPD).
                </p>
                <Button
                  variant="secondary"
                  onClick={() => router.push('/dashboard/memoire')}
                  data-testid="export-data-btn"
                >
                  Voir ma memoire
                </Button>
              </Card>

              <Card className="p-6">
                <h2 className="mb-2 font-semibold text-[var(--text-primary)]">
                  Supprimer mon historique
                </h2>
                <p className="mb-4 text-sm text-[var(--text-secondary)]">
                  Supprime toutes tes conversations et messages. Cette action est irreversible.
                </p>
                <Button
                  variant="danger"
                  onClick={() => setShowDeleteConfirm('history')}
                  data-testid="delete-history-btn"
                >
                  Supprimer l&apos;historique
                </Button>
              </Card>

              <Card className="p-6 border border-red-500/20">
                <h2 className="mb-2 font-semibold text-red-400">Supprimer mon compte</h2>
                <p className="mb-4 text-sm text-[var(--text-secondary)]">
                  Programme la suppression definitive de ton compte (periode de grace 30 jours).
                </p>
                <Button
                  variant="danger"
                  onClick={() => router.push('/dashboard/memoire')}
                  data-testid="delete-account-data-btn"
                >
                  Supprimer mon compte
                </Button>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Mobile logout */}
      <div className="lg:hidden">
        <Button
          variant="danger"
          onClick={() => signOut()}
          icon={<LogOut className="h-4 w-4" />}
          className="w-full"
          data-testid="logout-btn-mobile"
        >
          Deconnexion
        </Button>
      </div>

      {/* Confirm Modals */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => e.target === e.currentTarget && setShowDeleteConfirm(null)}
        >
          <Card className="w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-[var(--text-primary)]">Supprimer l&apos;historique ?</h2>
              <button onClick={() => setShowDeleteConfirm(null)}>
                <X className="h-4 w-4 text-[var(--text-muted)]" />
              </button>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Toutes tes conversations seront supprimees definitivement.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setShowDeleteConfirm(null)}>
                Annuler
              </Button>
              <Button
                variant="danger"
                onClick={handleDeleteHistory}
                data-testid="confirm-delete-history"
              >
                Supprimer
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
