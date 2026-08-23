# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: client-sim.spec.ts >> AKASHA AI — 21 Client Sim Tests >> 07. Stay logged in — "Rester connecte" checkbox present and checkable
- Location: tests/client-sim.spec.ts:77:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('[data-testid="remember-me"]')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('[data-testid="remember-me"]')

```

```yaml
- main:
  - paragraph:
    - strong: This Deployment
    - text: is paused by the owner.
  - paragraph:
    - strong: Your connection
    - text: is working correctly.
  - paragraph:
    - strong: Vercel
    - text: is working correctly.
  - paragraph:
    - strong: "503"
    - text: ": SERVICE_UNAVAILABLE Code:"
    - code: "`DEPLOYMENT_PAUSED`"
    - text: "ID:"
    - code: "`cdg1::dvrn8-1787510045248-1e1518b4cb68`"
  - paragraph
  - list:
    - listitem: – If you are a visitor, contact the website owner or try again later.
    - listitem:
      - text: – If you are the owner, please
      - link "read this documentation section":
        - /url: https://vercel.com/docs/accounts/spend-management#pausing-projects
      - text: or
      - link "resume service":
        - /url: https://vercel.com/docs/projects/overview#resuming-a-project
      - text: .
  - paragraph
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test'
  2   | 
  3   | const BASE = 'https://akasha.purama.dev'
  4   | 
  5   | test.describe('AKASHA AI — 21 Client Sim Tests', () => {
  6   | 
  7   |   // ─── 01. Landing ─────────────────────────────────────────────────────────────
  8   |   test('01. Landing page', async ({ page }) => {
  9   |     const response = await page.goto(BASE + '/')
  10  |     expect(response?.status()).toBe(200)
  11  |     await expect(page.locator('body')).toContainText('AKASHA')
  12  |     // CTA link to /signup exists
  13  |     const ctaLink = page.locator('a[href="/signup"]').first()
  14  |     await expect(ctaLink).toBeVisible()
  15  |   })
  16  | 
  17  |   // ─── 02. Nav ─────────────────────────────────────────────────────────────────
  18  |   test('02. Nav buttons — Connexion and Essayer', async ({ page }) => {
  19  |     await page.goto(BASE + '/')
  20  |     // Connexion link → /login
  21  |     const connexionLink = page.locator('a[href="/login"]').first()
  22  |     await expect(connexionLink).toBeVisible()
  23  |     await expect(connexionLink).toContainText('Connexion')
  24  |     // Essayer link → /signup
  25  |     const essaiLink = page.locator('[data-testid="nav-cta-signup"]')
  26  |     await expect(essaiLink).toBeVisible()
  27  |     await expect(essaiLink).toContainText('Essayer')
  28  |     await expect(essaiLink).toHaveAttribute('href', '/signup')
  29  |   })
  30  | 
  31  |   // ─── 03. Auth page — /login ───────────────────────────────────────────────────
  32  |   test('03. Auth page — /login form elements', async ({ page }) => {
  33  |     const response = await page.goto(BASE + '/login')
  34  |     expect(response?.status()).toBe(200)
  35  |     await expect(page.locator('[data-testid="email-input"]')).toBeVisible()
  36  |     await expect(page.locator('[data-testid="password-input"]')).toBeVisible()
  37  |     await expect(page.locator('[data-testid="google-login"]')).toBeVisible()
  38  |     await expect(page.locator('[data-testid="login-button"]')).toBeVisible()
  39  |   })
  40  | 
  41  |   // ─── 04. Google OAuth button ─────────────────────────────────────────────────
  42  |   test('04. Google OAuth button — clickable and initiates navigation', async ({ page }) => {
  43  |     await page.goto(BASE + '/login')
  44  |     const googleBtn = page.locator('[data-testid="google-login"]')
  45  |     await expect(googleBtn).toBeVisible()
  46  |     await expect(googleBtn).toBeEnabled()
  47  |     // Button is interactive (has click handler via React)
  48  |     // We verify it exists and is not disabled
  49  |     const isDisabled = await googleBtn.getAttribute('disabled')
  50  |     expect(isDisabled).toBeNull()
  51  |   })
  52  | 
  53  |   // ─── 05. Signup page ─────────────────────────────────────────────────────────
  54  |   test('05. Signup page — form inputs and password strength', async ({ page }) => {
  55  |     const response = await page.goto(BASE + '/signup')
  56  |     expect(response?.status()).toBe(200)
  57  |     await expect(page.locator('[data-testid="name-input"]')).toBeVisible()
  58  |     await expect(page.locator('[data-testid="email-input"]')).toBeVisible()
  59  |     await expect(page.locator('[data-testid="password-input"]')).toBeVisible()
  60  |     await expect(page.locator('[data-testid="confirm-password-input"]')).toBeVisible()
  61  |     await expect(page.locator('[data-testid="cgu-checkbox"]')).toBeVisible()
  62  |     // Type password to trigger strength indicator
  63  |     await page.locator('[data-testid="password-input"]').fill('Test123!')
  64  |     // Strength indicator should appear (text with strength label)
  65  |     const body = page.locator('body')
  66  |     await expect(body).toContainText(/Faible|Moyen|Fort|Excellent|Trop court/)
  67  |   })
  68  | 
  69  |   // ─── 06. Middleware redirect — /dashboard → /login ───────────────────────────
  70  |   test('06. Middleware redirect — /dashboard redirects to /login unauthenticated', async ({ page }) => {
  71  |     await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' })
  72  |     // Should redirect to /login
  73  |     await expect(page).toHaveURL(/\/login/)
  74  |   })
  75  | 
  76  |   // ─── 07. Stay logged in checkbox ─────────────────────────────────────────────
  77  |   test('07. Stay logged in — "Rester connecte" checkbox present and checkable', async ({ page }) => {
  78  |     await page.goto(BASE + '/login')
  79  |     const checkbox = page.locator('[data-testid="remember-me"]')
> 80  |     await expect(checkbox).toBeVisible()
      |                            ^ Error: expect(locator).toBeVisible() failed
  81  |     // Default is checked (rememberMe = true)
  82  |     await expect(checkbox).toBeChecked()
  83  |     // Can uncheck
  84  |     await checkbox.click()
  85  |     await expect(checkbox).not.toBeChecked()
  86  |     // Can re-check
  87  |     await checkbox.click()
  88  |     await expect(checkbox).toBeChecked()
  89  |   })
  90  | 
  91  |   // ─── 08. Tutorial / Guide page existence ─────────────────────────────────────
  92  |   test('08. Login form inputs — typeable', async ({ page }) => {
  93  |     await page.goto(BASE + '/login')
  94  |     const emailInput = page.locator('[data-testid="email-input"]')
  95  |     const passwordInput = page.locator('[data-testid="password-input"]')
  96  |     await emailInput.fill('test@example.com')
  97  |     await passwordInput.fill('testpassword123')
  98  |     await expect(emailInput).toHaveValue('test@example.com')
  99  |     await expect(passwordInput).toHaveValue('testpassword123')
  100 |   })
  101 | 
  102 |   // ─── 09. Dashboard — auth protected ──────────────────────────────────────────
  103 |   test('09. Dashboard — redirects to /login with next param', async ({ page }) => {
  104 |     await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' })
  105 |     const currentURL = page.url()
  106 |     expect(currentURL).toContain('/login')
  107 |     // Should have next param pointing to /dashboard
  108 |     expect(currentURL).toMatch(/next.*dashboard|\/login/)
  109 |   })
  110 | 
  111 |   // ─── 10. Pricing page ────────────────────────────────────────────────────────
  112 |   test('10. Pricing page — plan names and prices', async ({ page }) => {
  113 |     const response = await page.goto(BASE + '/pricing')
  114 |     expect(response?.status()).toBe(200)
  115 |     const body = page.locator('body')
  116 |     await expect(body).toContainText('AUTOMATE')
  117 |     await expect(body).toContainText('CREATE')
  118 |     await expect(body).toContainText('BUILD')
  119 |     await expect(body).toContainText('COMPLET')
  120 |     // Price text "7" present (prices start at 7€)
  121 |     await expect(body).toContainText('7')
  122 |   })
  123 | 
  124 |   // ─── 11. API status ──────────────────────────────────────────────────────────
  125 |   test('11. API /api/status — returns JSON {status:ok, app:AKASHA AI}', async ({ request }) => {
  126 |     const response = await request.get(BASE + '/api/status')
  127 |     expect(response.status()).toBe(200)
  128 |     const json = await response.json()
  129 |     expect(json.status).toBe('ok')
  130 |     expect(json.app).toBe('AKASHA AI')
  131 |   })
  132 | 
  133 |   // ─── 12. Functional CTA button ───────────────────────────────────────────────
  134 |   test('12. CTA button — "Commencer gratuitement" navigates to /signup', async ({ page }) => {
  135 |     await page.goto(BASE + '/')
  136 |     const ctaButton = page.locator('[data-testid="hero-cta-signup"]')
  137 |     await expect(ctaButton).toBeVisible()
  138 |     await ctaButton.click()
  139 |     await page.waitForURL(/\/signup/, { timeout: 10000 })
  140 |     expect(page.url()).toContain('/signup')
  141 |   })
  142 | 
  143 |   // ─── 13. Legal: Mentions légales ─────────────────────────────────────────────
  144 |   test('13. Legal — /mentions-legales contains SASU PURAMA and Frasne', async ({ page }) => {
  145 |     const response = await page.goto(BASE + '/mentions-legales')
  146 |     expect(response?.status()).toBe(200)
  147 |     const body = page.locator('body')
  148 |     await expect(body).toContainText('SASU PURAMA')
  149 |     await expect(body).toContainText('Frasne')
  150 |   })
  151 | 
  152 |   // ─── 14. Legal: RGPD ─────────────────────────────────────────────────────────
  153 |   test('14. Legal — /politique-confidentialite contains RGPD', async ({ page }) => {
  154 |     const response = await page.goto(BASE + '/politique-confidentialite')
  155 |     expect(response?.status()).toBe(200)
  156 |     const body = page.locator('body')
  157 |     // Page contains RGPD or données personnelles (with or without accents)
  158 |     const text = await body.textContent()
  159 |     const hasRGPD = text?.includes('RGPD') || text?.includes('données personnelles') || text?.includes('donnees personnelles')
  160 |     expect(hasRGPD).toBeTruthy()
  161 |   })
  162 | 
  163 |   // ─── 15. Legal: CGU ──────────────────────────────────────────────────────────
  164 |   test('15. Legal — /cgu contains conditions or utilisation', async ({ page }) => {
  165 |     const response = await page.goto(BASE + '/cgu')
  166 |     expect(response?.status()).toBe(200)
  167 |     const body = page.locator('body')
  168 |     const text = await body.textContent()
  169 |     const hasContent = text?.toLowerCase().includes('conditions') || text?.toLowerCase().includes('utilisation')
  170 |     expect(hasContent).toBeTruthy()
  171 |   })
  172 | 
  173 |   // ─── 16. Legal: CGV ──────────────────────────────────────────────────────────
  174 |   test('16. Legal — /cgv contains retractation or 14 jours', async ({ page }) => {
  175 |     const response = await page.goto(BASE + '/cgv')
  176 |     expect(response?.status()).toBe(200)
  177 |     const body = page.locator('body')
  178 |     const text = await body.textContent()
  179 |     const hasContent = text?.toLowerCase().includes('rétractation') ||
  180 |       text?.toLowerCase().includes('retractation') ||
```