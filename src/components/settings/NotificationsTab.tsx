import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { NOTIFICATION_LABELS } from '@/lib/settings-constants'

interface NotificationsTabProps {
  settings: Record<string, boolean>
  onToggle: (key: string) => void
  onSave: () => void
  saving: boolean
}

export default function NotificationsTab({
  settings,
  onToggle,
  onSave,
  saving,
}: NotificationsTabProps) {
  return (
    <Card className="p-6" data-testid="notifications-tab">
      <h2 className="mb-5 font-semibold text-[var(--text-primary)]">Preferences de notification</h2>
      <div className="flex flex-col gap-4">
        {NOTIFICATION_LABELS.map(({ key, label }) => (
          <div
            key={key}
            className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0"
          >
            <p className="text-sm text-[var(--text-primary)]">{label}</p>
            <button
              onClick={() => onToggle(key)}
              data-testid={`toggle-notif-${key}`}
              className={cn(
                'relative h-6 w-11 rounded-full transition-colors',
                settings[key] ? 'bg-[var(--cyan)]' : 'bg-white/10'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
                  settings[key] ? 'left-5.5 translate-x-0' : 'left-0.5'
                )}
                style={{ left: settings[key] ? '22px' : '2px' }}
              />
            </button>
          </div>
        ))}

        <Button onClick={onSave} loading={saving} className="mt-2" data-testid="save-notifs-btn">
          Sauvegarder
        </Button>
      </div>
    </Card>
  )
}
