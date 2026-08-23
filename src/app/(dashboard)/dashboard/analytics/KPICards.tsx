'use client'

// =============================================================================
// AKASHA AI — KPICards
// Cartes KPI pour analytics (4 cartes)
// =============================================================================

import Card from '@/components/ui/Card';
import Skeleton from '@/components/ui/Skeleton';
import type { KPICardData } from './analytics-types';

interface KPICardsProps {
  kpis: KPICardData[];
  loading: boolean;
}

export default function KPICards({ kpis, loading }: KPICardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="kpi-cards">
      {kpis.map(({ label, value, icon, color }) => (
        <Card key={label} className="flex items-center gap-4 p-4">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: `color-mix(in srgb, ${color} 15%, transparent)`,
              color,
            }}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-xl font-bold text-[var(--text-primary)] truncate">
              {value}
            </p>
            <p className="text-xs text-[var(--text-muted)] leading-tight">
              {label}
            </p>
          </div>
        </Card>
      ))}
    </div>
  );
}
