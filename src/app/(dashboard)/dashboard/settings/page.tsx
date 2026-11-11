'use client'

import { useState } from 'react'
import { LogOut } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'
import { useSettingsData } from '@/hooks/useSettingsData'
import SettingsTabs from '@/components/settings/SettingsTabs'
import ProfileTab from '@/components/settings/ProfileTab'
import NotificationsTab from '@/components/settings/NotificationsTab'
import SecurityTab from '@/components/settings/SecurityTab'
import AppearanceTab from '@/components/settings/AppearanceTab'
import BillingTab from '@/components/settings/BillingTab'
import DataTab from '@/components/settings/DataTab'
import DeleteHistoryModal from '@/components/settings/DeleteHistoryModal'
import type { Tab } from '@/lib/settings-constants'

export default function SettingsPage() {
  const { signOut } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('profile')
  const {
    user,
    profile,
    isCurrent,
    error,
    retrySettings,
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
    handleManageBilling,
  } = useSettingsData(activeTab === 'billing')

  const [deleteOwner, setDeleteOwner] = useState<(() => boolean) | null>(null)
  const showDeleteConfirm = deleteOwner === isCurrent

  const onDeleteConfirm = async () => {
    const success = await handleDeleteHistory()
    if (success) setDeleteOwner(null)
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

      {error && (
        <div role="alert" className="text-sm text-red-400">
          <p>{error.message}</p>
          <button type="button" onClick={() => { void retrySettings() }}>
            Réessayer le chargement
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
        <SettingsTabs activeTab={activeTab} onTabChange={setActiveTab} onSignOut={signOut} />

        <div className="flex-1 min-w-0">
          {activeTab === 'profile' && (
            <ProfileTab
              user={user}
              profileForm={profileForm}
              onFormChange={(update) => setProfileForm((f) => ({ ...f, ...update }))}
              onSave={handleSaveProfile}
              saving={saving}
              email={profile?.email}
            />
          )}

          {activeTab === 'notifications' && (
            <NotificationsTab
              settings={notifSettings}
              onToggle={(key) => setNotifSettings((prev) => ({ ...prev, [key]: !prev[key] }))}
              onSave={handleSaveNotifs}
              saving={saving}
            />
          )}

          {activeTab === 'security' && <SecurityTab user={user} />}

          {activeTab === 'appearance' && (
            <AppearanceTab
              theme={theme}
              accentColor={accentColor}
              onThemeChange={applyTheme}
              onAccentChange={handleSaveAccent}
            />
          )}

          {activeTab === 'billing' && (
            <BillingTab
              planLabel={planLabel}
              payments={payments}
              loadingPayments={loadingPayments}
              onManageBilling={handleManageBilling}
            />
          )}

          {activeTab === 'data' && <DataTab onDeleteHistory={() => setDeleteOwner(() => isCurrent)} />}
        </div>
      </div>

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

      {showDeleteConfirm && (
        <DeleteHistoryModal
          onCancel={() => setDeleteOwner(null)}
          onConfirm={onDeleteConfirm}
        />
      )}
    </div>
  )
}
