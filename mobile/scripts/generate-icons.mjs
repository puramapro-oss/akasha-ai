import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'

const ASSETS_DIR = path.join(process.cwd(), 'assets')

function download(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location).then(resolve).catch(reject)
      }
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

async function generateIcons() {
  console.log('Downloading AKASHA icon from Pollinations...')

  const prompt = 'minimalist neural network brain icon, glowing cyan blue and purple, dark background, flat design, app icon style, no text, symmetrical, clean vector art'
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&model=flux&enhance=true&nologo=true`

  const buffer = await download(url)
  console.log(`Downloaded ${buffer.length} bytes`)

  // Icon 1024x1024
  await sharp(buffer)
    .resize(1024, 1024)
    .png()
    .toFile(path.join(ASSETS_DIR, 'icon.png'))
  console.log('icon.png (1024x1024)')

  // Adaptive icon - with padding on dark bg
  const padded = await sharp(buffer).resize(624, 624).png().toBuffer()
  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: { r: 3, g: 4, b: 10, alpha: 1 } }
  })
    .composite([{ input: padded, gravity: 'center' }])
    .png()
    .toFile(path.join(ASSETS_DIR, 'adaptive-icon.png'))
  console.log('adaptive-icon.png (1024x1024 padded)')

  // Splash 1284x2778
  const splashIcon = await sharp(buffer).resize(400, 400).png().toBuffer()
  await sharp({
    create: { width: 1284, height: 2778, channels: 4, background: { r: 3, g: 4, b: 10, alpha: 1 } }
  })
    .composite([{ input: splashIcon, gravity: 'center' }])
    .png()
    .toFile(path.join(ASSETS_DIR, 'splash.png'))
  console.log('splash.png (1284x2778)')

  // Favicon 48x48
  await sharp(buffer)
    .resize(48, 48)
    .png()
    .toFile(path.join(ASSETS_DIR, 'favicon.png'))
  console.log('favicon.png (48x48)')

  // Notification icon 96x96
  await sharp(buffer)
    .resize(96, 96)
    .png()
    .toFile(path.join(ASSETS_DIR, 'notification-icon.png'))
  console.log('notification-icon.png (96x96)')

  // Feature graphic 1024x500
  const featureIcon = await sharp(buffer).resize(300, 300).png().toBuffer()
  await sharp({
    create: { width: 1024, height: 500, channels: 4, background: { r: 3, g: 4, b: 10, alpha: 1 } }
  })
    .composite([{ input: featureIcon, gravity: 'center' }])
    .png()
    .toFile(path.join(ASSETS_DIR, 'feature-graphic.png'))
  console.log('feature-graphic.png (1024x500)')

  console.log('All icons generated!')
}

generateIcons().catch(console.error)
