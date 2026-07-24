import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase'
import { APP_NAME } from '@/lib/constants'
import { ratelimitContact } from '@/lib/rate-limit'

const resend = new Resend(process.env.RESEND_API_KEY!)

const schema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
})

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown'
  const { success } = await ratelimitContact.limit(ip)
  if (!success) {
    return NextResponse.json({ error: 'Trop de messages recents. Reessaie dans quelques minutes.' }, { status: 429 })
  }

  try {
    const body = await request.json()
    const data = schema.parse(body)
    const supabase = createServiceClient()

    // Save to DB
    await supabase.from('contact_messages').insert({
      name: data.name,
      email: data.email,
      subject: data.subject,
      message: data.message,
    })

    // Send notification email to team
    await resend.emails.send({
      from: `${APP_NAME} Contact <noreply@purama.dev>`,
      to: 'purama.pro@gmail.com',
      subject: `[Contact ${APP_NAME}] ${data.subject}`,
      html: `
        <h2>Nouveau message de contact</h2>
        <p><strong>Nom :</strong> ${data.name}</p>
        <p><strong>Email :</strong> ${data.email}</p>
        <p><strong>Sujet :</strong> ${data.subject}</p>
        <hr>
        <p>${data.message.replace(/\n/g, '<br>')}</p>
      `,
    })

    // Send confirmation to user
    await resend.emails.send({
      from: `${APP_NAME} <noreply@purama.dev>`,
      to: data.email,
      subject: `Nous avons bien recu ton message !`,
      html: `
        <h2>Merci ${data.name} !</h2>
        <p>Nous avons bien recu ton message concernant "<strong>${data.subject}</strong>".</p>
        <p>Notre equipe te repond sous 24h maximum.</p>
        <p>A bientot sur ${APP_NAME} !</p>
      `,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Donnees invalides. Verifie tous les champs.' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Erreur lors de l\'envoi. Reessaie dans quelques instants.' }, { status: 500 })
  }
}
