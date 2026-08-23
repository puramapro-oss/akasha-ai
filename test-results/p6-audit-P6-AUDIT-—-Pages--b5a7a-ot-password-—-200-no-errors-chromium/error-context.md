# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: p6-audit.spec.ts >> P6 AUDIT — Pages 200 + Console 0 >> PUBLIC /forgot-password — 200 + no errors
- Location: tests/p6-audit.spec.ts:52:5

# Error details

```
Error: console errors on /forgot-password: Refused to apply style from 'http://localhost:3000/_next/static/chunks/2trjbt0ytugf9.css' because its MIME type ('text/plain') is not a supported stylesheet MIME type, and strict MIME checking is enabled.

expect(received).toHaveLength(expected)

Expected length: 0
Received length: 1
Received array:  ["Refused to apply style from 'http://localhost:3000/_next/static/chunks/2trjbt0ytugf9.css' because its MIME type ('text/plain') is not a supported stylesheet MIME type, and strict MIME checking is enabled."]
```

# Page snapshot

```yaml
- main [ref=e2]:
  - link "SRISHTI" [ref=e3] [cursor=pointer]:
    - /url: /
    - img [ref=e5]
    - text: SRISHTI
  - generic [ref=e8]:
    - heading "Mot de passe oublié" [level=1] [ref=e9]
    - paragraph [ref=e10]: Indique ton e-mail, on t'envoie un lien pour en choisir un nouveau.
    - generic [ref=e12]:
      - generic [ref=e13]:
        - text: E-mail
        - textbox "E-mail" [ref=e14]:
          - /placeholder: toi@exemple.com
      - button "Envoyer le lien" [ref=e15]
  - link "Retour à la connexion" [ref=e17] [cursor=pointer]:
    - /url: /login
```

# Test source

```ts
  1   | import { test, expect, type Page } from '@playwright/test'
  2   | 
  3   | const BASE = 'http://localhost:3000'
  4   | 
  5   | function attachConsole(page: Page) {
  6   |   const errors: string[] = []
  7   |   page.on('console', msg => {
  8   |     if (msg.type() === 'error') errors.push(msg.text())
  9   |   })
  10  |   page.on('pageerror', err => errors.push(err.message))
  11  |   return errors
  12  | }
  13  | 
  14  | function filterBenign(errors: string[]) {
  15  |   return errors.filter(e =>
  16  |     !e.includes('Failed to load resource') &&
  17  |     !e.includes('favicon') &&
  18  |     !e.includes('manifest') &&
  19  |     !e.includes('hydrat') &&
  20  |     !e.includes('Warning:') &&
  21  |     !e.includes('Supabase') &&
  22  |     !e.includes('ERR_CONNECTION') &&
  23  |     !e.includes('net::')
  24  |   )
  25  | }
  26  | 
  27  | // ─── All public pages return 200 ─────────────────────────────────────────────
  28  | 
  29  | const ALL_PUBLIC_PAGES = [
  30  |   '/',
  31  |   '/login',
  32  |   '/signup',
  33  |   '/forgot-password',
  34  |   '/pricing',
  35  |   '/mentions-legales',
  36  |   '/cgu',
  37  |   '/cgv',
  38  |   '/politique-confidentialite',
  39  |   '/cookies',
  40  |   '/onboarding',
  41  |   '/aide',
  42  |   '/contact',
  43  |   '/how-it-works',
  44  |   '/ecosystem',
  45  |   '/status',
  46  |   '/changelog',
  47  |   '/offline',
  48  | ]
  49  | 
  50  | test.describe('P6 AUDIT — Pages 200 + Console 0', () => {
  51  |   for (const path of ALL_PUBLIC_PAGES) {
  52  |     test(`PUBLIC ${path} — 200 + no errors`, async ({ page }) => {
  53  |       const errors = attachConsole(page)
  54  |       const res = await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 15000 })
  55  |       expect(res?.status(), `${path} status`).toBeLessThan(400)
  56  |       const real = filterBenign(errors)
> 57  |       expect(real, `console errors on ${path}: ${real.join('|')}`).toHaveLength(0)
      |                                                                    ^ Error: console errors on /forgot-password: Refused to apply style from 'http://localhost:3000/_next/static/chunks/2trjbt0ytugf9.css' because its MIME type ('text/plain') is not a supported stylesheet MIME type, and strict MIME checking is enabled.
  58  |     })
  59  |   }
  60  | })
  61  | 
  62  | // ─── Auth redirect: all dashboard paths → /login ─────────────────────────────
  63  | 
  64  | const DASHBOARD_PAGES = [
  65  |   '/dashboard',
  66  |   '/dashboard/chat',
  67  |   '/dashboard/tools',
  68  |   '/dashboard/agents',
  69  |   '/dashboard/automation',
  70  |   '/dashboard/marketplace',
  71  |   '/dashboard/studio',
  72  |   '/dashboard/collab',
  73  |   '/dashboard/analytics',
  74  |   '/dashboard/xp',
  75  |   '/dashboard/achievements',
  76  |   '/dashboard/classement',
  77  |   '/dashboard/daily-gift',
  78  |   '/dashboard/concours',
  79  |   '/dashboard/tirage',
  80  |   '/dashboard/partage',
  81  |   '/dashboard/referral',
  82  |   '/dashboard/ambassadeur',
  83  |   '/dashboard/wallet',
  84  |   '/dashboard/api',
  85  |   '/dashboard/notifications',
  86  |   '/dashboard/guide',
  87  |   '/dashboard/profile',
  88  |   '/dashboard/settings',
  89  |   '/dashboard/admin',
  90  |   '/dashboard/invoices',
  91  | ]
  92  | 
  93  | test.describe('P6 AUDIT — Dashboard auth redirect', () => {
  94  |   for (const path of DASHBOARD_PAGES) {
  95  |     test(`DASHBOARD ${path} → /login`, async ({ page }) => {
  96  |       await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 15000 })
  97  |       expect(page.url()).toMatch(/\/login/)
  98  |     })
  99  |   }
  100 | })
  101 | 
  102 | // ─── Responsive ──────────────────────────────────────────────────────────────
  103 | 
  104 | test.describe('P6 AUDIT — Responsive', () => {
  105 |   const viewports = [
  106 |     { name: 'iPhone SE (375)', width: 375, height: 667 },
  107 |     { name: 'iPad (768)', width: 768, height: 1024 },
  108 |     { name: 'Desktop (1920)', width: 1920, height: 1080 },
  109 |   ]
  110 | 
  111 |   for (const vp of viewports) {
  112 |     test(`Landing — no overflow at ${vp.name}`, async ({ page }) => {
  113 |       await page.setViewportSize({ width: vp.width, height: vp.height })
  114 |       await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  115 |       const overflow = await page.evaluate(() =>
  116 |         document.documentElement.scrollWidth > window.innerWidth + 2
  117 |       )
  118 |       expect(overflow, `horizontal overflow at ${vp.width}px`).toBe(false)
  119 |     })
  120 | 
  121 |     test(`Login — no overflow at ${vp.name}`, async ({ page }) => {
  122 |       await page.setViewportSize({ width: vp.width, height: vp.height })
  123 |       await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
  124 |       const overflow = await page.evaluate(() =>
  125 |         document.documentElement.scrollWidth > window.innerWidth + 2
  126 |       )
  127 |       expect(overflow, `horizontal overflow at ${vp.width}px`).toBe(false)
  128 |     })
  129 | 
  130 |     test(`Pricing — no overflow at ${vp.name}`, async ({ page }) => {
  131 |       await page.setViewportSize({ width: vp.width, height: vp.height })
  132 |       await page.goto(BASE + '/pricing', { waitUntil: 'domcontentloaded' })
  133 |       const overflow = await page.evaluate(() =>
  134 |         document.documentElement.scrollWidth > window.innerWidth + 2
  135 |       )
  136 |       expect(overflow, `horizontal overflow at ${vp.width}px`).toBe(false)
  137 |     })
  138 |   }
  139 | })
  140 | 
  141 | // ─── API Routes ──────────────────────────────────────────────────────────────
  142 | 
  143 | test.describe('P6 AUDIT — API Routes', () => {
  144 |   test('GET /api/status → 200 + ok', async ({ request }) => {
  145 |     const res = await request.get(BASE + '/api/status')
  146 |     expect(res.status()).toBe(200)
  147 |     const json = await res.json()
  148 |     expect(json.status).toBe('ok')
  149 |     expect(json.app).toBe('AKASHA AI')
  150 |   })
  151 | 
  152 |   test('POST /api/chat unauth → 401', async ({ request }) => {
  153 |     const res = await request.post(BASE + '/api/chat', {
  154 |       data: { messages: [{ role: 'user', content: 'hello' }] },
  155 |     })
  156 |     expect(res.status()).toBe(401)
  157 |   })
```