# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: local-audit.spec.ts >> LOCAL AUDIT — Full app >> PUBLIC /politique-confidentialite — 200 + no console errors
- Location: tests/local-audit.spec.ts:45:5

# Error details

```
Error: console errors on /politique-confidentialite: Refused to apply style from 'http://localhost:3000/_next/static/chunks/2trjbt0ytugf9.css' because its MIME type ('text/plain') is not a supported stylesheet MIME type, and strict MIME checking is enabled.|Refused to execute script from 'http://localhost:3000/_next/static/chunks/310vm2bl3xxpt.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled.|Refused to execute script from 'http://localhost:3000/_next/static/chunks/2mmpezlrfmbu5.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled.|Refused to execute script from 'http://localhost:3000/_next/static/chunks/3e4keds9ktjdu.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled.|Refused to execute script from 'http://localhost:3000/_next/static/chunks/3-mzfc-j3p2r7.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled.|Refused to execute script from 'http://localhost:3000/_next/static/chunks/turbopack-22jt86khmn-9r.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled.|Refused to execute script from 'http://localhost:3000/_next/static/chunks/0h2qsuyze9ds1.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled.

expect(received).toHaveLength(expected)

Expected length: 0
Received length: 7
Received array:  ["Refused to apply style from 'http://localhost:3000/_next/static/chunks/2trjbt0ytugf9.css' because its MIME type ('text/plain') is not a supported stylesheet MIME type, and strict MIME checking is enabled.", "Refused to execute script from 'http://localhost:3000/_next/static/chunks/310vm2bl3xxpt.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled.", "Refused to execute script from 'http://localhost:3000/_next/static/chunks/2mmpezlrfmbu5.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled.", "Refused to execute script from 'http://localhost:3000/_next/static/chunks/3e4keds9ktjdu.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled.", "Refused to execute script from 'http://localhost:3000/_next/static/chunks/3-mzfc-j3p2r7.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled.", "Refused to execute script from 'http://localhost:3000/_next/static/chunks/turbopack-22jt86khmn-9r.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled.", "Refused to execute script from 'http://localhost:3000/_next/static/chunks/0h2qsuyze9ds1.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled."]
```

# Page snapshot

```yaml
- main [ref=e2]:
  - link "SRISHTI" [ref=e3] [cursor=pointer]:
    - /url: /
    - img [ref=e5]
    - text: SRISHTI
  - generic [ref=e8]:
    - heading "Content de te revoir" [level=1] [ref=e9]
    - paragraph [ref=e10]: Connecte-toi pour retrouver tes projets.
  - generic [ref=e11]:
    - text: Pas encore de compte ?
    - link "Créer un compte" [ref=e12] [cursor=pointer]:
      - /url: /signup
```

# Test source

```ts
  1   | import { test, expect, type Page } from '@playwright/test'
  2   | 
  3   | const BASE = 'http://localhost:3000'
  4   | 
  5   | const PUBLIC_PAGES = [
  6   |   '/',
  7   |   '/login',
  8   |   '/signup',
  9   |   '/forgot-password',
  10  |   '/pricing',
  11  |   '/mentions-legales',
  12  |   '/cgu',
  13  |   '/cgv',
  14  |   '/politique-confidentialite',
  15  |   '/cookies',
  16  |   '/onboarding',
  17  | ]
  18  | 
  19  | const DASHBOARD_PAGES = [
  20  |   '/dashboard',
  21  |   '/dashboard/chat',
  22  |   '/dashboard/agents',
  23  |   '/dashboard/automation',
  24  |   '/dashboard/marketplace',
  25  |   '/dashboard/studio',
  26  |   '/dashboard/tools',
  27  |   '/dashboard/xp',
  28  |   '/dashboard/api',
  29  |   '/dashboard/analytics',
  30  |   '/dashboard/collab',
  31  |   '/dashboard/settings',
  32  | ]
  33  | 
  34  | function attachConsole(page: Page) {
  35  |   const errors: string[] = []
  36  |   page.on('console', msg => {
  37  |     if (msg.type() === 'error') errors.push(msg.text())
  38  |   })
  39  |   page.on('pageerror', err => errors.push(err.message))
  40  |   return errors
  41  | }
  42  | 
  43  | test.describe('LOCAL AUDIT — Full app', () => {
  44  |   for (const path of PUBLIC_PAGES) {
  45  |     test(`PUBLIC ${path} — 200 + no console errors`, async ({ page }) => {
  46  |       const errors = attachConsole(page)
  47  |       const res = await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
  48  |       expect(res?.status(), `status for ${path}`).toBeLessThan(400)
  49  |       // filter benign warnings
  50  |       const real = errors.filter(e =>
  51  |         !e.includes('Failed to load resource') &&
  52  |         !e.includes('favicon') &&
  53  |         !e.includes('manifest')
  54  |       )
> 55  |       expect(real, `console errors on ${path}: ${real.join('|')}`).toHaveLength(0)
      |                                                                    ^ Error: console errors on /politique-confidentialite: Refused to apply style from 'http://localhost:3000/_next/static/chunks/2trjbt0ytugf9.css' because its MIME type ('text/plain') is not a supported stylesheet MIME type, and strict MIME checking is enabled.|Refused to execute script from 'http://localhost:3000/_next/static/chunks/310vm2bl3xxpt.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled.|Refused to execute script from 'http://localhost:3000/_next/static/chunks/2mmpezlrfmbu5.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled.|Refused to execute script from 'http://localhost:3000/_next/static/chunks/3e4keds9ktjdu.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled.|Refused to execute script from 'http://localhost:3000/_next/static/chunks/3-mzfc-j3p2r7.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled.|Refused to execute script from 'http://localhost:3000/_next/static/chunks/turbopack-22jt86khmn-9r.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled.|Refused to execute script from 'http://localhost:3000/_next/static/chunks/0h2qsuyze9ds1.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled.
  56  |     })
  57  |   }
  58  | 
  59  |   for (const path of DASHBOARD_PAGES) {
  60  |     test(`DASHBOARD ${path} — redirects unauth`, async ({ page }) => {
  61  |       const res = await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
  62  |       // either redirected to /login or status 200 with login page
  63  |       expect(res?.status()).toBeLessThan(500)
  64  |       const url = page.url()
  65  |       expect(url, `${path} should redirect to login`).toMatch(/\/login/)
  66  |     })
  67  |   }
  68  | 
  69  |   test('Responsive 375px — no horizontal overflow on landing', async ({ page }) => {
  70  |     await page.setViewportSize({ width: 375, height: 667 })
  71  |     await page.goto(BASE + '/')
  72  |     const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  73  |     expect(overflow).toBe(false)
  74  |   })
  75  | 
  76  |   test('Responsive 1920px — landing renders fully', async ({ page }) => {
  77  |     await page.setViewportSize({ width: 1920, height: 1080 })
  78  |     await page.goto(BASE + '/')
  79  |     await expect(page.locator('body')).toContainText('AKASHA AI')
  80  |   })
  81  | 
  82  |   test('All footer legal links navigate to 200 pages', async ({ page }) => {
  83  |     await page.goto(BASE + '/')
  84  |     const links = ['/mentions-legales', '/cgu', '/cgv', '/politique-confidentialite', '/cookies']
  85  |     for (const href of links) {
  86  |       const link = page.locator(`footer a[href="${href}"]`).first()
  87  |       await expect(link).toBeVisible()
  88  |     }
  89  |   })
  90  | 
  91  |   test('API /api/status returns ok', async ({ request }) => {
  92  |     const res = await request.get(BASE + '/api/status')
  93  |     expect(res.status()).toBe(200)
  94  |     const json = await res.json()
  95  |     expect(json.status).toBe('ok')
  96  |   })
  97  | 
  98  |   test('API /api/chat unauth returns 401', async ({ request }) => {
  99  |     const res = await request.post(BASE + '/api/chat', { data: { messages: [{ role: 'user', content: 'hi' }] } })
  100 |     expect(res.status()).toBe(401)
  101 |   })
  102 | 
  103 |   test('API /api/quota/check unauth returns 401', async ({ request }) => {
  104 |     const res = await request.get(BASE + '/api/quota/check')
  105 |     expect(res.status()).toBe(401)
  106 |   })
  107 | 
  108 |   test('Sitemap + robots + manifest', async ({ request }) => {
  109 |     const sm = await request.get(BASE + '/sitemap.xml')
  110 |     expect(sm.status()).toBe(200)
  111 |     const r = await request.get(BASE + '/robots.txt')
  112 |     expect(r.status()).toBe(200)
  113 |     const m = await request.get(BASE + '/manifest.json')
  114 |     expect(m.status()).toBe(200)
  115 |   })
  116 | })
  117 | 
```