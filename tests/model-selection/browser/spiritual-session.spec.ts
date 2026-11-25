import { expect, test, type Page } from '@playwright/test'

const origin = 'http://127.0.0.1:51066'

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-25T12:00:00Z'))
  await page.route('**/*', route => new URL(route.request().url()).origin === origin
    ? route.continue() : route.abort())
  await page.goto('/dashboard/cycles')
  await expect(page.getByRole('heading', { name: 'Ma séance avec IAO' })).toBeVisible()
})

function session(page: Page) {
  return page.getByRole('region', { name: 'Ma séance avec IAO' })
}

async function withBothReadings(page: Page, birth: string) {
  await page.getByLabel('Date de naissance', { exact: true }).fill(birth)
  await page.getByLabel('Date de référence', { exact: true }).fill('2026-11-25')
  await session(page).getByLabel('Mode de séance').selectOption('mixed')
  await session(page).getByLabel('Astrologie des cycles').check()
  await session(page).getByLabel('Numérologie JYOTI').check()
}

test('application réversible des choix exprimés, puis composition au clavier sans date', async ({ page }) => {
  const form = session(page)
  const calls: string[] = []
  page.on('request', req => { if (req.url().endsWith('/api/chat')) calls.push(req.url()) })
  await form.getByLabel('Ma demande').fill('Je veux trois minutes de silence pour préparer une décision, sans astrologie.')
  const suggest = form.getByRole('button', { name: 'Reprendre les choix de ma demande' })
  await suggest.focus()
  await page.keyboard.press('Enter')
  await expect(form.getByLabel('Durée en minutes')).toHaveValue('3')
  await expect(form.getByLabel('Accompagnement')).toHaveValue('quiet')
  await expect(form.getByLabel('Intention')).toHaveValue('discernment')
  await form.getByRole('button', { name: 'Annuler les réglages suggérés' }).click()
  await expect(form.getByLabel('Durée en minutes')).toHaveValue('5')
  await expect(form.getByLabel('Intention')).toHaveValue('attention')
  await suggest.click()
  await form.getByRole('button', { name: 'Composer ma séance' }).focus()
  await page.keyboard.press('Enter')
  await expect(form.getByRole('heading', { name: 'Ma séance composée' })).toBeVisible()
  await expect(form.getByRole('listitem').first()).toBeVisible()
  await expect(form.getByLabel('J’autorise cet envoi à IAO')).toBeDisabled()
  expect(calls).toHaveLength(0)
})

test('deux lectures locales, puis envoi explicite du contexte dérivé et du texte libre', async ({ page }) => {
  const form = session(page)
  const question = 'Comment rester disponible pour un proche ?'
  const requests: string[] = []
  await page.route('**/api/chat', async route => {
    requests.push(route.request().postData() ?? '')
    await route.fulfill({ contentType: 'text/event-stream', body: 'data: {"text":"Réponse locale de test"}\n\ndata: [DONE]\n\n' })
  })
  await withBothReadings(page, '1988-01-04')
  await form.getByLabel('Ma demande').fill(question)
  await form.getByRole('button', { name: 'Composer ma séance' }).click()
  await expect(form.getByText(/Profection annuelle · maison 3/)).toContainText(/ascendant inconnu/i)
  await expect(form.getByText(/Numérologie JYOTI ·/)).toContainText('22')
  const send = form.getByRole('button', { name: 'Envoyer cette séance à IAO' })
  await expect(send).toBeDisabled()
  await form.getByLabel('J’autorise cet envoi à IAO').check()
  expect(requests).toHaveLength(0)
  await send.click()
  await expect(form.getByText('Réponse locale de test')).toBeVisible()
  expect(requests).toHaveLength(1)
  const { messages } = JSON.parse(requests[0])
  expect(messages).toHaveLength(1)
  expect(messages[0].content).toContain(question)
  expect(messages[0].content).toContain('22')
  expect(messages[0].content).toMatch(/maison 3/i)
  expect(requests[0]).not.toContain('1988-01-04')
  expect(requests[0]).not.toContain('2026-11-25')
  await expect(send).toBeDisabled()
})

test('arriver depuis le chat et choisir les deux méthodes dans une demande explicite', async ({ page }) => {
  await page.goto('/dashboard/chat')
  const link = page.getByRole('link', { name: 'Composer ma séance avec IAO' })
  await expect(link).toHaveAttribute('href', '/dashboard/cycles')
  await link.click()
  const form = session(page)
  await form.getByLabel('Ma demande').fill('Je veux une séance avec astrologie et numérologie.')
  await form.getByRole('button', { name: 'Reprendre les choix de ma demande' }).click()
  await expect(form.getByLabel('Mode de séance')).toHaveValue('mixed')
  await expect(form.getByLabel('Astrologie des cycles')).toBeChecked()
  await expect(form.getByLabel('Numérologie JYOTI')).toBeChecked()
  await form.getByRole('button', { name: 'Composer ma séance' }).click()
  await expect(form.getByRole('listitem').first()).toBeVisible()
  await expect(form.getByText(/Pour ajouter la lecture symbolique choisie/)).toBeVisible()
})

test('question libre hors du lexique : le texte reste intact et les réglages manuels sont conservés', async ({ page }) => {
  const form = session(page)
  const question = 'كيف أكتب رسالة إلى صديقي؟'
  await form.getByLabel('Intention').selectOption('custom')
  await form.getByLabel('Ma demande').fill(question)
  await form.getByRole('button', { name: 'Reprendre les choix de ma demande' }).click()
  await expect(form.getByRole('status')).toContainText('Aucun réglage reconnu')
  await expect(form.getByLabel('Intention')).toHaveValue('custom')
  await expect(form.getByLabel('Ma demande')).toHaveValue(question)
  await form.getByRole('button', { name: 'Composer ma séance' }).click()
  await expect(form.getByRole('blockquote')).toHaveText(question)
})

test('composer avec sa prière et son écriture, puis conserver uniquement les pratiques du mode pratique', async ({ page }) => {
  const form = session(page)
  await form.getByLabel('Mode de séance').selectOption('spiritual')
  await form.getByText('Choisir mes pratiques', { exact: true }).click()
  await form.getByLabel('Prière personnelle').check()
  await form.getByLabel('Écriture personnelle').check()
  await form.getByRole('button', { name: 'Composer ma séance' }).click()
  const steps = form.getByRole('listitem')
  await expect(steps).toHaveCount(4)
  await expect(steps.nth(1)).toContainText('prière')
  await expect(steps.nth(2)).toContainText('Écris quelques mots')
  await form.getByLabel('Mode de séance').selectOption('practical')
  await expect(form.getByLabel('Prière personnelle')).toHaveCount(0)
  await form.getByRole('button', { name: 'Composer ma séance' }).click()
  await expect(steps).toHaveCount(3)
  await expect(steps.nth(1)).toContainText('Écris quelques mots')
})

test('numérologie seule et mode pratique respectent les exclusions après un changement', async ({ page }) => {
  const form = session(page)
  await withBothReadings(page, '1988-01-04')
  await form.getByLabel('Astrologie des cycles').uncheck()
  await form.getByRole('button', { name: 'Composer ma séance' }).click()
  await expect(form.getByText(/Numérologie JYOTI ·/)).toContainText('22')
  await expect(form.getByText(/Profection annuelle ·/)).toHaveCount(0)
  await form.getByLabel('J’autorise cet envoi à IAO').check()
  await form.getByLabel('Mode de séance').selectOption('practical')
  await expect(form.getByRole('heading', { name: 'Ma séance composée' })).toHaveCount(0)
  await form.getByRole('button', { name: 'Composer ma séance' }).click()
  await expect(form.getByText(/Numérologie JYOTI ·|Profection annuelle ·/)).toHaveCount(0)
  await expect(form.getByLabel('J’autorise cet envoi à IAO')).not.toBeChecked()
})

test('mineur et date de référence future : les lectures locales restent accessibles et le partage indisponible', async ({ page }) => {
  const form = session(page)
  await withBothReadings(page, '2016-01-04')
  await page.getByLabel('Date de référence', { exact: true }).fill('2040-11-25')
  await form.getByRole('button', { name: 'Composer ma séance' }).click()
  await expect(form.getByText(/Profection annuelle · maison 1/)).toBeVisible()
  await expect(form.getByText(/Numérologie JYOTI ·/)).toBeVisible()
  await expect(form.getByLabel('J’autorise cet envoi à IAO')).toBeDisabled()
  await expect(form.getByRole('button', { name: 'Envoyer cette séance à IAO' })).toBeDisabled()
})

test('le calendrier initial garde ses douze années et le partage public utilise toujours le lien générique', async ({ page }) => {
  await withBothReadings(page, '1988-01-04')
  await page.getByRole('button', { name: 'Calculer localement' }).click()
  const timeline = page.getByRole('region', { name: 'Explorer les 12 prochaines années symboliques' })
  await expect(timeline.getByRole('listitem')).toHaveCount(12)
  await expect(timeline.getByRole('listitem').first()).toContainText('38 ans')
  await expect(timeline.getByRole('listitem').last()).toContainText('49 ans')
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (payload: ShareData) => {
      document.body.dataset.capturedShare = JSON.stringify(payload)
    } })
  })
  await page.getByRole('button', { name: 'Partager cette découverte' }).click()
  const payload = JSON.parse(await page.locator('body').getAttribute('data-captured-share') ?? '{}')
  const url = new URL(payload.url)
  expect(url.pathname).toBe('/cycles')
  expect([...url.searchParams.keys()].every(key => key.startsWith('utm_'))).toBe(true)
  expect(JSON.stringify(payload)).not.toMatch(/1988-01-04|2026-11-25|38 ans|maison 3/)
})

test('une réponse tardive de la séance précédente reste absente après modification de la demande', async ({ page }) => {
  const form = session(page)
  let finish!: () => void
  const pending = new Promise<void>(resolve => { finish = resolve })
  let returned!: () => void
  const delivered = new Promise<void>(resolve => { returned = resolve })
  let received = false
  await page.route('**/api/chat', async route => {
    received = true
    await pending
    try {
      await route.fulfill({ contentType: 'text/event-stream', body: 'data: {"text":"Ancienne réponse privée"}\n\ndata: [DONE]\n\n' })
    } finally { returned() }
  })
  await withBothReadings(page, '1988-01-04')
  await form.getByRole('button', { name: 'Composer ma séance' }).click()
  await form.getByLabel('J’autorise cet envoi à IAO').check()
  await form.getByRole('button', { name: 'Envoyer cette séance à IAO' }).click()
  try {
    await expect.poll(() => received).toBe(true)
    await form.getByLabel('Ma demande').fill('Une nouvelle question')
    await form.getByRole('button', { name: 'Composer ma séance' }).click()
  } finally { finish() }
  await delivered
  await expect(form.getByRole('heading', { name: 'Ma séance composée' })).toBeVisible()
  await expect(form.getByLabel('J’autorise cet envoi à IAO')).not.toBeChecked()
  await expect(form.getByText('Ancienne réponse privée')).toHaveCount(0)
})
