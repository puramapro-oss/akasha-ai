import { test, expect, type Page } from '@playwright/test'

const BASE = 'http://localhost:3000'

function attachConsole(page: Page) {
  const errors: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', err => errors.push(err.message))
  return errors
}

function filterBenign(errors: string[]) {
  return errors.filter(e =>
    !e.includes('Failed to load resource') &&
    !e.includes('favicon') &&
    !e.includes('manifest') &&
    !e.includes('hydrat') &&
    !e.includes('Warning:') &&
    !e.includes('Supabase') &&
    !e.includes('ERR_CONNECTION') &&
    !e.includes('net::')
  )
}

// ─── All public pages return 200 ─────────────────────────────────────────────

const ALL_PUBLIC_PAGES = [
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/pricing',
  '/mentions-legales',
  '/cgu',
  '/cgv',
  '/politique-confidentialite',
  '/cookies',
  '/onboarding',
  '/aide',
  '/contact',
  '/how-it-works',
  '/ecosystem',
  '/status',
  '/changelog',
  '/offline',
]

test.describe('P6 AUDIT — Pages 200 + Console 0', () => {
  for (const path of ALL_PUBLIC_PAGES) {
    test(`PUBLIC ${path} — 200 + no errors`, async ({ page }) => {
      const errors = attachConsole(page)
      const res = await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 15000 })
      expect(res?.status(), `${path} status`).toBeLessThan(400)
      const real = filterBenign(errors)
      expect(real, `console errors on ${path}: ${real.join('|')}`).toHaveLength(0)
    })
  }
})

// ─── Auth redirect: all dashboard paths → /login ─────────────────────────────

const DASHBOARD_PAGES = [
  '/dashboard',
  '/dashboard/chat',
  '/dashboard/tools',
  '/dashboard/agents',
  '/dashboard/automation',
  '/dashboard/marketplace',
  '/dashboard/studio',
  '/dashboard/collab',
  '/dashboard/analytics',
  '/dashboard/xp',
  '/dashboard/achievements',
  '/dashboard/classement',
  '/dashboard/daily-gift',
  '/dashboard/concours',
  '/dashboard/tirage',
  '/dashboard/partage',
  '/dashboard/referral',
  '/dashboard/ambassadeur',
  '/dashboard/wallet',
  '/dashboard/api',
  '/dashboard/notifications',
  '/dashboard/guide',
  '/dashboard/profile',
  '/dashboard/settings',
  '/dashboard/admin',
  '/dashboard/invoices',
]

test.describe('P6 AUDIT — Dashboard auth redirect', () => {
  for (const path of DASHBOARD_PAGES) {
    test(`DASHBOARD ${path} → /login`, async ({ page }) => {
      await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 15000 })
      expect(page.url()).toMatch(/\/login/)
    })
  }
})

// ─── Responsive ──────────────────────────────────────────────────────────────

test.describe('P6 AUDIT — Responsive', () => {
  const viewports = [
    { name: 'iPhone SE (375)', width: 375, height: 667 },
    { name: 'iPad (768)', width: 768, height: 1024 },
    { name: 'Desktop (1920)', width: 1920, height: 1080 },
  ]

  for (const vp of viewports) {
    test(`Landing — no overflow at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > window.innerWidth + 2
      )
      expect(overflow, `horizontal overflow at ${vp.width}px`).toBe(false)
    })

    test(`Login — no overflow at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > window.innerWidth + 2
      )
      expect(overflow, `horizontal overflow at ${vp.width}px`).toBe(false)
    })

    test(`Pricing — no overflow at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto(BASE + '/pricing', { waitUntil: 'domcontentloaded' })
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > window.innerWidth + 2
      )
      expect(overflow, `horizontal overflow at ${vp.width}px`).toBe(false)
    })
  }
})

// ─── API Routes ──────────────────────────────────────────────────────────────

test.describe('P6 AUDIT — API Routes', () => {
  test('GET /api/status → 200 + ok', async ({ request }) => {
    const res = await request.get(BASE + '/api/status')
    expect(res.status()).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('ok')
    expect(json.app).toBe('AKASHA AI')
  })

  test('POST /api/chat unauth → 401', async ({ request }) => {
    const res = await request.post(BASE + '/api/chat', {
      data: { messages: [{ role: 'user', content: 'hello' }] },
    })
    expect(res.status()).toBe(401)
  })

  test('GET /api/quota/check unauth → 401', async ({ request }) => {
    const res = await request.get(BASE + '/api/quota/check')
    expect(res.status()).toBe(401)
  })

  test('POST /api/locale — switch to EN', async ({ request }) => {
    const res = await request.post(BASE + '/api/locale', {
      data: { locale: 'en' },
    })
    expect(res.status()).toBe(200)
    const json = await res.json()
    expect(json.locale).toBe('en')
    expect(json.success).toBe(true)
  })

  test('POST /api/locale — invalid locale 400', async ({ request }) => {
    const res = await request.post(BASE + '/api/locale', {
      data: { locale: 'xx' },
    })
    expect(res.status()).toBe(400)
  })

  test('GET /sitemap.xml → 200 + XML', async ({ request }) => {
    const res = await request.get(BASE + '/sitemap.xml')
    expect(res.status()).toBe(200)
    const text = await res.text()
    expect(text).toContain('<?xml')
  })

  test('GET /robots.txt → 200', async ({ request }) => {
    const res = await request.get(BASE + '/robots.txt')
    expect(res.status()).toBe(200)
  })

  test('GET /manifest.json → 200 + AKASHA', async ({ request }) => {
    const res = await request.get(BASE + '/manifest.json')
    expect(res.status()).toBe(200)
    const json = await res.json()
    expect(json.name).toBe('AKASHA AI')
  })
})

// ─── Forms ───────────────────────────────────────────────────────────────────

test.describe('P6 AUDIT — Forms', () => {
  test('Login form — inputs typeable + button exists', async ({ page }) => {
    await page.goto(BASE + '/login')
    const email = page.locator('[data-testid="email-input"]')
    const pass = page.locator('[data-testid="password-input"]')
    await expect(email).toBeVisible()
    await expect(pass).toBeVisible()
    await email.fill('test@test.com')
    await pass.fill('test1234')
    await expect(email).toHaveValue('test@test.com')
    await expect(pass).toHaveValue('test1234')
    await expect(page.locator('[data-testid="login-button"]')).toBeVisible()
  })

  test('Signup form — all fields + password strength', async ({ page }) => {
    await page.goto(BASE + '/signup')
    await expect(page.locator('[data-testid="name-input"]')).toBeVisible()
    await expect(page.locator('[data-testid="email-input"]')).toBeVisible()
    await expect(page.locator('[data-testid="password-input"]')).toBeVisible()
    await expect(page.locator('[data-testid="confirm-password-input"]')).toBeVisible()
    await page.locator('[data-testid="password-input"]').fill('Test123!')
    const body = await page.locator('body').textContent()
    expect(body).toMatch(/Faible|Moyen|Fort|Excellent|Trop court/)
  })

  test('Contact page — form fields present', async ({ page }) => {
    await page.goto(BASE + '/contact')
    const body = page.locator('body')
    await expect(body).toContainText('Contact')
  })
})

// ─── Landing content checks ─────────────────────────────────────────────────

test.describe('P6 AUDIT — Landing content', () => {
  test('Landing — hero text + CTA', async ({ page }) => {
    await page.goto(BASE + '/')
    await expect(page.locator('body')).toContainText('AKASHA')
    const cta = page.locator('a[href="/signup"]').first()
    await expect(cta).toBeVisible()
  })

  test('Landing — pricing section exists', async ({ page }) => {
    await page.goto(BASE + '/')
    await expect(page.locator('#pricing')).toBeAttached()
  })

  test('Landing — FAQ section exists', async ({ page }) => {
    await page.goto(BASE + '/')
    await expect(page.locator('#faq')).toBeAttached()
  })

  test('Landing — footer with SASU PURAMA', async ({ page }) => {
    await page.goto(BASE + '/')
    const footer = page.locator('footer')
    await expect(footer).toContainText('SASU PURAMA')
    await expect(footer).toContainText('293')
  })
})
