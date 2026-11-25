import { expect, test } from '@playwright/test'

// Example emitted by RISHI for a synthetic date, with the Kua convention omitted.
const reading = {
  schema: 'purama.rishi.numerology.v1', pythagoreanLifePath: 8, chaldeanBirth: 4,
  loShuMissing: [3, 4, 5, 6, 7, 8, 9], tantricSoul: 22, kua: null,
}
const jsonFile = (value: unknown) => ({
  name: 'private-filename.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)),
})

test('le fichier RISHI reste local avant accord et l’effacement révoque la lecture et l’envoi', async ({ page }) => {
  const posts: string[] = []
  await page.clock.setFixedTime(new Date('2026-11-25T12:00:00Z'))
  await page.route('**/*', async route => {
    const request = route.request()
    if (request.method() === 'POST') {
      posts.push(request.postData() ?? '')
      expect(new URL(request.url()).pathname).toBe('/api/chat')
      return route.fulfill({ contentType: 'text/event-stream', body: 'data: {"text":"Reçu"}\n\ndata: [DONE]\n\n' })
    }
    return new URL(request.url()).origin === 'http://127.0.0.1:51066' ? route.continue() : route.abort()
  })
  await page.goto('/dashboard/cycles')
  const form = page.getByRole('region', { name: 'Ma séance avec IAO' })
  const input = form.getByLabel('Importer le résumé de numérologie RISHI')
  const apply = form.getByRole('button', { name: 'Utiliser cette lecture dans ma séance' })
  const compose = form.getByRole('button', { name: 'Composer ma séance' })
  const send = form.getByRole('button', { name: 'Envoyer cette séance à IAO' })
  const consent = form.getByLabel('J’autorise cet envoi à IAO')
  await page.getByLabel('Date de naissance', { exact: true }).fill('2000-11-22')
  await expect(input).toHaveCount(0)
  await form.getByLabel('Mode de séance').selectOption('mixed')
  await input.setInputFiles(jsonFile(reading))
  await expect(apply).toBeVisible()
  await compose.click()
  await expect(form.getByRole('heading', { name: 'Ma séance composée' })).toBeVisible()
  await apply.click()
  await expect(consent).toHaveCount(0)
  await compose.click()
  await expect(send).toBeDisabled()
  expect(posts).toHaveLength(0)
  await consent.check()
  await send.click()
  await expect.poll(() => posts.length).toBe(1)
  expect(posts[0]).toContain('Chemin de vie pythagoricien 8')
  expect(posts[0]).toContain('nombre de l’âme tantrique 22')
  expect(posts[0]).toContain('Kua non renseigné')
  for (const privateValue of ['2000-11-22', 'private-filename.json', reading.schema]) {
    expect(posts[0]).not.toContain(privateValue)
  }
  await form.getByRole('button', { name: 'Effacer la lecture RISHI' }).click()
  await expect(consent).toHaveCount(0)
  await compose.click()
  await expect(consent).not.toBeChecked()
  await consent.check()
  await send.click()
  await expect.poll(() => posts.length).toBe(2)
  expect(posts[1]).not.toMatch(/Lo Shu|chaldéen|pythagoricien|Kua/)
})

test('une nouvelle sélection invalide la précédente et refuse un champ libre ou un fichier volumineux', async ({ page }) => {
  await page.goto('/dashboard/cycles')
  const form = page.getByRole('region', { name: 'Ma séance avec IAO' })
  const select = form.getByLabel('Mode de séance')
  const input = form.getByLabel('Importer le résumé de numérologie RISHI')
  const apply = form.getByRole('button', { name: 'Utiliser cette lecture dans ma séance' })
  const compose = form.getByRole('button', { name: 'Composer ma séance' })
  await select.selectOption('spiritual')
  await input.setInputFiles(jsonFile(reading))
  await apply.click()
  await compose.click()
  await expect(form.getByRole('heading', { name: 'Ma séance composée' })).toBeVisible()
  await input.setInputFiles(jsonFile({ ...reading, note: 'privé' }))
  await expect(form.getByRole('alert')).toContainText('Fichier incompatible')
  await expect(apply).toHaveCount(0)
  await expect(form.getByRole('heading', { name: 'Ma séance composée' })).toHaveCount(0)
  await input.setInputFiles({ ...jsonFile(reading), buffer: Buffer.alloc(4097, ' ') })
  await expect(form.getByRole('alert')).toContainText('4 Kio')
  await input.setInputFiles(jsonFile(reading))
  await apply.click()
  await select.selectOption('practical')
  await select.selectOption('spiritual')
  await compose.click()
  await expect(form.getByText('Lecture ajoutée à ta séance.')).toHaveCount(0)
  await expect(form.getByText(/Chemin de vie pythagoricien/)).toHaveCount(0)
})
