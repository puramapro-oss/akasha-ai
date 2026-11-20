import type { Metadata, Viewport } from 'next'
import { Space_Grotesk, DM_Sans, JetBrains_Mono } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { Toaster } from 'sonner'
import ErrorBoundary from '@/components/shared/ErrorBoundary'
import CookieBanner from '@/components/shared/CookieBanner'
import CursorGlow from '@/components/layout/CursorGlow'
import './globals.css'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'AKASHA AI — Tous les outils IA. Un seul abonnement.',
  description: '47+ outils IA premium reunis en une seule plateforme. Cree, automatise, code et genere — sans jamais changer d\'app. Des 7€/mois.',
  metadataBase: new URL('https://akasha.purama.dev'),
  manifest: '/manifest.json',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
    shortcut: '/favicon.svg',
  },
  openGraph: {
    title: 'AKASHA AI — 47+ outils IA en un',
    description: 'Le premier ecosysteme IA tout-en-un au monde. 47+ outils pour creer, automatiser et coder.',
    url: 'https://akasha.purama.dev',
    siteName: 'AKASHA AI',
    locale: 'fr_FR',
    type: 'website',
    images: [
      {
        url: '/api/og',
        width: 1200,
        height: 630,
        alt: 'AKASHA AI — 47+ outils IA en un abonnement',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AKASHA AI — 47+ outils IA. 1 abonnement.',
    description: '47+ outils IA. 1 abonnement. Des 7€/mois.',
    images: ['/api/og'],
  },
  robots: { index: true, follow: true },
  alternates: {
    canonical: 'https://akasha.purama.dev',
  },
}

export const viewport: Viewport = {
  themeColor: '#00d4ff',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} className={`${spaceGrotesk.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('akasha-theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t}else{document.documentElement.dataset.theme='dark'}}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-screen bg-[var(--bg-void)] font-[family-name:var(--font-body)] text-[var(--text-primary)] antialiased">
        {/* R6 a11y : lien d'évitement clavier — pattern identique à sthana/soma/nada/vastu/paka/punar
            (`#contenu-principal`, cible = le <main> du route-group actif). */}
        <a
          href="#contenu-principal"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-white focus:shadow-lg"
        >
          Aller au contenu principal
        </a>
        <div className="aurora" />
        <div className="grid-overlay" />
        <div className="noise-overlay" />
        <CursorGlow />
        <NextIntlClientProvider messages={messages} locale={locale}>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
          <CookieBanner />
        </NextIntlClientProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: 'rgba(255,255,255,0.05)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.06)',
              color: '#f0f2ff',
            },
          }}
        />
      </body>
    </html>
  )
}
