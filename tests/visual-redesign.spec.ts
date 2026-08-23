import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3000'

const VIEWPORTS = [
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'laptop-1024', width: 1024, height: 768 },
  { name: 'desktop-1440', width: 1440, height: 900 },
]

test.describe('AKASHA — visual redesign responsive audit', () => {
  for (const vp of VIEWPORTS) {
    test(`landing page ${vp.name} loads + no horizontal overflow + no console errors`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
      const page = await ctx.newPage()

      const errors: string[] = []
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text())
      })
      page.on('pageerror', (e) => errors.push(e.message))

      const res = await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 20000 })
      expect(res?.status()).toBeLessThan(400)

      // Check no horizontal overflow on body
      const bodyOverflow = await page.evaluate(() => {
        const body = document.body
        const html = document.documentElement
        return {
          bodyW: body.scrollWidth,
          htmlW: html.scrollWidth,
          clientW: html.clientWidth,
        }
      })
      expect(bodyOverflow.bodyW, `body overflow on ${vp.name}`).toBeLessThanOrEqual(bodyOverflow.clientW + 1)

      // CTA visible
      await expect(page.getByTestId('hero-cta-signup').first()).toBeVisible()

      // Filter benign errors
      const real = errors.filter(
        (e) =>
          !e.includes('Failed to load resource') &&
          !e.includes('favicon') &&
          !e.includes('manifest') &&
          !e.includes('hydrat') &&
          !e.includes('Warning:') &&
          !e.includes('Supabase') &&
          !e.includes('ERR_') &&
          !e.includes('net::') &&
          !e.includes('cookie')
      )
      expect(real, `console errors on ${vp.name}: ${real.join(' | ')}`).toHaveLength(0)

      // Screenshot
      await page.screenshot({ path: `test-results/landing-${vp.name}.png`, fullPage: false })

      await ctx.close()
    })
  }

  test('login page mobile renders', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } })
    const page = await ctx.newPage()
    const res = await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
    expect(res?.status()).toBeLessThan(400)
    await page.screenshot({ path: 'test-results/login-mobile-375.png' })
    await ctx.close()
  })

  test('pricing page renders all viewports', async ({ browser }) => {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
      const page = await ctx.newPage()
      const res = await page.goto(BASE + '/pricing', { waitUntil: 'domcontentloaded' })
      expect(res?.status()).toBeLessThan(400)
      await page.screenshot({ path: `test-results/pricing-${vp.name}.png` })
      await ctx.close()
    }
  })
})
