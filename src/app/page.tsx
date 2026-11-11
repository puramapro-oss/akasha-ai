'use client'

import Nav from '@/components/landing/Nav'
import Hero from '@/components/landing/LandingHero'
import { Features, Tools, Pricing } from '@/components/landing/ProductSections'
import { Trust, FAQ, CTAFinal, Footer } from '@/components/landing/BottomSections'

export default function LandingPage() {
  return (
    <>
      <Nav />
      <main id="contenu-principal" tabIndex={-1} className="relative min-h-screen overflow-hidden bg-[#0A0A0F] outline-none">
        <Hero />
        <Features />
        <Tools />
        <Pricing />
        <Trust />
        <FAQ />
        <CTAFinal />
      </main>
      <Footer />
    </>
  )
}
