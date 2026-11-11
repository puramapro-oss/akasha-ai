import { NextResponse, type NextRequest } from 'next/server'
import { Resend } from 'resend'
import { createServiceClient } from '@/lib/supabase'
import { APP_NAME, APP_DOMAIN, APP_COLOR, COMPANY_INFO } from '@/lib/constants'
import { assertCronAuth } from '@/lib/cron-auth'

const resend = new Resend(process.env.RESEND_API_KEY!)

// 10 email types with day offsets
const EMAIL_SEQUENCE = [
  { type: 'welcome', dayOffset: 0, subject: `Bienvenue sur ${APP_NAME} !`, emoji: '🚀' },
  { type: 'tip_day1', dayOffset: 1, subject: `Astuce du jour : tire le meilleur d'${APP_NAME}`, emoji: '💡' },
  { type: 'relaunch_day3', dayOffset: 3, subject: `${APP_NAME} t'attend ! Decouvre ce que tu as manque`, emoji: '👋' },
  { type: 'tips_day7', dayOffset: 7, subject: `7 jours avec ${APP_NAME} — voici tes super-pouvoirs`, emoji: '⚡' },
  { type: 'upgrade_day14', dayOffset: 14, subject: `-20% sur ton abonnement ${APP_NAME} (48h seulement)`, emoji: '🎁' },
  { type: 'testimonial_day21', dayOffset: 21, subject: `Ils utilisent ${APP_NAME} au quotidien`, emoji: '💬' },
  { type: 'winback_day30', dayOffset: 30, subject: `Tu nous manques sur ${APP_NAME}`, emoji: '💛' },
  { type: 'referral_event', dayOffset: -1, subject: `Ton parrainage a ete valide !`, emoji: '🎉' },
  { type: 'contest_event', dayOffset: -1, subject: `Resultats du concours ${APP_NAME}`, emoji: '🏆' },
  { type: 'milestone_event', dayOffset: -1, subject: `Felicitations ! Tu as atteint un nouveau palier`, emoji: '🌟' },
] as const

type EmailType = (typeof EMAIL_SEQUENCE)[number]['type']

function buildEmailHtml(type: EmailType, userName: string): string {
  const name = userName || 'explorateur'

  const TEMPLATES: Record<EmailType, string> = {
    welcome: `
      <h2>Bienvenue ${name} ! 🚀</h2>
      <p>Tu fais maintenant partie de la communaute <strong>${APP_NAME}</strong>, la plateforme IA multi-expert la plus avancee.</p>
      <p>Voici ce que tu peux faire des maintenant :</p>
      <ul>
        <li><strong>Chat IA</strong> — Pose n'importe quelle question a AKASHA</li>
        <li><strong>Studio Creatif</strong> — Genere des images, videos, audio et code</li>
        <li><strong>Agents</strong> — Cree tes propres assistants IA</li>
        <li><strong>Parrainage</strong> — Invite tes amis et gagne des commissions</li>
      </ul>
      <a href="https://${APP_DOMAIN}/dashboard" style="display:inline-block;background:${APP_COLOR};color:#fff;padding:12px 28px;border-radius:12px;text-decoration:none;font-weight:600;margin-top:16px;">Commencer maintenant</a>
    `,
    tip_day1: `
      <h2>Salut ${name} ! 💡</h2>
      <p>Savais-tu que tu peux choisir entre 3 modeles IA sur AKASHA ?</p>
      <ul>
        <li><strong>AKASHA Sonnet</strong> — Le plus equilibre pour le quotidien</li>
        <li><strong>AKASHA Opus</strong> — Reflexion profonde pour les taches complexes</li>
        <li><strong>AKASHA Haiku</strong> — Ultra-rapide pour les reponses immediates</li>
      </ul>
      <p>Essaie de basculer entre les modeles dans le chat pour voir la difference !</p>
      <a href="https://${APP_DOMAIN}/dashboard/chat" style="display:inline-block;background:${APP_COLOR};color:#fff;padding:12px 28px;border-radius:12px;text-decoration:none;font-weight:600;margin-top:16px;">Tester maintenant</a>
    `,
    relaunch_day3: `
      <h2>Hey ${name} ! 👋</h2>
      <p>Ca fait quelques jours qu'on ne t'a pas vu sur AKASHA. Pendant ce temps, d'autres utilisateurs ont :</p>
      <ul>
        <li>Cree des agents IA personnalises</li>
        <li>Genere du contenu avec le Studio Creatif</li>
        <li>Gagne des points et des recompenses</li>
      </ul>
      <p>Ne rate pas ton coffre quotidien — chaque jour compte pour ton streak !</p>
      <a href="https://${APP_DOMAIN}/dashboard/daily-gift" style="display:inline-block;background:${APP_COLOR};color:#fff;padding:12px 28px;border-radius:12px;text-decoration:none;font-weight:600;margin-top:16px;">Ouvrir mon coffre</a>
    `,
    tips_day7: `
      <h2>7 jours avec AKASHA ! ⚡</h2>
      <p>${name}, voici 3 fonctionnalites que les power users adorent :</p>
      <ol>
        <li><strong>Automatisation</strong> — Cree des workflows qui travaillent pour toi</li>
        <li><strong>Collaboration</strong> — Invite ton equipe dans des espaces partages</li>
        <li><strong>Marketplace</strong> — Decouvre les agents crees par la communaute</li>
      </ol>
      <p>Et n'oublie pas : chaque action te rapporte des XP et des points Purama !</p>
      <a href="https://${APP_DOMAIN}/dashboard" style="display:inline-block;background:${APP_COLOR};color:#fff;padding:12px 28px;border-radius:12px;text-decoration:none;font-weight:600;margin-top:16px;">Explorer</a>
    `,
    upgrade_day14: `
      <h2>Offre exclusive pour toi, ${name} ! 🎁</h2>
      <p>Pour feter tes 2 semaines sur AKASHA, on t'offre <strong>-20%</strong> sur ton premier abonnement.</p>
      <p>Avec un abonnement, tu debloques :</p>
      <ul>
        <li>Jusqu'a des questions illimitees par jour</li>
        <li>Acces a AKASHA Opus (reflexion profonde)</li>
        <li>Studio Creatif complet</li>
        <li>Gains en euros reels (wallet + retraits IBAN)</li>
      </ul>
      <p><strong>Code : EMAIL20</strong> — valable 48h seulement.</p>
      <a href="https://${APP_DOMAIN}/pricing" style="display:inline-block;background:${APP_COLOR};color:#fff;padding:12px 28px;border-radius:12px;text-decoration:none;font-weight:600;margin-top:16px;">Voir les plans</a>
    `,
    testimonial_day21: `
      <h2>Ils adorent AKASHA 💬</h2>
      <p>${name}, decouvre ce que nos utilisateurs disent :</p>
      <blockquote style="border-left:3px solid ${APP_COLOR};padding-left:16px;margin:16px 0;font-style:italic;">
        "AKASHA a completement change ma facon de travailler. Les agents personnalises me font gagner des heures chaque semaine."
      </blockquote>
      <blockquote style="border-left:3px solid ${APP_COLOR};padding-left:16px;margin:16px 0;font-style:italic;">
        "Le systeme de parrainage est incroyable — j'ai deja gagne plus de 50 EUR en 1 mois."
      </blockquote>
      <a href="https://${APP_DOMAIN}/dashboard" style="display:inline-block;background:${APP_COLOR};color:#fff;padding:12px 28px;border-radius:12px;text-decoration:none;font-weight:600;margin-top:16px;">Rejoindre la communaute</a>
    `,
    winback_day30: `
      <h2>${name}, tu nous manques 💛</h2>
      <p>Ca fait un moment qu'on ne t'a pas vu. Voici ce qui t'attend :</p>
      <ul>
        <li>Ton coffre quotidien n'attend que toi</li>
        <li>De nouveaux agents sur le Marketplace</li>
        <li>Le concours hebdomadaire est en cours (6% du CA redistribue !)</li>
      </ul>
      <p>Reviens vite, ta place est toujours la.</p>
      <a href="https://${APP_DOMAIN}/dashboard" style="display:inline-block;background:${APP_COLOR};color:#fff;padding:12px 28px;border-radius:12px;text-decoration:none;font-weight:600;margin-top:16px;">Revenir sur AKASHA</a>
    `,
    referral_event: `
      <h2>Parrainage valide ! 🎉</h2>
      <p>${name}, quelqu'un s'est inscrit grace a toi ! Ta commission a ete ajoutee a ton wallet.</p>
      <p>Continue a parrainer pour monter en palier et augmenter tes commissions.</p>
      <a href="https://${APP_DOMAIN}/dashboard/referral" style="display:inline-block;background:${APP_COLOR};color:#fff;padding:12px 28px;border-radius:12px;text-decoration:none;font-weight:600;margin-top:16px;">Voir mes parrainages</a>
    `,
    contest_event: `
      <h2>Resultats du concours ! 🏆</h2>
      <p>${name}, les resultats sont tombes ! Consulte le classement pour voir si tu fais partie des 10 gagnants.</p>
      <a href="https://${APP_DOMAIN}/dashboard/concours" style="display:inline-block;background:${APP_COLOR};color:#fff;padding:12px 28px;border-radius:12px;text-decoration:none;font-weight:600;margin-top:16px;">Voir les resultats</a>
    `,
    milestone_event: `
      <h2>Nouveau palier atteint ! 🌟</h2>
      <p>${name}, felicitations ! Tu viens de debloquer un nouveau palier sur AKASHA.</p>
      <p>Decouvre tes nouvelles recompenses et continue ta progression.</p>
      <a href="https://${APP_DOMAIN}/dashboard/achievements" style="display:inline-block;background:${APP_COLOR};color:#fff;padding:12px 28px;border-radius:12px;text-decoration:none;font-weight:600;margin-top:16px;">Voir mes succes</a>
    `,
  }

  const content = TEMPLATES[type] ?? ''

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0A0A0F;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="color:${APP_COLOR};font-size:28px;margin:0;">${APP_NAME}</h1>
    </div>
    <div style="background:#12141f;border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:32px;color:#f0f2ff;font-size:15px;line-height:1.7;">
      ${content}
    </div>
    <div style="text-align:center;margin-top:32px;color:rgba(255,255,255,0.35);font-size:12px;">
      <p>${COMPANY_INFO.name} — ${COMPANY_INFO.address}</p>
      <p>${COMPANY_INFO.taxNote}</p>
      <p style="margin-top:8px;">
        <a href="https://${APP_DOMAIN}/aide" style="color:${APP_COLOR};text-decoration:none;">Aide</a> |
        <a href="https://${APP_DOMAIN}/politique-confidentialite" style="color:${APP_COLOR};text-decoration:none;">Confidentialite</a> |
        <a href="https://${APP_DOMAIN}/cgu" style="color:${APP_COLOR};text-decoration:none;">CGU</a>
      </p>
    </div>
  </div>
</body>
</html>`
}

export async function GET(request: NextRequest) {
  const authError = assertCronAuth(request)
  if (authError) return authError

  try {
    const supabase = createServiceClient()
    const now = new Date()
    let sent = 0

    // Process day-based sequences (not events)
    const daySequences = EMAIL_SEQUENCE.filter(s => s.dayOffset >= 0)

    for (const seq of daySequences) {
      // Find users who signed up exactly N days ago and haven't received this email
      const targetDate = new Date(now)
      targetDate.setDate(targetDate.getDate() - seq.dayOffset)
      const dateStr = targetDate.toISOString().split('T')[0]

      const { data: eligibleUsers } = await supabase
        .from('profiles')
        .select('id, email, display_name')
        .gte('created_at', `${dateStr}T00:00:00Z`)
        .lt('created_at', `${dateStr}T23:59:59Z`)

      if (!eligibleUsers?.length) continue

      for (const user of eligibleUsers) {
        if (!user.email) continue

        // Check if already sent
        const { count } = await supabase
          .from('email_sequences')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('email_type', seq.type)

        if (count && count > 0) continue

        // Send email
        try {
          await resend.emails.send({
            from: `${APP_NAME} <noreply@purama.dev>`,
            to: user.email,
            subject: `${seq.emoji} ${seq.subject}`,
            html: buildEmailHtml(seq.type, user.display_name ?? ''),
          })

          // Log in DB
          await supabase.from('email_sequences').insert({
            user_id: user.id,
            email_type: seq.type,
          })

          sent++
        } catch {
          // Skip individual failures, continue with others
        }
      }
    }

    return NextResponse.json({ status: 'ok', sent, timestamp: now.toISOString() })
  } catch {
    return NextResponse.json({ error: 'Erreur lors de l\'envoi des emails. Le service sera retente automatiquement.' }, { status: 500 })
  }
}
