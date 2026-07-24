import { test, expect } from '@playwright/test'

const BASE = 'https://akasha.purama.dev'
const VIEWPORTS = [
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'laptop-1024', width: 1024, height: 768 },
  { name: 'desktop-1440', width: 1440, height: 900 },
]

for (const vp of VIEWPORTS) {
  test(`PROD landing ${vp.name} — 200 + no overflow + screenshot`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await ctx.newPage()
    const res = await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 })
    expect(res?.status()).toBeLessThan(400)
    const ow = await page.evaluate(() => ({
      bodyW: document.body.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }))
    expect(ow.bodyW).toBeLessThanOrEqual(ow.clientW + 1)
    await expect(page.getByTestId('hero-cta-signup').first()).toBeVisible()
    await page.screenshot({ path: `test-results/prod-${vp.name}.png` })
    await ctx.close()
  })
}
