import { expect, test, type Locator } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import tailwind from '@tailwindcss/postcss'
import postcss from 'postcss'

// Compare a painted glyph with the same pixel after hiding only the text fill.
// Matching pixels preserve composed gradients, inherited colours and opacity.
async function measureText(locator: Locator) {
  const painted = await locator.screenshot()
  await locator.evaluate(el => el.style.setProperty('-webkit-text-fill-color', 'transparent', 'important'))
  try {
    const background = await locator.screenshot()
    return await locator.page().evaluate(async ([ink, paper]) => {
      async function pixels(png: string) {
        const img = new Image()
        img.src = 'data:image/png;base64,' + png
        await img.decode()
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const context = canvas.getContext('2d')!
        context.drawImage(img, 0, 0)
        return context.getImageData(0, 0, img.width, img.height).data
      }
      const [a, b] = await Promise.all([pixels(ink), pixels(paper)])
      function linear(byte: number) {
        const s = byte / 255
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      function luminance(image: Uint8ClampedArray, i: number) {
        return 0.2126 * linear(image[i]) + 0.7152 * linear(image[i + 1]) + 0.0722 * linear(image[i + 2])
      }
      const samples = []
      for (let i = 0; i < a.length; i += 4) {
        const delta = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]))
        if (delta) samples.push({ delta, fg: luminance(a, i), bg: luminance(b, i) })
      }
      if (!samples.length) throw new Error('No visible text pixels')
      // The interior of glyphs carries the ink colour; antialiased edges do not.
      samples.sort((x, y) => y.delta - x.delta)
      const { fg, bg } = samples[Math.floor(samples.length * 0.025)]
      return { fg, bg, ratio: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05) }
    }, [painted.toString('base64'), background.toString('base64')])
  } finally {
    await locator.evaluate(el => el.style.removeProperty('-webkit-text-fill-color'))
  }
}

test('le panneau suit le thème de la page et garde ses textes et champs lisibles', async ({ page }) => {
  const root = fileURLToPath(new URL('../../..', import.meta.url))
  const from = fileURLToPath(new URL('../../../src/app/globals.css', import.meta.url))
  const css = await postcss([tailwind({ base: root })]).process(await readFile(from, 'utf8'), { from })
  await page.goto('/dashboard/cycles')
  const globalStyles = await page.addStyleTag({ content: css.css })
  // Next loads the root stylesheet before the page CSS Module; reproduce that order.
  await globalStyles.evaluate(el => document.head.prepend(el))
  await page.getByLabel('Date de naissance', { exact: true }).fill('2000-01-01')
  await page.getByLabel('Fuseau du lieu de naissance').fill('UTC')
  await page.getByLabel('Heure de naissance', { exact: true }).fill('12:00')
  await page.getByLabel('Précision de l’heure').selectOption('5')
  await page.getByRole('button', { name: 'Calculer mon thème natal' }).click()
  const table = page.getByRole('table', { name: 'Signes observés dans la fourchette' })
  await expect(table).toBeVisible()
  const wish = page.getByLabel('Mon envie du moment', { exact: true })
  await wish.fill('Dessiner au jardin')
  await page.getByRole('button', { name: 'Composer ma séance' }).click()
  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value }, theme)
    const heading = await measureText(page.getByRole('heading', { name: 'Ma séance avec IAO' }))
    expect(heading.ratio, theme + ' heading').toBeGreaterThanOrEqual(3)
    expect(heading.bg > heading.fg, theme + ' background polarity').toBe(theme === 'light')
    for (const loc of [wish, page.getByText('J’autorise cet envoi à IAO', { exact: true }),
      table.getByRole('rowheader', { name: 'Soleil', exact: true })]) {
      const text = await measureText(loc)
      expect(text.ratio, theme + ' ' + loc).toBeGreaterThanOrEqual(4.5)
    }
  }
})
