import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase'
import { APP_NAME } from '@/lib/constants'
import { ratelimitContact } from '@/lib/rate-limit'
import { escapeHtml } from '@/lib/escape-html'

const schema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
})
const receiptSchema = schema.extend({ id: z.uuid() })
const projection = 'id, name, email, subject, message'
type EmailState = 'accepted' | 'unconfirmed'
// Admission 2 s + insert 10 s + read 10 s + parallel emails 20 s leaves a margin
// inside the client's 45 s wait; actual hosting limits remain deployment-specific.
export const maxDuration = 60

function receiptId(value: unknown, expected: z.infer<typeof schema>): string | null {
  const receipt = receiptSchema.safeParse(value)
  if (!receipt.success || Object.entries(expected).some(([field, content]) => receipt.data[field as keyof typeof expected] !== content)) {
    return null
  }
  return receipt.data.id
}

async function withDeadline<T>(pending: PromiseLike<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Contact operation timeout')), milliseconds)
      }),
    ])
  } finally { clearTimeout(timer) }
}

async function sendEmail(resend: Resend, payload: Parameters<Resend['emails']['send']>[0], key: string): Promise<EmailState> {
  try {
    const response = await withDeadline(resend.emails.send(payload, { idempotencyKey: key }), 20_000)
    return !response.error && typeof response.data?.id === 'string' && /^[^\s]{1,255}$/.test(response.data.id)
      ? 'accepted' : 'unconfirmed'
  } catch { return 'unconfirmed' }
}

function admissionError(error: string, status: number) {
  return NextResponse.json({ success: false, stored: false, error }, { status })
}
function unconfirmedRegistration() {
  return NextResponse.json({ success: false, stored: 'unconfirmed',
    error: 'La confirmation est indisponible. Ton message peut avoir été enregistré. Vérifie avant de le renvoyer.',
  }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) return admissionError("Le service d'envoi d'emails n'est pas configure.", 503)
  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown'
  try {
    const { success, reason } = await withDeadline(ratelimitContact.limit(ip), 2_000)
    // The installed SDK can resolve timeout with success=true. That fallback
    // cannot admit a new persisted message or provider operation here.
    if (reason === 'timeout') return admissionError('Le service de contact est temporairement indisponible.', 503)
    if (!success) return admissionError('Trop de messages recents. Reessaie dans quelques minutes.', 429)
  } catch { return admissionError('Le service de contact est temporairement indisponible.', 503) }

  let data: z.infer<typeof schema>
  try { data = schema.parse(await request.json()) }
  catch { return admissionError('Donnees invalides. Verifie tous les champs.', 400) }

  let messageId: string
  try {
    const client = createServiceClient()
    const saved = await client.from('contact_messages').insert(data).select(projection)
      .abortSignal(AbortSignal.timeout(10_000)).single()
    const savedId = receiptId(saved.data, data)
    if (saved.error || !savedId) return unconfirmedRegistration()
    // RETURNING reflects BEFORE triggers. Read again after commit so an AFTER
    // trigger cannot rewrite/delete the message while we confirm stale content.
    const persisted = await client.from('contact_messages').select(projection).eq('id', savedId)
      .abortSignal(AbortSignal.timeout(10_000)).single()
    if (persisted.error || receiptId(persisted.data, data) !== savedId) return unconfirmedRegistration()
    messageId = savedId
  } catch { return unconfirmedRegistration() }

  // Persistence is confirmed before either email. Failures after this boundary
  // must not tell the sender their registered message was lost or ask for a retry.
  let team: EmailState = 'unconfirmed'
  let confirmation: EmailState = 'unconfirmed'
  try {
    const resend = new Resend(apiKey)
    const states = await Promise.all([
      sendEmail(resend, {
        from: `${APP_NAME} Contact <noreply@purama.dev>`, to: 'purama.pro@gmail.com',
        subject: `[Contact ${APP_NAME}] ${data.subject}`,
        html: `
          <h2>Nouveau message de contact</h2>
          <p><strong>Nom :</strong> ${escapeHtml(data.name)}</p>
          <p><strong>Email :</strong> ${escapeHtml(data.email)}</p>
          <p><strong>Sujet :</strong> ${escapeHtml(data.subject)}</p>
          <hr><p>${escapeHtml(data.message).replace(/\n/g, '<br>')}</p>
        `,
      }, `akasha-contact/${messageId}/team`),
      sendEmail(resend, {
        from: `${APP_NAME} <noreply@purama.dev>`, to: data.email,
        subject: 'Nous avons bien recu ton message !',
        html: `
          <h2>Merci ${escapeHtml(data.name)} !</h2>
          <p>Ton message concernant "<strong>${escapeHtml(data.subject)}</strong>" est enregistré.</p>
          <p>Notre équipe pourra revenir vers toi à cette adresse.</p>
          <p>A bientot sur ${APP_NAME} !</p>
        `,
      }, `akasha-contact/${messageId}/confirmation`),
    ])
    team = states[0]
    confirmation = states[1]
  } catch { /* The confirmed contact remains registered if provider setup fails. */ }
  return NextResponse.json({ success: true, stored: true, message_id: messageId, emails: { team, confirmation } }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
