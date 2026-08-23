export const MIN_WITHDRAWAL_EUR = 20
export const RECOMMENDED_WITHDRAWAL_EUR = 50

export const FEES_GRID: Array<{
  amount: number
  feeEur: number
  pct: string
  tone: 'danger' | 'warn' | 'ok'
}> = [
  { amount: 20, feeEur: 2.3, pct: '11,5%', tone: 'danger' },
  { amount: 30, feeEur: 2.33, pct: '7,8%', tone: 'warn' },
  { amount: 50, feeEur: 2.38, pct: '4,8%', tone: 'ok' },
  { amount: 100, feeEur: 2.5, pct: '2,5%', tone: 'ok' },
]
