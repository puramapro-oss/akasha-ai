/**
 * Wrapper API Suno reelle (sunoapi.org), contrat valide en direct (2026-07-26) :
 * POST /generate -> {data:{taskId}}, puis polling GET /generate/record-info?taskId=
 * -> {data:{status, response:{sunoData:[{audioUrl,...}]}}}. callBackUrl obligatoire.
 */

const SUNO_BASE_URL = process.env.SUNO_API_BASE_URL ?? 'https://api.sunoapi.org/api/v1'
const SUNO_MODEL = 'V4_5ALL'

export class SunoNotConfiguredError extends Error {
  constructor() {
    super('La generation musicale Suno n\'est pas configuree.')
    this.name = 'SunoNotConfiguredError'
  }
}

function getApiKey(): string {
  const key = process.env.SUNO_API_KEY
  if (!key || key.startsWith('__')) throw new SunoNotConfiguredError()
  return key
}

export type SunoTrack = {
  audioUrl: string
  imageUrl?: string
  title: string
  durationSec?: number
}

export type SunoStatus = 'PENDING' | 'SUCCESS' | 'FAILED'

export async function requestMusicGeneration(prompt: string): Promise<{ taskId: string }> {
  const key = getApiKey()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL manquant : requis par Suno (callBackUrl obligatoire).')
  const callBackUrl = `${appUrl}/api/webhooks/suno`

  const res = await fetch(`${SUNO_BASE_URL}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      customMode: false,
      instrumental: false,
      model: SUNO_MODEL,
      prompt,
      callBackUrl,
    }),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Suno API error: ${res.status} — ${errorText}`)
  }

  const json = await res.json()
  const taskId = json?.data?.taskId
  if (!taskId) throw new Error('Reponse Suno invalide: taskId manquant.')
  return { taskId }
}

export async function getMusicGenerationStatus(
  taskId: string
): Promise<{ status: SunoStatus; tracks: SunoTrack[] }> {
  const key = getApiKey()
  const res = await fetch(
    `${SUNO_BASE_URL}/generate/record-info?taskId=${encodeURIComponent(taskId)}`,
    { headers: { Authorization: `Bearer ${key}` } }
  )

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Suno API error: ${res.status} — ${errorText}`)
  }

  const json = await res.json()
  const rawStatus = json?.data?.status
  const status: SunoStatus =
    rawStatus === 'SUCCESS' ? 'SUCCESS' : rawStatus === 'FAILED' ? 'FAILED' : 'PENDING'

  const sunoData: unknown[] = json?.data?.response?.sunoData ?? []
  const tracks: SunoTrack[] = sunoData.map((raw) => {
    const t = raw as Record<string, unknown>
    return {
      audioUrl: String(t.audioUrl ?? ''),
      imageUrl: t.imageUrl ? String(t.imageUrl) : undefined,
      title: String(t.title ?? ''),
      durationSec: typeof t.duration === 'number' ? t.duration : undefined,
    }
  })

  return { status, tracks }
}

/**
 * Genere puis attend le resultat en pollant, borne par `budgetMs` (le frontend
 * attend une reponse synchrone {url}). Si le budget expire, renvoie null plutot
 * que de planter — l'appelant doit alors informer l'utilisateur de reessayer.
 */
export async function generateMusicAndWait(prompt: string, budgetMs = 100_000): Promise<string | null> {
  const { taskId } = await requestMusicGeneration(prompt)
  const deadline = Date.now() + budgetMs
  const pollIntervalMs = 4_000

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollIntervalMs))
    const { status, tracks } = await getMusicGenerationStatus(taskId)
    if (status === 'FAILED') throw new Error('La generation Suno a echoue.')
    if (status === 'SUCCESS' && tracks.length > 0 && tracks[0].audioUrl) {
      return tracks[0].audioUrl
    }
  }
  return null
}
