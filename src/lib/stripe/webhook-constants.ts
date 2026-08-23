import type { Plan, PlanTier } from '@/types'

export const PRICE_TO_PLAN: Record<string, { plan: Exclude<Plan, 'free'>; tier: PlanTier }> = {
  'price_1TJ1Qd4Y1unNvKtXg0D4EwNl': { plan: 'automate', tier: 'essential' },
  'price_1TJ1Qd4Y1unNvKtXxPBnMHH6': { plan: 'automate', tier: 'pro' },
  'price_1TJ1Qe4Y1unNvKtXbW6i1dbb': { plan: 'automate', tier: 'max' },
  'price_1TJ1Qf4Y1unNvKtXJ4AermBW': { plan: 'create', tier: 'essential' },
  'price_1TJ1Qg4Y1unNvKtXGDtTEGVI': { plan: 'create', tier: 'pro' },
  'price_1TJ1Qh4Y1unNvKtX9nRkx5iU': { plan: 'create', tier: 'max' },
  'price_1TJ1Qi4Y1unNvKtX5A9jRzzz': { plan: 'build', tier: 'essential' },
  'price_1TJ1Qj4Y1unNvKtXFXeoz1PH': { plan: 'build', tier: 'pro' },
  'price_1TJ1Qk4Y1unNvKtX4cq6L73s': { plan: 'build', tier: 'max' },
  'price_1TJ1Ql4Y1unNvKtXe0NQ6Mws': { plan: 'complete', tier: 'essential' },
  'price_1TJ1Qm4Y1unNvKtXVAlGNlmC': { plan: 'complete', tier: 'pro' },
  'price_1TJ1Qn4Y1unNvKtXXu1OPZNx': { plan: 'complete', tier: 'max' },
}

export const PRIME_J1_AMOUNT = 25.0
