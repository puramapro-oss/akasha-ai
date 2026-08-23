'use client'

// =============================================================================
// AKASHA AI — QuotaBar
// Barre de quota quotidien
// =============================================================================

import { cn } from '@/lib/utils';
import Card from '@/components/ui/Card';

interface QuotaBarProps {
  todayTotal: number;
  dailyLimit: number;
}

export default function QuotaBar({ todayTotal, dailyLimit }: QuotaBarProps) {
  const quotaPercent =
    dailyLimit === -1 ? 0 : Math.min((todayTotal / dailyLimit) * 100, 100);

  const quotaColor =
    dailyLimit === -1
      ? 'bg-[var(--green)]'
      : quotaPercent >= 90
        ? 'bg-red-400'
        : quotaPercent >= 70
          ? 'bg-[var(--gold)]'
          : 'bg-[var(--cyan)]';

  return (
    <Card className="p-5" data-testid="quota-bar">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-[var(--text-secondary)]">
          Quota quotidien
        </p>
        <p className="text-sm text-[var(--text-muted)]">
          {dailyLimit === -1 ? 'Illimite' : `${todayTotal} / ${dailyLimit}`}
        </p>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-700',
            quotaColor
          )}
          style={{ width: dailyLimit === -1 ? '5%' : `${quotaPercent}%` }}
        />
      </div>
      {dailyLimit !== -1 && quotaPercent >= 80 && (
        <p className="mt-1.5 text-xs text-[var(--gold)]">
          Attention : tu approches de ta limite quotidienne.
        </p>
      )}
    </Card>
  );
}
