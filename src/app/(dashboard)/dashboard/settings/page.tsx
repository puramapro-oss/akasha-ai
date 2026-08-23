'use client'

import { useState, useEffect } from 'react'
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
  const {
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
  } = useSettingsData()

  const [activeTab, setActiveTab] = useState<Tab>('profile')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    if (activeTab === 'billing') {
      fetchPayments()
    }
  }, [activeTab])

  const onDeleteConfirm = async () => {
    const success = await handleDeleteHistory()
    if (success) setShowDeleteConfirm(false)
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

          {activeTab === 'data' && <DataTab onDeleteHistory={() => setShowDeleteConfirm(true)} />}
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
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={onDeleteConfirm}
        />
      )}
    </div>
  )
}
