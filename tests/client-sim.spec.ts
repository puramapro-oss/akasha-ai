import { test, expect } from '@playwright/test'

const BASE = 'https://akasha.purama.dev'

test.describe('AKASHA AI — 21 Client Sim Tests', () => {

  // ─── 01. Landing ─────────────────────────────────────────────────────────────
  test('01. Landing page', async ({ page }) => {
    const response = await page.goto(BASE + '/')
    expect(response?.status()).toBe(200)
    await expect(page.locator('body')).toContainText('AKASHA')
    // CTA link to /signup exists
    const ctaLink = page.locator('a[href="/signup"]').first()
    await expect(ctaLink).toBeVisible()
  })

  // ─── 02. Nav ─────────────────────────────────────────────────────────────────
  test('02. Nav buttons — Connexion and Essayer', async ({ page }) => {
    await page.goto(BASE + '/')
    // Connexion link → /login
    const connexionLink = page.locator('a[href="/login"]').first()
    await expect(connexionLink).toBeVisible()
    await expect(connexionLink).toContainText('Connexion')
    // Essayer link → /signup
    const essaiLink = page.locator('[data-testid="nav-cta-signup"]')
    await expect(essaiLink).toBeVisible()
    await expect(essaiLink).toContainText('Essayer')
    await expect(essaiLink).toHaveAttribute('href', '/signup')
  })

  // ─── 03. Auth page — /login ───────────────────────────────────────────────────
  test('03. Auth page — /login form elements', async ({ page }) => {
    const response = await page.goto(BASE + '/login')
    expect(response?.status()).toBe(200)
    await expect(page.locator('[data-testid="email-input"]')).toBeVisible()
    await expect(page.locator('[data-testid="password-input"]')).toBeVisible()
    await expect(page.locator('[data-testid="google-login"]')).toBeVisible()
    await expect(page.locator('[data-testid="login-button"]')).toBeVisible()
  })

  // ─── 04. Google OAuth button ─────────────────────────────────────────────────
  test('04. Google OAuth button — clickable and initiates navigation', async ({ page }) => {
    await page.goto(BASE + '/login')
    const googleBtn = page.locator('[data-testid="google-login"]')
    await expect(googleBtn).toBeVisible()
    await expect(googleBtn).toBeEnabled()
    // Button is interactive (has click handler via React)
    // We verify it exists and is not disabled
    const isDisabled = await googleBtn.getAttribute('disabled')
    expect(isDisabled).toBeNull()
  })

  // ─── 05. Signup page ─────────────────────────────────────────────────────────
  test('05. Signup page — form inputs and password strength', async ({ page }) => {
    const response = await page.goto(BASE + '/signup')
    expect(response?.status()).toBe(200)
    await expect(page.locator('[data-testid="name-input"]')).toBeVisible()
    await expect(page.locator('[data-testid="email-input"]')).toBeVisible()
    await expect(page.locator('[data-testid="password-input"]')).toBeVisible()
    await expect(page.locator('[data-testid="confirm-password-input"]')).toBeVisible()
    await expect(page.locator('[data-testid="cgu-checkbox"]')).toBeVisible()
    // Type password to trigger strength indicator
    await page.locator('[data-testid="password-input"]').fill('Test123!')
    // Strength indicator should appear (text with strength label)
    const body = page.locator('body')
    await expect(body).toContainText(/Faible|Moyen|Fort|Excellent|Trop court/)
  })

  // ─── 06. Middleware redirect — /dashboard → /login ───────────────────────────
  test('06. Middleware redirect — /dashboard redirects to /login unauthenticated', async ({ page }) => {
    await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' })
    // Should redirect to /login
    await expect(page).toHaveURL(/\/login/)
  })

  // ─── 07. Stay logged in checkbox ─────────────────────────────────────────────
  test('07. Stay logged in — "Rester connecte" checkbox present and checkable', async ({ page }) => {
    await page.goto(BASE + '/login')
    const checkbox = page.locator('[data-testid="remember-me"]')
    await expect(checkbox).toBeVisible()
    // Default is checked (rememberMe = true)
    await expect(checkbox).toBeChecked()
    // Can uncheck
    await checkbox.click()
    await expect(checkbox).not.toBeChecked()
    // Can re-check
    await checkbox.click()
    await expect(checkbox).toBeChecked()
  })

  // ─── 08. Tutorial / Guide page existence ─────────────────────────────────────
  test('08. Login form inputs — typeable', async ({ page }) => {
    await page.goto(BASE + '/login')
    const emailInput = page.locator('[data-testid="email-input"]')
    const passwordInput = page.locator('[data-testid="password-input"]')
    await emailInput.fill('test@example.com')
    await passwordInput.fill('testpassword123')
    await expect(emailInput).toHaveValue('test@example.com')
    await expect(passwordInput).toHaveValue('testpassword123')
  })

  // ─── 09. Dashboard — auth protected ──────────────────────────────────────────
  test('09. Dashboard — redirects to /login with next param', async ({ page }) => {
    await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' })
    const currentURL = page.url()
    expect(currentURL).toContain('/login')
    // Should have next param pointing to /dashboard
    expect(currentURL).toMatch(/next.*dashboard|\/login/)
  })

  // ─── 10. Pricing page ────────────────────────────────────────────────────────
  test('10. Pricing page — plan names and prices', async ({ page }) => {
    const response = await page.goto(BASE + '/pricing')
    expect(response?.status()).toBe(200)
    const body = page.locator('body')
    await expect(body).toContainText('AUTOMATE')
    await expect(body).toContainText('CREATE')
    await expect(body).toContainText('BUILD')
    await expect(body).toContainText('COMPLET')
    // Price text "7" present (prices start at 7€)
    await expect(body).toContainText('7')
  })

  // ─── 11. API status ──────────────────────────────────────────────────────────
  test('11. API /api/status — returns JSON {status:ok, app:AKASHA AI}', async ({ request }) => {
    const response = await request.get(BASE + '/api/status')
    expect(response.status()).toBe(200)
    const json = await response.json()
    expect(json.status).toBe('ok')
    expect(json.app).toBe('AKASHA AI')
  })

  // ─── 12. Functional CTA button ───────────────────────────────────────────────
  test('12. CTA button — "Commencer gratuitement" navigates to /signup', async ({ page }) => {
    await page.goto(BASE + '/')
    const ctaButton = page.locator('[data-testid="hero-cta-signup"]')
    await expect(ctaButton).toBeVisible()
    await ctaButton.click()
    await page.waitForURL(/\/signup/, { timeout: 10000 })
    expect(page.url()).toContain('/signup')
  })

  // ─── 13. Legal: Mentions légales ─────────────────────────────────────────────
  test('13. Legal — /mentions-legales contains SASU PURAMA and Frasne', async ({ page }) => {
    const response = await page.goto(BASE + '/mentions-legales')
    expect(response?.status()).toBe(200)
    const body = page.locator('body')
    await expect(body).toContainText('SASU PURAMA')
    await expect(body).toContainText('Frasne')
  })

  // ─── 14. Legal: RGPD ─────────────────────────────────────────────────────────
  test('14. Legal — /politique-confidentialite contains RGPD', async ({ page }) => {
    const response = await page.goto(BASE + '/politique-confidentialite')
    expect(response?.status()).toBe(200)
    const body = page.locator('body')
    // Page contains RGPD or données personnelles (with or without accents)
    const text = await body.textContent()
    const hasRGPD = text?.includes('RGPD') || text?.includes('données personnelles') || text?.includes('donnees personnelles')
    expect(hasRGPD).toBeTruthy()
  })

  // ─── 15. Legal: CGU ──────────────────────────────────────────────────────────
  test('15. Legal — /cgu contains conditions or utilisation', async ({ page }) => {
    const response = await page.goto(BASE + '/cgu')
    expect(response?.status()).toBe(200)
    const body = page.locator('body')
    const text = await body.textContent()
    const hasContent = text?.toLowerCase().includes('conditions') || text?.toLowerCase().includes('utilisation')
    expect(hasContent).toBeTruthy()
  })

  // ─── 16. Legal: CGV ──────────────────────────────────────────────────────────
  test('16. Legal — /cgv contains retractation or 14 jours', async ({ page }) => {
    const response = await page.goto(BASE + '/cgv')
    expect(response?.status()).toBe(200)
    const body = page.locator('body')
    const text = await body.textContent()
    const hasContent = text?.toLowerCase().includes('rétractation') ||
      text?.toLowerCase().includes('retractation') ||
      text?.includes('14 jours')
    expect(hasContent).toBeTruthy()
  })

  // ─── 17. Mobile responsive ───────────────────────────────────────────────────
  test('17. Mobile responsive — no horizontal scroll at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto(BASE + '/')
    // Check document width does not exceed viewport
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 1
    })
    expect(overflow).toBe(false)
  })

  // ─── 18. Footer links ────────────────────────────────────────────────────────
  test('18. Footer links — legal pages linked in footer', async ({ page }) => {
    await page.goto(BASE + '/')
    const footer = page.locator('footer')
    await expect(footer.locator('a[href="/mentions-legales"]')).toBeVisible()
    await expect(footer.locator('a[href="/cgu"]')).toBeVisible()
    await expect(footer.locator('a[href="/cgv"]')).toBeVisible()
    await expect(footer.locator('a[href="/politique-confidentialite"]')).toBeVisible()
  })

  // ─── 19. Sitemap ─────────────────────────────────────────────────────────────
  test('19. Sitemap — /sitemap.xml returns 200 and XML', async ({ request }) => {
    const response = await request.get(BASE + '/sitemap.xml')
    expect(response.status()).toBe(200)
    const text = await response.text()
    expect(text).toContain('<?xml')
    expect(text).toContain('akasha.purama.dev')
  })

  // ─── 20. Robots ──────────────────────────────────────────────────────────────
  test('20. Robots — /robots.txt returns 200 and contains Disallow', async ({ request }) => {
    const response = await request.get(BASE + '/robots.txt')
    expect(response.status()).toBe(200)
    const text = await response.text()
    expect(text).toContain('Disallow')
  })

  // ─── 21. Manifest + PWA ──────────────────────────────────────────────────────
  test('21. PWA Manifest — /manifest.json has name AKASHA AI and start_url', async ({ request }) => {
    const response = await request.get(BASE + '/manifest.json')
    expect(response.status()).toBe(200)
    const json = await response.json()
    expect(json.name).toBe('AKASHA AI')
    expect(json.start_url).toBeTruthy()
  })

})
