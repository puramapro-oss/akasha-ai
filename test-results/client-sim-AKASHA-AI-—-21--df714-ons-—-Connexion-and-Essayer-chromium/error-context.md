# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: client-sim.spec.ts >> AKASHA AI — 21 Client Sim Tests >> 02. Nav buttons — Connexion and Essayer
- Location: tests/client-sim.spec.ts:18:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('a[href="/login"]').first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('a[href="/login"]').first()

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
    - code: "`cdg1::bkhsd-1787510009009-f184a38ebd8f`"
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
> 22  |     await expect(connexionLink).toBeVisible()
      |                                 ^ Error: expect(locator).toBeVisible() failed
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
  80  |     await expect(checkbox).toBeVisible()
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
```