import Link from 'next/link'
import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import { getCyclesLandingCopy } from '@/lib/cycles-landing-copy'
import { SYMBOLIC_CYCLE_SOURCES } from '@/lib/symbolic-cycles'
import { PUBLIC_CYCLES_URL } from '@/lib/symbolic-share'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const copy = getCyclesLandingCopy(locale)
  return {
    title: copy.seoTitle,
    description: copy.seoDescription,
    alternates: { canonical: PUBLIC_CYCLES_URL },
    openGraph: {
      title: copy.seoTitle,
      description: copy.seoDescription,
      url: PUBLIC_CYCLES_URL,
      type: 'website',
      siteName: 'AKASHA AI',
      locale: locale.startsWith('fr') ? 'fr_FR' : 'en_US',
    },
    twitter: {
      card: 'summary',
      title: copy.seoTitle,
      description: copy.seoDescription,
    },
    robots: { index: true, follow: true },
  }
}

/** Public, server-rendered discovery page: no personal information or tracking. */
export default async function CyclesLandingPage() {
  const locale = await getLocale()
  const copy = getCyclesLandingCopy(locale)
  const sourceUrls = [SYMBOLIC_CYCLE_SOURCES.profections, SYMBOLIC_CYCLE_SOURCES.cosmicClock]

  return (
    <main className="min-h-screen bg-[#0d0d16] text-white">
      <div className="mx-auto max-w-5xl space-y-14 px-5 py-10 sm:py-16">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="text-sm font-semibold tracking-widest text-cyan-300 hover:underline">
            AKASHA · PURAMA
          </Link>
          <Link href="/dashboard/cycles"
            className="rounded-full border border-cyan-300/40 px-5 py-2.5 text-sm font-semibold text-cyan-200 hover:bg-cyan-300/10">
            {copy.explore}
          </Link>
        </header>

        <section className="max-w-3xl space-y-6 py-6">
          <p className="text-sm font-semibold tracking-widest text-cyan-300">{copy.heroKicker}</p>
          <h1 className="text-4xl font-semibold leading-tight sm:text-6xl">
            {copy.heroTitle} <span className="text-cyan-300">{copy.heroHighlight}</span>
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-white/75">{copy.heroDescription}</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard/cycles"
              className="rounded-xl bg-cyan-400 px-6 py-3 font-semibold text-[#10111a] hover:bg-cyan-300">
              {copy.explore}
            </Link>
            <Link href="/signup"
              className="rounded-xl border border-white/30 px-6 py-3 font-semibold text-white hover:bg-white/10">
              {copy.discover}
            </Link>
          </div>
          <p className="text-sm text-white/55">{copy.caution}</p>
        </section>

        <section className="grid gap-5 sm:grid-cols-2" aria-label={copy.originsLabel}>
          {copy.methods.map((method, index) => (
            <article key={method.number} className="space-y-4 rounded-2xl border border-white/15 bg-white/5 p-6">
              <p className="text-3xl font-semibold text-cyan-300">{method.number}</p>
              <h2 className="text-2xl font-semibold">{method.title}</h2>
              <p className="text-sm font-medium text-violet-200">{method.origin}</p>
              <p className="leading-relaxed text-white/75">{method.content}</p>
              <a href={sourceUrls[index]} target="_blank" rel="noopener noreferrer"
                className="inline-flex text-sm font-medium text-cyan-300 underline hover:text-cyan-200">
                {copy.sourceLabel}
              </a>
            </article>
          ))}
        </section>

        <section className="space-y-5 rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.06] p-6 sm:p-8">
          <h2 className="text-2xl font-semibold">{copy.featureTitle}</h2>
          <div className="grid gap-5 sm:grid-cols-3">
            {copy.features.map((feature) => (
              <div key={feature.title}>
                <h3 className="font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm text-white/70">{feature.content}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="flex flex-wrap items-start justify-between gap-5 border-t border-white/15 pt-8 text-sm text-white/60">
          <div className="max-w-xl">
            <p className="font-semibold text-white">{copy.privacyTitle}</p>
            <p className="mt-1">{copy.privacyDescription}</p>
          </div>
          <div className="flex gap-4">
            <Link href="/politique-confidentialite" className="underline hover:text-white">
              {copy.privacyLink}
            </Link>
            <Link href="/" className="underline hover:text-white">{copy.homeLink}</Link>
          </div>
        </footer>
      </div>
    </main>
  )
}
