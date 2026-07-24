import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// Contact form: 3 messages per 10 minutes per IP
export const ratelimitContact = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '10 m'),
  prefix: 'akasha:contact',
})

// AI creative generation: 10 per hour per user (costly Anthropic API)
export const ratelimitCreative = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 h'),
  prefix: 'akasha:creative',
})

// AI audit: 5 per hour per user (costly Anthropic API)
export const ratelimitAudit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 h'),
  prefix: 'akasha:audit',
})

// Referral registration: 10 per hour per IP (abuse prevention)
export const ratelimitReferral = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 h'),
  prefix: 'akasha:referral',
})

// Daily gift: 20 per hour per user (legitimate retries allowed but prevent spam)
export const ratelimitDailyGift = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 h'),
  prefix: 'akasha:daily-gift',
})
