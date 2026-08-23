'use client'

import { useState, useEffect, useCallback } from 'react'
import { MessageSquare, Code, TrendingUp, BarChart2 } from 'lucide-react'
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
} from 'recharts'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Card from '@/components/ui/Card'
import Skeleton from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import { PLAN_LIMITS } from '@/lib/constants'
import { formatNumber, cn } from '@/lib/utils'

interface UsageDaily {
  date: string
  chat_count: number
  image_count: number
  audio_count: number
  code_count: number
}

const TYPE_COLORS = {
  chat_count: 'var(--cyan)',
  image_count: 'var(--purple)',
  audio_count: 'var(--pink)',
  code_count: 'var(--green)',
}

const TYPE_LABELS = {
  chat_count: 'Chat',
  image_count: 'Image',
  audio_count: 'Audio',
  code_count: 'Code',
}

function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })
}

function getPlanDailyLimit(plan: string): number {
  if (plan === 'free') return PLAN_LIMITS.free.daily_questions
  const parts = plan.split('_')
  if (parts.length === 2) {
    const [category, tier] = parts as [string, string]
    const cat = PLAN_LIMITS[category as keyof typeof PLAN_LIMITS]
    if (cat && typeof cat === 'object' && !('daily_questions' in cat)) {
      const tierData = (cat as Record<string, { daily_questions: number }>)[tier]
      if (tierData) return tierData.daily_questions
    }
  }
  return 10
}

export default function AnalyticsPage() {
  const { user, profile } = useAuth()
  const [usageData, setUsageData] = useState<UsageDaily[]>([])
  const [loading, setLoading] = useState(true)
  const [todayTotal, setTodayTotal] = useState(0)
  const [monthTotal, setMonthTotal] = useState(0)

  const supabase = createClient()

  const fetchUsage = useCallback(async () => {
    if (!user) return
    setLoading(true)

    const today = new Date()
    const sevenDaysAgo = new Date(today)
    sevenDaysAgo.setDate(today.getDate() - 6)

    const { data } = await supabase
      .from('usage_daily')
      .select('date, chat_count, image_count, audio_count, code_count')
      .eq('user_id', user.id)
      .gte('date', sevenDaysAgo.toISOString().split('T')[0])
      .order('date', { ascending: true })

    if (data) {
      setUsageData(data as UsageDaily[])

      const todayStr = today.toISOString().split('T')[0]
      const todayRow = data.find((d) => d.date === todayStr)
      if (todayRow) {
        setTodayTotal(
          (todayRow.chat_count ?? 0) +
          (todayRow.image_count ?? 0) +
          (todayRow.audio_count ?? 0) +
          (todayRow.code_count ?? 0)
        )
      }

      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
      const { data: monthData } = await supabase
        .from('usage_daily')
        .select('chat_count, image_count, audio_count, code_count')
        .eq('user_id', user.id)
        .gte('date', monthStart.toISOString().split('T')[0])

      if (monthData) {
        const sum = monthData.reduce(
          (acc, row) =>
            acc +
            (row.chat_count ?? 0) +
            (row.image_count ?? 0) +
            (row.audio_count ?? 0) +
            (row.code_count ?? 0),
          0
        )
        setMonthTotal(sum)
      }
    }
    setLoading(false)
  }, [user, supabase])

  useEffect(() => {
    fetchUsage()
  }, [fetchUsage])

  const planStr = profile?.plan ?? 'free'
  const dailyLimit = getPlanDailyLimit(planStr)
  const quotaPercent = dailyLimit === -1 ? 0 : Math.min((todayTotal / dailyLimit) * 100, 100)

  const quotaColor =
    dailyLimit === -1 ? 'bg-[var(--green)]' :
    quotaPercent >= 90 ? 'bg-red-400' :
    quotaPercent >= 70 ? 'bg-[var(--gold)]' :
    'bg-[var(--cyan)]'

  // Compute pie chart totals from usage data
  const pieTotals = usageData.reduce(
    (acc, row) => ({
      chat_count: acc.chat_count + (row.chat_count ?? 0),
      image_count: acc.image_count + (row.image_count ?? 0),
      audio_count: acc.audio_count + (row.audio_count ?? 0),
      code_count: acc.code_count + (row.code_count ?? 0),
    }),
    { chat_count: 0, image_count: 0, audio_count: 0, code_count: 0 }
  )

  const pieData = Object.entries(pieTotals)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({
      name: TYPE_LABELS[key as keyof typeof TYPE_LABELS],
      value,
      color: TYPE_COLORS[key as keyof typeof TYPE_COLORS],
    }))

  const hasData = usageData.some(
    (d) => d.chat_count > 0 || d.image_count > 0 || d.audio_count > 0 || d.code_count > 0
  )

  // Tokens approximation: avg 500 tokens per request
  const tokensApprox = monthTotal * 500

  const kpis = [
    {
      label: "Requetes aujourd'hui",
      value: formatNumber(todayTotal),
      icon: <MessageSquare className="h-5 w-5" />,
      color: 'var(--cyan)',
    },
    {
      label: 'Total ce mois',
      value: formatNumber(monthTotal),
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
  ]

  return (
    <div className="flex flex-col gap-6" data-testid="analytics-page">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] font-[family-name:var(--font-display)]">
          Analytics
        </h1>
        <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
          Suis ton utilisation en temps reel
        </p>
      </div>

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="kpi-cards">
          {kpis.map(({ label, value, icon, color }) => (
            <Card key={label} className="flex items-center gap-4 p-4">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
              >
                {icon}
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold text-[var(--text-primary)] truncate">{value}</p>
                <p className="text-xs text-[var(--text-muted)] leading-tight">{label}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Quota bar */}
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
            className={cn('h-full rounded-full transition-all duration-700', quotaColor)}
            style={{ width: dailyLimit === -1 ? '5%' : `${quotaPercent}%` }}
          />
        </div>
        {dailyLimit !== -1 && quotaPercent >= 80 && (
          <p className="mt-1.5 text-xs text-[var(--gold)]">
            Attention : tu approches de ta limite quotidienne.
          </p>
        )}
      </Card>

      {/* Charts */}
      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : !hasData ? (
        <EmptyState
          icon={<BarChart2 className="h-10 w-10" />}
          title="Aucune utilisation"
          description="Commence a utiliser AKASHA pour voir tes statistiques apparaitre ici."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Bar Chart - 7 days */}
          <Card className="p-5" data-testid="bar-chart">
            <h2 className="mb-4 text-sm font-semibold text-[var(--text-secondary)]">
              Utilisation des 7 derniers jours
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={usageData.map((d) => ({
                date: getDayLabel(d.date),
                Chat: d.chat_count ?? 0,
                Image: d.image_count ?? 0,
                Audio: d.audio_count ?? 0,
                Code: d.code_count ?? 0,
              }))}>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
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
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{value}</span>
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
      )}

      {/* Legend */}
      {hasData && (
        <div className="flex flex-wrap gap-3" data-testid="chart-legend">
          {Object.entries(TYPE_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
              <div
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: TYPE_COLORS[key as keyof typeof TYPE_COLORS] }}
              />
              {label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
