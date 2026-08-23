import { NextResponse, type NextRequest } from 'next/server'

/**
 * Cible callBackUrl obligatoire pour l'API Suno. akasha-ai lit le resultat par
 * polling (generateMusicAndWait), ce webhook ne fait qu'accuser reception pour
 * eviter les retries/erreurs cote Suno.
 */
export async function POST(req: NextRequest) {
  try {
    await req.json()
  } catch {
    // payload non-JSON ou vide : rien a faire, on accuse reception quand meme
  }
  return NextResponse.json({ received: true })
}
