import { NextResponse, type NextRequest } from 'next/server'

/**
 * Cible callBackUrl obligatoire pour l'API Suno. akasha-ai lit le resultat par
 * polling (generateMusicAndWait), ce webhook ne fait qu'accuser reception pour
 * eviter les retries/erreurs cote Suno.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.log('[webhooks/suno] callback recu', body?.data?.taskId ?? 'taskId inconnu')
  } catch {
    // payload non-JSON ou vide : rien a faire, on accuse reception quand meme
  }
  return NextResponse.json({ received: true })
}
