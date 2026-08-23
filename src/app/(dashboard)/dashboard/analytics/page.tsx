'use client'

// =============================================================================
// AKASHA AI — Analytics Page
// Page de suivi d'utilisation en temps réel
// =============================================================================

import { MessageSquare, Code, TrendingUp, BarChart2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { formatNumber } from '@/lib/utils';
import { useUsageData } from './use-usage-data';
import { getPlanDailyLimit } from './analytics-utils';
import KPICards from './KPICards';
import QuotaBar from './QuotaBar';
import UsageCharts from './UsageCharts';
import ChartLegend from './ChartLegend';
import type { KPICardData } from './analytics-types';

export default function AnalyticsPage() {
  const { user, profile } = useAuth();
  const { usageData, stats, loading } = useUsageData(user?.id);

  const planStr = profile?.plan ?? 'free';
  const dailyLimit = getPlanDailyLimit(planStr);

  // Tokens approximation: avg 500 tokens per request
  const tokensApprox = stats.monthTotal * 500;

  const kpis: KPICardData[] = [
    {
      label: "Requetes aujourd'hui",
      value: formatNumber(stats.todayTotal),
      icon: <MessageSquare className="h-5 w-5" />,
      color: 'var(--cyan)',
    },
    {
      label: 'Total ce mois',
      value: formatNumber(stats.monthTotal),
      icon: <TrendingUp className="h-5 w-5" />,
      color: 'var(--purple)',
    },
    {
      label: 'Tokens consommes',
      value: `~${formatNumber(tokensApprox)}`,
      icon: <BarChart2 className="h-5 w-5" />,
      color: 'var(--gold)',
    },
    {
      label: 'Limite quotidienne',
      value: dailyLimit === -1 ? 'Illimitee' : formatNumber(dailyLimit),
      icon: <Code className="h-5 w-5" />,
      color: 'var(--green)',
    },
  ];

  const hasData = usageData.some(
    (d) => d.chat_count > 0 || d.image_count > 0 || d.audio_count > 0 || d.code_count > 0
  );

  return (
    <div className="flex flex-col gap-6" data-testid="analytics-page">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] font-[family-name:var(--font-display)]">
          Analytics
        </h1>
        <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
          Suis ton utilisation en temps reel
        </p>
      </div>

      <KPICards kpis={kpis} loading={loading} />

      <QuotaBar todayTotal={stats.todayTotal} dailyLimit={dailyLimit} />

      <UsageCharts usageData={usageData} loading={loading} />

      {hasData && <ChartLegend />}
    </div>
  );
}
