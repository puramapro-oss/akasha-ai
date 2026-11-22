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

export async function POST(request: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json({ error: "Le service d'envoi d'emails n'est pas configure." }, { status: 503 })
  }

  let received = false
  let notificationsSent = 0

  try {
    const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown'
    const { success } = await ratelimitContact.limit(ip)
    if (!success) {
      return NextResponse.json({ error: 'Trop de messages recents. Reessaie dans quelques minutes.' }, { status: 429 })
    }

    const body = await request.json()
    const data = schema.parse(body)
    const supabase = createServiceClient()

    // A successful request alone does not prove that a trigger stored the message.
    const { data: storedMessage, error: saveError } = await supabase.from('contact_messages').insert({
      name: data.name,
      email: data.email,
      subject: data.subject,
      message: data.message,
    }).select('id, name, email, subject, message').single()
    const receipt = receiptSchema.safeParse(storedMessage)
    if (saveError || !receipt.success ||
        !(['name', 'email', 'subject', 'message'] as const).every(field => receipt.data[field] === data[field])) {
      throw new Error('Contact message persistence was not confirmed')
    }
    received = true
    const resend = new Resend(apiKey)

    // Send notification email to team
    const notification = await resend.emails.send({
      from: `${APP_NAME} Contact <noreply@purama.dev>`,
      to: 'purama.pro@gmail.com',
      subject: `[Contact ${APP_NAME}] ${data.subject}`,
      html: `
        <h2>Nouveau message de contact</h2>
        <p><strong>Nom :</strong> ${escapeHtml(data.name)}</p>
        <p><strong>Email :</strong> ${escapeHtml(data.email)}</p>
        <p><strong>Sujet :</strong> ${escapeHtml(data.subject)}</p>
        <hr>
        <p>${escapeHtml(data.message).replace(/\n/g, '<br>')}</p>
      `,
    })
    if (notification.error || typeof notification.data?.id !== 'string' || !notification.data.id.trim()) {
      throw new Error('Contact notification not accepted')
    }
    notificationsSent++

    // Send confirmation to user
    const confirmation = await resend.emails.send({
      from: `${APP_NAME} <noreply@purama.dev>`,
      to: data.email,
      subject: `Nous avons bien recu ton message !`,
      html: `
        <h2>Merci ${escapeHtml(data.name)} !</h2>
        <p>Nous avons bien recu ton message concernant "<strong>${escapeHtml(data.subject)}</strong>".</p>
        <p>Notre equipe pourra te repondre a l'adresse email indiquee.</p>
        <p>A bientot sur ${APP_NAME} !</p>
      `,
    })
    if (confirmation.error || typeof confirmation.data?.id !== 'string' || !confirmation.data.id.trim()) {
      throw new Error('Contact confirmation not accepted')
    }
    notificationsSent++

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof z.ZodError || err instanceof SyntaxError) {
      return NextResponse.json({ error: 'Donnees invalides. Verifie tous les champs.' }, { status: 400 })
    }
    return NextResponse.json({
      status: received ? 'partial' : 'unavailable', received, notifications_sent: notificationsSent,
      error: received
        ? "Ton message est enregistre. La notification par email n'a pas pu etre confirmee ; inutile de renvoyer le formulaire."
        : "Ton message n'a pas pu etre enregistre. Reessaie dans quelques instants.",
    }, { status: 503 })
  }
}
