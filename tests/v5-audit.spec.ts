import { test, expect } from '@playwright/test'

const BASE = 'https://akasha.purama.dev'

test.describe('Phase D — Audit V5 complet', () => {
  // ===== PUBLIC PAGES =====
  const publicPages = [
    '/', '/pricing', '/financer', '/aide', '/contact',
    '/login', '/signup', '/mentions-legales', '/politique-confidentialite',
    '/cgv', '/cgu', '/cookies', '/how-it-works', '/ecosystem',
    '/status', '/changelog', '/offline',
  ]

  for (const path of publicPages) {
    test(`Public page ${path} → 200`, async ({ request }) => {
      const res = await request.get(`${BASE}${path}`)
      expect(res.status()).toBe(200)
    })
  }

  // ===== API ROUTES =====
  test('API /api/status → 200 JSON', async ({ request }) => {
    const res = await request.get(`${BASE}/api/status`)
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.status).toBe('ok')
    expect(data.app).toBe('AKASHA AI')
  })

  test('API /api/financer/aides → 45 aides', async ({ request }) => {
    const res = await request.get(`${BASE}/api/financer/aides`)
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.aides.length).toBe(45)
    expect(data.aides[0]).toHaveProperty('nom')
    expect(data.aides[0]).toHaveProperty('montant_max')
    expect(data.aides[0]).toHaveProperty('type_aide')
  })

  test('API /api/financer/dossier → Zod validation', async ({ request }) => {
    const res = await request.post(`${BASE}/api/financer/dossier`, {
      data: { profil: 'invalid' },
    })
    expect(res.status()).toBe(400)
  })

  test('API /api/gratitude → 401 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/gratitude`)
    expect(res.status()).toBe(401)
  })

  test('API /api/points/balance → 401 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/points/balance`)
    expect(res.status()).toBe(401)
  })

  test('API /api/points/redeem → 401 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/points/redeem`, {
      data: { item_id: 'test', cost: 100 },
    })
    expect(res.status()).toBe(401)
  })

  // ===== DASHBOARD AUTH REDIRECTS =====
  const dashPages = [
    '/dashboard', '/dashboard/chat', '/dashboard/breathe',
    '/dashboard/gratitude', '/dashboard/boutique', '/dashboard/wallet',
    '/dashboard/referral', '/dashboard/settings',
  ]

  for (const path of dashPages) {
    test(`Dashboard ${path} → redirect to login`, async ({ request }) => {
      const res = await request.get(`${BASE}${path}`, { maxRedirects: 0 })
      expect(res.status()).toBe(307)
      expect(res.headers()['location']).toContain('/login')
    })
  }

  // ===== /FINANCER WIZARD CONTENT =====
  test('/financer — wizard step 1 content', async ({ page }) => {
    await page.goto(`${BASE}/financer`)
    await expect(page.getByText('Quel est ton profil')).toBeVisible()
    await expect(page.getByTestId('profil-particulier')).toBeVisible()
    await expect(page.getByTestId('profil-entreprise')).toBeVisible()
    await expect(page.getByTestId('profil-association')).toBeVisible()
    await expect(page.getByTestId('profil-etudiant')).toBeVisible()
    await expect(page.getByText('45 aides')).toBeVisible()
  })

  test('/financer — wizard step 1 → step 2', async ({ page }) => {
    await page.goto(`${BASE}/financer`)
    await page.getByTestId('profil-particulier').click()
    await page.getByTestId('situation-salarie').click()
    await page.getByTestId('btn-step1-next').click()
    // Step 2 should show matched aides or the generate button
    await expect(page.getByTestId('btn-step2-back').or(page.getByText('Montant cumulable'))).toBeVisible({ timeout: 10000 })
  })

  // ===== /PRICING BANNER =====
  test('/pricing — green financer banner present', async ({ page }) => {
    await page.goto(`${BASE}/pricing`)
    await expect(page.getByTestId('financer-banner')).toBeVisible()
    await expect(page.getByText('ne paient rien')).toBeVisible()
  })

  // ===== RESPONSIVE CHECKS =====
  for (const vp of [{ w: 375, h: 812, name: 'mobile' }, { w: 768, h: 1024, name: 'tablet' }, { w: 1440, h: 900, name: 'desktop' }]) {
    test(`Responsive ${vp.name} (${vp.w}px) — /financer no overflow`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h })
      await page.goto(`${BASE}/financer`)
      await page.waitForLoadState('networkidle')
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
      expect(bodyWidth).toBeLessThanOrEqual(vp.w + 5) // 5px tolerance
    })

    test(`Responsive ${vp.name} (${vp.w}px) — / no overflow`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h })
      await page.goto(`${BASE}/`)
      await page.waitForLoadState('networkidle')
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
      expect(bodyWidth).toBeLessThanOrEqual(vp.w + 5)
    })

    test(`Responsive ${vp.name} (${vp.w}px) — /pricing no overflow`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h })
      await page.goto(`${BASE}/pricing`)
      await page.waitForLoadState('networkidle')
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
      expect(bodyWidth).toBeLessThanOrEqual(vp.w + 5)
    })
  }

  // ===== LOGIN CONTENT =====
  test('/login — email + Google OAuth buttons', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.getByText(/Google/i)).toBeVisible()
  })

  // ===== LEGAL PAGES CONTENT =====
  test('/mentions-legales — SASU PURAMA content', async ({ page }) => {
    await page.goto(`${BASE}/mentions-legales`)
    await expect(page.getByText('SASU PURAMA').first()).toBeVisible()
    await expect(page.getByText('293 B').first()).toBeVisible()
  })

  // ===== SITEMAP =====
  test('/sitemap.xml → valid XML', async ({ request }) => {
    const res = await request.get(`${BASE}/sitemap.xml`)
    expect(res.status()).toBe(200)
    const text = await res.text()
    expect(text).toContain('<urlset')
    expect(text).toContain('akasha.purama.dev')
  })
})
