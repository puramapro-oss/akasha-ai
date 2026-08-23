# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: p6-audit.spec.ts >> P6 AUDIT — API Routes >> POST /api/locale — switch to EN
- Location: tests/p6-audit.spec.ts:164:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 500
```

# Test source

```ts
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
  158 | 
  159 |   test('GET /api/quota/check unauth → 401', async ({ request }) => {
  160 |     const res = await request.get(BASE + '/api/quota/check')
  161 |     expect(res.status()).toBe(401)
  162 |   })
  163 | 
  164 |   test('POST /api/locale — switch to EN', async ({ request }) => {
  165 |     const res = await request.post(BASE + '/api/locale', {
  166 |       data: { locale: 'en' },
  167 |     })
> 168 |     expect(res.status()).toBe(200)
      |                          ^ Error: expect(received).toBe(expected) // Object.is equality
  169 |     const json = await res.json()
  170 |     expect(json.locale).toBe('en')
  171 |     expect(json.success).toBe(true)
  172 |   })
  173 | 
  174 |   test('POST /api/locale — invalid locale 400', async ({ request }) => {
  175 |     const res = await request.post(BASE + '/api/locale', {
  176 |       data: { locale: 'xx' },
  177 |     })
  178 |     expect(res.status()).toBe(400)
  179 |   })
  180 | 
  181 |   test('GET /sitemap.xml → 200 + XML', async ({ request }) => {
  182 |     const res = await request.get(BASE + '/sitemap.xml')
  183 |     expect(res.status()).toBe(200)
  184 |     const text = await res.text()
  185 |     expect(text).toContain('<?xml')
  186 |   })
  187 | 
  188 |   test('GET /robots.txt → 200', async ({ request }) => {
  189 |     const res = await request.get(BASE + '/robots.txt')
  190 |     expect(res.status()).toBe(200)
  191 |   })
  192 | 
  193 |   test('GET /manifest.json → 200 + AKASHA', async ({ request }) => {
  194 |     const res = await request.get(BASE + '/manifest.json')
  195 |     expect(res.status()).toBe(200)
  196 |     const json = await res.json()
  197 |     expect(json.name).toBe('AKASHA AI')
  198 |   })
  199 | })
  200 | 
  201 | // ─── Forms ───────────────────────────────────────────────────────────────────
  202 | 
  203 | test.describe('P6 AUDIT — Forms', () => {
  204 |   test('Login form — inputs typeable + button exists', async ({ page }) => {
  205 |     await page.goto(BASE + '/login')
  206 |     const email = page.locator('[data-testid="email-input"]')
  207 |     const pass = page.locator('[data-testid="password-input"]')
  208 |     await expect(email).toBeVisible()
  209 |     await expect(pass).toBeVisible()
  210 |     await email.fill('test@test.com')
  211 |     await pass.fill('test1234')
  212 |     await expect(email).toHaveValue('test@test.com')
  213 |     await expect(pass).toHaveValue('test1234')
  214 |     await expect(page.locator('[data-testid="login-button"]')).toBeVisible()
  215 |   })
  216 | 
  217 |   test('Signup form — all fields + password strength', async ({ page }) => {
  218 |     await page.goto(BASE + '/signup')
  219 |     await expect(page.locator('[data-testid="name-input"]')).toBeVisible()
  220 |     await expect(page.locator('[data-testid="email-input"]')).toBeVisible()
  221 |     await expect(page.locator('[data-testid="password-input"]')).toBeVisible()
  222 |     await expect(page.locator('[data-testid="confirm-password-input"]')).toBeVisible()
  223 |     await page.locator('[data-testid="password-input"]').fill('Test123!')
  224 |     const body = await page.locator('body').textContent()
  225 |     expect(body).toMatch(/Faible|Moyen|Fort|Excellent|Trop court/)
  226 |   })
  227 | 
  228 |   test('Contact page — form fields present', async ({ page }) => {
  229 |     await page.goto(BASE + '/contact')
  230 |     const body = page.locator('body')
  231 |     await expect(body).toContainText('Contact')
  232 |   })
  233 | })
  234 | 
  235 | // ─── Landing content checks ─────────────────────────────────────────────────
  236 | 
  237 | test.describe('P6 AUDIT — Landing content', () => {
  238 |   test('Landing — hero text + CTA', async ({ page }) => {
  239 |     await page.goto(BASE + '/')
  240 |     await expect(page.locator('body')).toContainText('AKASHA')
  241 |     const cta = page.locator('a[href="/signup"]').first()
  242 |     await expect(cta).toBeVisible()
  243 |   })
  244 | 
  245 |   test('Landing — pricing section exists', async ({ page }) => {
  246 |     await page.goto(BASE + '/')
  247 |     await expect(page.locator('#pricing')).toBeAttached()
  248 |   })
  249 | 
  250 |   test('Landing — FAQ section exists', async ({ page }) => {
  251 |     await page.goto(BASE + '/')
  252 |     await expect(page.locator('#faq')).toBeAttached()
  253 |   })
  254 | 
  255 |   test('Landing — footer with SASU PURAMA', async ({ page }) => {
  256 |     await page.goto(BASE + '/')
  257 |     const footer = page.locator('footer')
  258 |     await expect(footer).toContainText('SASU PURAMA')
  259 |     await expect(footer).toContainText('293')
  260 |   })
  261 | })
  262 | 
```