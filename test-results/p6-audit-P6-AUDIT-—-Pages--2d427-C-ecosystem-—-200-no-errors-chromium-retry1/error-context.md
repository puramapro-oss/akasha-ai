# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: p6-audit.spec.ts >> P6 AUDIT — Pages 200 + Console 0 >> PUBLIC /ecosystem — 200 + no errors
- Location: tests/p6-audit.spec.ts:52:5

# Error details

```
Error: console errors on /ecosystem: Refused to apply style from 'http://localhost:3000/_next/static/chunks/2trjbt0ytugf9.css' because its MIME type ('text/plain') is not a supported stylesheet MIME type, and strict MIME checking is enabled.|Refused to execute script from 'http://localhost:3000/_next/static/chunks/310vm2bl3xxpt.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled.|Refused to execute script from 'http://localhost:3000/_next/static/chunks/2mmpezlrfmbu5.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled.|Refused to execute script from 'http://localhost:3000/_next/static/chunks/3e4keds9ktjdu.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled.|Refused to execute script from 'http://localhost:3000/_next/static/chunks/3-mzfc-j3p2r7.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled.

expect(received).toHaveLength(expected)

Expected length: 0
Received length: 5
Received array:  ["Refused to apply style from 'http://localhost:3000/_next/static/chunks/2trjbt0ytugf9.css' because its MIME type ('text/plain') is not a supported stylesheet MIME type, and strict MIME checking is enabled.", "Refused to execute script from 'http://localhost:3000/_next/static/chunks/310vm2bl3xxpt.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled.", "Refused to execute script from 'http://localhost:3000/_next/static/chunks/2mmpezlrfmbu5.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled.", "Refused to execute script from 'http://localhost:3000/_next/static/chunks/3e4keds9ktjdu.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled.", "Refused to execute script from 'http://localhost:3000/_next/static/chunks/3-mzfc-j3p2r7.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled."]
```

# Page snapshot

```yaml
- main [ref=e2]:
  - generic [ref=e3]:
    - link "SRISHTI" [ref=e4] [cursor=pointer]:
      - /url: /
      - img [ref=e6]
      - text: SRISHTI
    - link "Se connecter" [ref=e9] [cursor=pointer]:
      - /url: /login
  - generic [ref=e10]:
    - heading "L’écosystème PURAMA" [level=1] [ref=e11]
    - paragraph [ref=e12]: Un seul compte pour toutes les apps PURAMA. Chaque app a son propre domaine et sa propre mission — voici les autres.
  - generic [ref=e13]:
    - link "JurisPurama Assistant juridique IA pour avocats et particuliers. jurispurama.purama.dev" [ref=e14] [cursor=pointer]:
      - /url: /go/jurispurama
      - generic [ref=e15]:
        - paragraph [ref=e16]: JurisPurama
        - img [ref=e17]
      - paragraph [ref=e20]: Assistant juridique IA pour avocats et particuliers.
      - paragraph [ref=e21]: jurispurama.purama.dev
    - link "KAÏA Santé et médecine généraliste accompagnée par l'IA. kaia.purama.dev" [ref=e22] [cursor=pointer]:
      - /url: /go/kaia
      - generic [ref=e23]:
        - paragraph [ref=e24]: KAÏA
        - img [ref=e25]
      - paragraph [ref=e28]: Santé et médecine généraliste accompagnée par l'IA.
      - paragraph [ref=e29]: kaia.purama.dev
    - link "VIDA Bien-être holistique au quotidien. vida-sante.purama.dev" [ref=e30] [cursor=pointer]:
      - /url: /go/vida_sante
      - generic [ref=e31]:
        - paragraph [ref=e32]: VIDA
        - img [ref=e33]
      - paragraph [ref=e36]: Bien-être holistique au quotidien.
      - paragraph [ref=e37]: vida-sante.purama.dev
    - link "VIDA Aide Recherche d'aides sociales et handicap. vida-aide.purama.dev" [ref=e38] [cursor=pointer]:
      - /url: /go/vida_aide
      - generic [ref=e39]:
        - paragraph [ref=e40]: VIDA Aide
        - img [ref=e41]
      - paragraph [ref=e44]: Recherche d'aides sociales et handicap.
      - paragraph [ref=e45]: vida-aide.purama.dev
    - link "VIDA Asso Gestion d'association solidaire. vida-assoc.purama.dev" [ref=e46] [cursor=pointer]:
      - /url: /go/vida_assoc
      - generic [ref=e47]:
        - paragraph [ref=e48]: VIDA Asso
        - img [ref=e49]
      - paragraph [ref=e52]: Gestion d'association solidaire.
      - paragraph [ref=e53]: vida-assoc.purama.dev
    - link "Lingora Apprentissage des langues. lingora.purama.dev" [ref=e54] [cursor=pointer]:
      - /url: /go/lingora
      - generic [ref=e55]:
        - paragraph [ref=e56]: Lingora
        - img [ref=e57]
      - paragraph [ref=e60]: Apprentissage des langues.
      - paragraph [ref=e61]: lingora.purama.dev
    - link "KASH Conseil financier personnel. kash.purama.dev" [ref=e62] [cursor=pointer]:
      - /url: /go/kash
      - generic [ref=e63]:
        - paragraph [ref=e64]: KASH
        - img [ref=e65]
      - paragraph [ref=e68]: Conseil financier personnel.
      - paragraph [ref=e69]: kash.purama.dev
    - link "DONA Assistant générosité et dons. dona.purama.dev" [ref=e70] [cursor=pointer]:
      - /url: /go/dona
      - generic [ref=e71]:
        - paragraph [ref=e72]: DONA
        - img [ref=e73]
      - paragraph [ref=e76]: Assistant générosité et dons.
      - paragraph [ref=e77]: dona.purama.dev
    - link "VOYA Guide de voyage immersif. voya.purama.dev" [ref=e78] [cursor=pointer]:
      - /url: /go/voya
      - generic [ref=e79]:
        - paragraph [ref=e80]: VOYA
        - img [ref=e81]
      - paragraph [ref=e84]: Guide de voyage immersif.
      - paragraph [ref=e85]: voya.purama.dev
    - link "EntreprisePilot Pilotage de TPE/PME. entreprise-pilot.purama.dev" [ref=e86] [cursor=pointer]:
      - /url: /go/entreprise_pilot
      - generic [ref=e87]:
        - paragraph [ref=e88]: EntreprisePilot
        - img [ref=e89]
      - paragraph [ref=e92]: Pilotage de TPE/PME.
      - paragraph [ref=e93]: entreprise-pilot.purama.dev
    - link "Purama AI Assistant généraliste de l'écosystème PURAMA. purama-ai.purama.dev" [ref=e94] [cursor=pointer]:
      - /url: /go/purama_ai
      - generic [ref=e95]:
        - paragraph [ref=e96]: Purama AI
        - img [ref=e97]
      - paragraph [ref=e100]: Assistant généraliste de l'écosystème PURAMA.
      - paragraph [ref=e101]: purama-ai.purama.dev
    - link "Origin Écosystème terre et spiritualité. purama-origin.purama.dev" [ref=e102] [cursor=pointer]:
      - /url: /go/purama_origin
      - generic [ref=e103]:
        - paragraph [ref=e104]: Origin
        - img [ref=e105]
      - paragraph [ref=e108]: Écosystème terre et spiritualité.
      - paragraph [ref=e109]: purama-origin.purama.dev
    - link "AKASHA Multi-expert IA. akasha-ai.purama.dev" [ref=e110] [cursor=pointer]:
      - /url: /go/akasha_ai
      - generic [ref=e111]:
        - paragraph [ref=e112]: AKASHA
        - img [ref=e113]
      - paragraph [ref=e116]: Multi-expert IA.
      - paragraph [ref=e117]: akasha-ai.purama.dev
    - link "LUMIOS Consultant en stratégie business. lumios.purama.dev" [ref=e118] [cursor=pointer]:
      - /url: /go/lumios
      - generic [ref=e119]:
        - paragraph [ref=e120]: LUMIOS
        - img [ref=e121]
      - paragraph [ref=e124]: Consultant en stratégie business.
      - paragraph [ref=e125]: lumios.purama.dev
    - link "SUTRA Création vidéo par IA. sutra.purama.dev" [ref=e126] [cursor=pointer]:
      - /url: /go/sutra
      - generic [ref=e127]:
        - paragraph [ref=e128]: SUTRA
        - img [ref=e129]
      - paragraph [ref=e132]: Création vidéo par IA.
      - paragraph [ref=e133]: sutra.purama.dev
    - link "MANA Finances personnelles hyper-simplifiées. mana.purama.dev" [ref=e134] [cursor=pointer]:
      - /url: /go/mana
      - generic [ref=e135]:
        - paragraph [ref=e136]: MANA
        - img [ref=e137]
      - paragraph [ref=e140]: Finances personnelles hyper-simplifiées.
      - paragraph [ref=e141]: mana.purama.dev
    - link "MIDAS Trading et analyse de marchés. midas.purama.dev" [ref=e142] [cursor=pointer]:
      - /url: /go/midas
      - generic [ref=e143]:
        - paragraph [ref=e144]: MIDAS
        - img [ref=e145]
      - paragraph [ref=e148]: Trading et analyse de marchés.
      - paragraph [ref=e149]: midas.purama.dev
    - link "PRANA Yoga, méditation et respiration. prana.purama.dev" [ref=e150] [cursor=pointer]:
      - /url: /go/prana
      - generic [ref=e151]:
        - paragraph [ref=e152]: PRANA
        - img [ref=e153]
      - paragraph [ref=e156]: Yoga, méditation et respiration.
      - paragraph [ref=e157]: prana.purama.dev
    - link "AETHER Art génératif et musique méditative. aether.purama.dev" [ref=e158] [cursor=pointer]:
      - /url: /go/aether
      - generic [ref=e159]:
        - paragraph [ref=e160]: AETHER
        - img [ref=e161]
      - paragraph [ref=e164]: Art génératif et musique méditative.
      - paragraph [ref=e165]: aether.purama.dev
    - link "EXODUS Détox écran et sevrage numérique. exodus.purama.dev" [ref=e166] [cursor=pointer]:
      - /url: /go/exodus
      - generic [ref=e167]:
        - paragraph [ref=e168]: EXODUS
        - img [ref=e169]
      - paragraph [ref=e172]: Détox écran et sevrage numérique.
      - paragraph [ref=e173]: exodus.purama.dev
    - link "Compta Comptabilité pour auto-entrepreneur. purama-compta.purama.dev" [ref=e174] [cursor=pointer]:
      - /url: /go/purama_compta
      - generic [ref=e175]:
        - paragraph [ref=e176]: Compta
        - img [ref=e177]
      - paragraph [ref=e180]: Comptabilité pour auto-entrepreneur.
      - paragraph [ref=e181]: purama-compta.purama.dev
    - link "LAKSHMI Récupération d'argent dû (Ciclade, AGIRA, FICOBA, succession). lakshmi.purama.dev" [ref=e182] [cursor=pointer]:
      - /url: /go/lakshmi
      - generic [ref=e183]:
        - paragraph [ref=e184]: LAKSHMI
        - img [ref=e185]
      - paragraph [ref=e188]: Récupération d'argent dû (Ciclade, AGIRA, FICOBA, succession).
      - paragraph [ref=e189]: lakshmi.purama.dev
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
      |                                                                    ^ Error: console errors on /ecosystem: Refused to apply style from 'http://localhost:3000/_next/static/chunks/2trjbt0ytugf9.css' because its MIME type ('text/plain') is not a supported stylesheet MIME type, and strict MIME checking is enabled.|Refused to execute script from 'http://localhost:3000/_next/static/chunks/310vm2bl3xxpt.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled.|Refused to execute script from 'http://localhost:3000/_next/static/chunks/2mmpezlrfmbu5.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled.|Refused to execute script from 'http://localhost:3000/_next/static/chunks/3e4keds9ktjdu.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled.|Refused to execute script from 'http://localhost:3000/_next/static/chunks/3-mzfc-j3p2r7.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled.
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