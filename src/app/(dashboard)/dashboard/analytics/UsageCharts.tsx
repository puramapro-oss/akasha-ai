'use client'

// =============================================================================
// AKASHA AI — UsageCharts
// Bar chart (7 jours) et Pie chart (répartition par type)
// =============================================================================

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { BarChart2 } from 'lucide-react';
import Card from '@/components/ui/Card';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import { TYPE_COLORS, TYPE_LABELS } from './analytics-constants';
import { getDayLabel } from './analytics-utils';
import type { UsageDaily } from './analytics-types';

interface UsageChartsProps {
  usageData: UsageDaily[];
  loading: boolean;
}

export default function UsageCharts({ usageData, loading }: UsageChartsProps) {
  const hasData = usageData.some(
    (d) => d.chat_count > 0 || d.image_count > 0 || d.audio_count > 0 || d.code_count > 0
  );

  const pieTotals = usageData.reduce(
    (acc, row) => ({
      chat_count: acc.chat_count + (row.chat_count ?? 0),
      image_count: acc.image_count + (row.image_count ?? 0),
      audio_count: acc.audio_count + (row.audio_count ?? 0),
      code_count: acc.code_count + (row.code_count ?? 0),
    }),
    { chat_count: 0, image_count: 0, audio_count: 0, code_count: 0 }
  );

  const pieData = Object.entries(pieTotals)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({
      name: TYPE_LABELS[key as keyof typeof TYPE_LABELS],
      value,
      color: TYPE_COLORS[key as keyof typeof TYPE_COLORS],
    }));

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!hasData) {
    return (
      <EmptyState
        icon={<BarChart2 className="h-10 w-10" />}
        title="Aucune utilisation"
        description="Commence a utiliser AKASHA pour voir tes statistiques apparaitre ici."
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Bar Chart - 7 days */}
      <Card className="p-5" data-testid="bar-chart">
        <h2 className="mb-4 text-sm font-semibold text-[var(--text-secondary)]">
          Utilisation des 7 derniers jours
        </h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={usageData.map((d) => ({
              date: getDayLabel(d.date),
              Chat: d.chat_count ?? 0,
              Image: d.image_count ?? 0,
              Audio: d.audio_count ?? 0,
              Code: d.code_count ?? 0,
            }))}
          >
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: 'rgba(10,10,15,0.95)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
                fontSize: '12px',
              }}
            />
            <Bar dataKey="Chat" stackId="a" fill="var(--cyan)" radius={[0, 0, 0, 0]} />
            <Bar dataKey="Image" stackId="a" fill="var(--purple)" />
            <Bar dataKey="Audio" stackId="a" fill="var(--pink)" />
            <Bar dataKey="Code" stackId="a" fill="var(--green)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Pie Chart */}
      <Card className="p-5" data-testid="pie-chart">
        <h2 className="mb-4 text-sm font-semibold text-[var(--text-secondary)]">
          Repartition par type
        </h2>
        {pieData.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-[var(--text-muted)]">
            Aucune donnee
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Legend
                formatter={(value) => (
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {value}
                  </span>
                )}
              />
              <Tooltip
                contentStyle={{
                  background: 'rgba(10,10,15,0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px',
                  fontSize: '12px',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}
