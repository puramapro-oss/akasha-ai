import { test, expect, type Browser } from '@playwright/test'

const baseUrl = process.env.CYCLES_E2E_BASE_URL

async function openLocalized(browser: Browser, locale: string, viewport?: { width: number; height: number }) {
  const context = await browser.newContext({ locale, viewport })
  const page = await context.newPage()
  const response = await page.goto(`${baseUrl}/cycles`, { waitUntil: 'domcontentloaded' })
  return { page, context, response }
}

test.describe('Cycles symboliques — expérience publique authentique', () => {
  test.skip(!baseUrl, 'Exécuter uniquement avec CYCLES_E2E_BASE_URL sur une instance locale explicitement choisie.')

  test('page publique FR, SEO, deux traditions, sources et découverte', async ({ browser }) => {
    const { page, context, response } = await openLocalized(browser, 'fr-FR')
    try {
      expect(response?.status()).toBe(200)
      await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Deux traditions')
      await expect(page.getByRole('heading', { level: 2 })).toHaveCount(3)
      await expect(page.locator('a[href="https://www.astro.com/astrology/tma_article190314_e.htm"]')).toHaveCount(1)
      await expect(page.locator('a[href="https://www.ascendedmasterencyclopedia.org/wiki/Cosmic_clock"]')).toHaveCount(1)
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://akasha.purama.dev/cycles')
      await expect(page.getByRole('link', { name: 'Ouvrir le calculateur' }).first()).toHaveAttribute('href', '/dashboard/cycles')
      expect((await page.title()).toLowerCase()).toContain('cycles')
    } finally {
      await context.close()
    }
  })

  test('traduction anglaise réellement rendue avec titres/meta', async ({ browser }) => {
    const { page, context, response } = await openLocalized(browser, 'en-US')
    try {
      expect(response?.status()).toBe(200)
      await expect(page.locator('html')).toHaveAttribute('lang', 'en')
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Two traditions')
      await expect(page.getByRole('heading', { name: 'Annual profections' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'The Cosmic Clock' })).toBeVisible()
      const title = await page.title()
      expect(title.toLowerCase()).toContain('symbolic cycles')
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /annual profections/)
    } finally {
      await context.close()
    }
  })

  test('mobile 375 px : CTA visible, aucun débordement horizontal ni données sensibles', async ({ browser }) => {
    const { page, context, response } = await openLocalized(browser, 'fr-FR', { width: 375, height: 667 })
    try {
      expect(response?.status()).toBe(200)
      await expect(page.getByRole('link', { name: 'Ouvrir le calculateur' }).first()).toBeVisible()
      const widths = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }))
      expect(widths.scroll).toBeLessThanOrEqual(widths.viewport + 1)
      const links = await page.locator('a[href]').evaluateAll((anchors) =>
        anchors.map((a) => (a as HTMLAnchorElement).href).join('|')
      )
      for (const secret of ['birthDate=', 'ascendantSign=', 'user_id=', '2002-05-10']) {
        expect(links).not.toContain(secret)
      }
    } finally {
      await context.close()
    }
  })

  test('garde d’authentification : le tableau privé reste inaccessible sans session', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'fr-FR' })
    try {
      const page = await context.newPage()
      await page.goto(`${baseUrl}/dashboard/cycles`, { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fcycles/)
      await expect(page.getByRole('heading', { level: 1 })).not.toContainText('Cycles symboliques et IAO')
    } finally {
      await context.close()
    }
  })
})
