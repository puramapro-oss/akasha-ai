import { expect, test, type Page } from '@playwright/test'

async function setPlan(page: Page, plan = 'free', loading = false) {
  await page.addInitScript(({ plan, loading }) => {
    sessionStorage.setItem('fixture-plan', plan)
    sessionStorage.setItem('fixture-auth-loading', String(loading))
  }, { plan, loading })
}

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    return url.origin === 'http://127.0.0.1:51066' ? route.continue() : route.abort()
  })
})

for (const [alias, name] of [
  ['akasha-sonnet', 'AKASHA Sonnet'], ['akasha-opus', 'AKASHA Opus'], ['akasha-haiku', 'AKASHA Haiku'],
]) {
  test(`catalogue ${alias} reaches the chosen model and exact request payload`, async ({ page }) => {
    await setPlan(page, 'complete')
    let sentModel: string | undefined
    await page.route('**/api/chat', async route => {
      sentModel = route.request().postDataJSON().model
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'data: {"text":"Réponse simulée"}\n\ndata: [DONE]\n\n' })
    })
    await page.goto('/dashboard/tools')
    await page.getByTestId(`tool-card-${alias}`).getByRole('button', { name: /Lancer/ }).click()
    await expect(page).toHaveURL(new RegExp(`model=${alias}$`))
    await expect(page.getByTestId('model-selector')).toContainText(name)
    await page.getByTestId('chat-input').fill('bonjour')
    await page.getByTestId('chat-send').click()
    await expect.poll(() => sentModel).toBe(alias)
    await expect(page.getByText('Réponse simulée')).toBeVisible()
  })
}

test('free Opus stays visible, cannot send, and can be repaired without losing the draft', async ({ page }) => {
  await setPlan(page)
  let calls = 0
  page.on('request', request => { if (request.url().endsWith('/api/chat')) calls++ })
  await page.goto('/dashboard/chat?model=akasha-opus&source=catalogue')
  await expect(page.getByTestId('model-selector')).toContainText('AKASHA Opus')
  await expect(page.getByRole('alert')).toContainText('indisponible')
  await page.getByTestId('chat-input').fill('brouillon conservé')
  await page.getByTestId('chat-input').press('Enter')
  await expect(page.getByTestId('chat-send')).toBeDisabled()
  await expect(page.getByTestId('chat-input')).toHaveValue('brouillon conservé')
  expect(calls).toBe(0)
  await page.getByTestId('model-selector').click()
  await expect(page.getByRole('button', { name: /AKASHA Opus.*Indisponible/ })).toBeDisabled()
  await page.getByRole('button', { name: /AKASHA Haiku/ }).click()
  await expect(page).toHaveURL(/model=akasha-haiku&source=catalogue/)
  await expect(page.getByTestId('chat-input')).toHaveValue('brouillon conservé')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByTestId('chat-send')).toBeEnabled()
  expect(calls).toBe(0)
})

for (const value of ['inconnu', '', '__proto__']) {
  test(`invalid URL alias ${JSON.stringify(value)} is explicit and blocks Enter`, async ({ page }) => {
    await setPlan(page, 'complete')
    let calls = 0
    page.on('request', request => { if (request.url().endsWith('/api/chat')) calls++ })
    await page.goto(`/dashboard/chat?model=${encodeURIComponent(value)}`)
    await expect(page.getByTestId('model-selector')).toContainText('Choisir un modèle')
    await expect(page.getByRole('alert')).toContainText('Modèle inconnu')
    await page.getByTestId('chat-input').fill('ne pas envoyer')
    await page.getByTestId('chat-input').press('Enter')
    await expect(page.getByTestId('chat-send')).toBeDisabled()
    await expect(page.getByTestId('chat-input')).toHaveValue('ne pas envoyer')
    expect(calls).toBe(0)
  })
}

test('omitted model keeps Sonnet and no error', async ({ page }) => {
  await setPlan(page)
  await page.goto('/dashboard/chat')
  await expect(page.getByTestId('model-selector')).toContainText('AKASHA Sonnet')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('authentication loading cannot send or choose a model', async ({ page }) => {
  await setPlan(page, 'complete', true)
  await page.goto('/dashboard/chat?model=akasha-opus')
  await expect(page.getByTestId('model-selector')).toBeDisabled()
  await page.getByTestId('chat-input').fill('attendre le profil')
  await expect(page.getByTestId('chat-send')).toBeDisabled()
  await expect(page.getByRole('alert')).toHaveCount(0)
})


test('changing accounts clears previous messages and draft', async ({ page }) => {
  await setPlan(page, 'complete')
  await page.route('**/api/chat', route => route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'data: {"text":"réponse privée du compte A"}\n\ndata: [DONE]\n\n' }))
  await page.goto('/dashboard/chat?model=akasha-sonnet')
  await page.getByTestId('chat-input').fill('demande privée A')
  await page.getByTestId('chat-send').click()
  await expect(page.getByText('réponse privée du compte A')).toBeVisible()
  await page.getByTestId('chat-input').fill('brouillon privé A')
  await page.evaluate(() => {
    sessionStorage.setItem('fixture-user', 'account-b')
    history.replaceState(null, '', '/dashboard/chat?model=akasha-haiku')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.getByTestId('chat-input')).toHaveValue('')
  await expect(page.getByText('réponse privée du compte A')).toHaveCount(0)
  await expect(page.getByText('demande privée A')).toHaveCount(0)
})

test('a truncated answer stays readable with an explicit error and no blocked composer', async ({ page }) => {
  await setPlan(page)
  await page.route('**/api/chat', route => route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'data: {"text":"Texte partiel conservé"}\n\n' }))
  await page.goto('/dashboard/chat')
  await page.getByTestId('chat-input').fill('bonjour')
  await page.getByTestId('chat-send').click()
  await expect(page.getByText('Texte partiel conservé')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('interrompue')
  await expect(page.getByTestId('chat-input')).toBeEnabled()
})

test('a disconnected identity cannot submit a paid request', async ({ page }) => {
  await setPlan(page, 'complete')
  await page.addInitScript(() => sessionStorage.setItem('fixture-user', 'signed-out'))
  let calls = 0
  page.on('request', req => { if (req.url().endsWith('/api/chat')) calls++ })
  await page.goto('/dashboard/chat')
  await page.getByTestId('chat-input').fill('ne pas envoyer')
  await page.getByTestId('chat-input').press('Enter')
  await expect(page.getByTestId('chat-send')).toBeDisabled()
  expect(calls).toBe(0)
})
