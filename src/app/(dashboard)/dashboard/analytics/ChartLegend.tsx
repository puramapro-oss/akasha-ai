'use client'

// =============================================================================
// AKASHA AI — ChartLegend
// Légende des types de requêtes
// =============================================================================

import { TYPE_COLORS, TYPE_LABELS } from './analytics-constants';

export default function ChartLegend() {
  return (
    <div className="flex flex-wrap gap-3" data-testid="chart-legend">
      {Object.entries(TYPE_LABELS).map(([key, label]) => (
        <div
          key={key}
          className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]"
        >
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: TYPE_COLORS[key as keyof typeof TYPE_COLORS] }}
          />
          {label}
        </div>
      ))}
    </div>
  );
}
