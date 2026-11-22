import { NextResponse, type NextRequest } from 'next/server'
import { Resend } from 'resend'
import { createServiceClient } from '@/lib/supabase'
import { APP_NAME, APP_DOMAIN, APP_COLOR, COMPANY_INFO } from '@/lib/constants'
import { assertCronAuth } from '@/lib/cron-auth'
import { escapeHtml } from '@/lib/escape-html'
import { canSendSequence, type ScheduledType } from '@/lib/email-sequence-policy'
import { emailCohortPages, EmailRunBudget, EmailRunDeferred, hasReceipt } from '@/lib/email-sequence-recipients'

export const maxDuration = 60

// 10 email types with day offsets
const EMAIL_SEQUENCE = [
  { type: 'welcome', dayOffset: 0, subject: `Bienvenue sur ${APP_NAME} !`, emoji: '🚀' },
  { type: 'tip_day1', dayOffset: 1, subject: `Astuce du jour : tire le meilleur d'${APP_NAME}`, emoji: '💡' },
  { type: 'relaunch_day3', dayOffset: 3, subject: `${APP_NAME} t'attend ! Decouvre ce que tu as manque`, emoji: '👋' },
  { type: 'tips_day7', dayOffset: 7, subject: `7 jours avec ${APP_NAME} — voici tes super-pouvoirs`, emoji: '⚡' },
  { type: 'upgrade_day14', dayOffset: 14, subject: `Decouvre les offres ${APP_NAME}`, emoji: '🎁' },
  { type: 'testimonial_day21', dayOffset: 21, subject: `Des idees pour utiliser ${APP_NAME} au quotidien`, emoji: '💬' },
  { type: 'winback_day30', dayOffset: 30, subject: `Tu nous manques sur ${APP_NAME}`, emoji: '💛' },
  { type: 'referral_event', dayOffset: -1, subject: `Ton parrainage a ete valide !`, emoji: '🎉' },
  { type: 'contest_event', dayOffset: -1, subject: `Resultats du concours ${APP_NAME}`, emoji: '🏆' },
  { type: 'milestone_event', dayOffset: -1, subject: `Felicitations ! Tu as atteint un nouveau palier`, emoji: '🌟' },
] as const

type EmailType = (typeof EMAIL_SEQUENCE)[number]['type']

function buildEmailHtml(type: EmailType, userName: string): string {
  const name = escapeHtml(userName || 'explorateur')

  const TEMPLATES: Record<EmailType, string> = {
    welcome: `
      <h2>Bienvenue ${name} ! 🚀</h2>
      <p>Bienvenue dans la communaute <strong>${APP_NAME}</strong>, une plateforme pour explorer les outils IA.</p>
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
      <p>Voici quelques idees pour continuer a explorer AKASHA :</p>
      <ul>
        <li>Creer des agents IA personnalises</li>
        <li>Generer du contenu avec le Studio Creatif</li>
        <li>Consulter les points et recompenses disponibles</li>
      </ul>
      <p>Ne rate pas ton coffre quotidien — chaque jour compte pour ton streak !</p>
      <a href="https://${APP_DOMAIN}/dashboard/daily-gift" style="display:inline-block;background:${APP_COLOR};color:#fff;padding:12px 28px;border-radius:12px;text-decoration:none;font-weight:600;margin-top:16px;">Ouvrir mon coffre</a>
    `,
    tips_day7: `
      <h2>7 jours avec AKASHA ! ⚡</h2>
      <p>${name}, voici 3 fonctionnalites a explorer selon ton offre :</p>
      <ol>
        <li><strong>Automatisation</strong> — Cree des workflows qui travaillent pour toi</li>
        <li><strong>Collaboration</strong> — Invite ton equipe dans des espaces partages</li>
        <li><strong>Marketplace</strong> — Decouvre les agents crees par la communaute</li>
      </ol>
      <p>Consulte les activites eligibles et leurs conditions pour obtenir des XP et des points Purama.</p>
      <a href="https://${APP_DOMAIN}/dashboard" style="display:inline-block;background:${APP_COLOR};color:#fff;padding:12px 28px;border-radius:12px;text-decoration:none;font-weight:600;margin-top:16px;">Explorer</a>
    `,
    upgrade_day14: `
      <h2>Decouvre les offres AKASHA, ${name} ! 🎁</h2>
      <p>Compare les fonctionnalites et les quotas inclus dans chaque offre :</p>
      <ul>
        <li>Volume de questions et modeles IA accessibles</li>
        <li>Outils du Studio Creatif</li>
        <li>Fonctions de creation et d'automatisation</li>
      </ul>
      <p>Les prix, conditions et disponibilites figurent sur la page des offres.</p>
      <a href="https://${APP_DOMAIN}/pricing" style="display:inline-block;background:${APP_COLOR};color:#fff;padding:12px 28px;border-radius:12px;text-decoration:none;font-weight:600;margin-top:16px;">Voir les plans</a>
    `,
    testimonial_day21: `
      <h2>Des idees pour ton quotidien 💬</h2>
      <p>${name}, voici quelques usages a explorer selon les fonctions disponibles dans ton offre :</p>
      <ul>
        <li>Preparer un brouillon et le relire avant de le partager</li>
        <li>Organiser tes idees dans une conversation</li>
        <li>Creer un assistant adapte a une tache precise</li>
      </ul>
      <a href="https://${APP_DOMAIN}/dashboard" style="display:inline-block;background:${APP_COLOR};color:#fff;padding:12px 28px;border-radius:12px;text-decoration:none;font-weight:600;margin-top:16px;">Rejoindre la communaute</a>
    `,
    winback_day30: `
      <h2>${name}, tu nous manques 💛</h2>
      <p>Voici quelques pistes pour ta prochaine visite :</p>
      <ul>
        <li>Ton coffre quotidien n'attend que toi</li>
        <li>De nouveaux agents sur le Marketplace</li>
        <li>Le modele prevoit d'affecter 30% des commissions PURAMA aux recompenses communautaires, selon les conditions du programme.</li>
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
        <a href="https://${APP_DOMAIN}/cgu" style="color:${APP_COLOR};text-decoration:none;">CGU</a> |
        <a href="https://${APP_DOMAIN}/dashboard/settings" style="color:${APP_COLOR};text-decoration:none;">Preferences de notification</a>
      </p>
    </div>
  </div>
</body>
</html>`
}

export async function GET(request: NextRequest) {
  const authError = assertCronAuth(request)
  if (authError) return authError

  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json({ error: "Le service d'envoi d'emails n'est pas configure." }, { status: 503 })
  }

  const now = new Date()
  let sent = 0
  let failed = 0
  let skipped = 0
  let deferred = false

  try {
    const resend = new Resend(apiKey)
    const supabase = createServiceClient()
    const budget = new EmailRunBudget()

    // Process day-based sequences (not events)
    const daySequences = EMAIL_SEQUENCE.filter((s): s is Extract<(typeof EMAIL_SEQUENCE)[number], { type: ScheduledType }> => s.dayOffset >= 0)

    for (const seq of daySequences) {
      // UTC [midnight, next midnight) also includes the final second of the day.
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - seq.dayOffset))
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - seq.dayOffset + 1))

      try {
        for await (const eligibleUsers of emailCohortPages(supabase, seq.type, start, end, budget)) {
          for (const user of eligibleUsers) {
            budget.check()
            if (!user.email?.trim()) { skipped++; continue }

            try {
              if (await hasReceipt(supabase, user.id, seq.type)) { skipped++; continue }

              // Do not send when the user's choice cannot be read or validated.
              const { data: preferences, error: preferenceError } = await supabase.from('notification_preferences')
                .select('user_id, types, paused_until').eq('user_id', user.id).maybeSingle()
              if (preferenceError) throw new Error('Notification preferences read failed')
              if (!canSendSequence(seq.type, preferences, user.id, new Date())) { skipped++; continue }

              await budget.beforeSend()
              // A pacing delay may outlive an opt-out in another tab. Read the
              // current choice again after that wait, immediately before sending.
              const latest = await supabase.from('notification_preferences')
                .select('user_id, types, paused_until').eq('user_id', user.id).maybeSingle()
              if (latest.error) throw new Error('Final notification preferences read failed')
              if (!canSendSequence(seq.type, latest.data, user.id, new Date())) { skipped++; continue }
              const { data, error: sendError } = await resend.emails.send({
                from: `${APP_NAME} <noreply@purama.dev>`,
                to: user.email,
                subject: `${seq.emoji} ${seq.subject}`,
                html: buildEmailHtml(seq.type, user.display_name ?? ''),
              }, {
                // Resend retains keys for 24 h; the durable receipt remains necessary.
                // Retrying a changed payload with this key fails instead of sending twice.
                idempotencyKey: `akasha-email/${seq.type}/${user.id}`,
              })
              if (sendError?.statusCode === 429 || sendError?.name === 'rate_limit_exceeded' ||
                  sendError?.name === 'daily_quota_exceeded' || sendError?.name === 'monthly_quota_exceeded') {
                failed++
                throw new EmailRunDeferred('Provider capacity reached')
              }
              if (sendError || typeof data?.id !== 'string' || !data.id.trim()) throw new Error('Email not accepted by provider')

              // Keep the canonical RPC and verify its durable receipt for both results.
              const recorded = await supabase.rpc('record_email_sequence_delivery', {
                p_user_id: user.id, p_email_type: seq.type,
              })
              if (recorded.error || typeof recorded.data !== 'boolean') throw new Error('Delivery record not confirmed')
              if (!await hasReceipt(supabase, user.id, seq.type)) throw new Error('Email receipt was not stored')
              if (recorded.data) sent++
              else skipped++
            } catch (error) {
              if (error instanceof EmailRunDeferred) throw error
              // Keep independent recipients moving, but expose failures to the scheduler.
              failed++
            }
          }
        }
      } catch (error) {
        if (error instanceof EmailRunDeferred) { deferred = true; break }
        failed++
      }
    }

    return NextResponse.json({ status: failed || deferred ? 'partial' : 'ok', sent, failed, skipped, deferred, timestamp: now.toISOString() }, {
      status: failed || deferred ? 503 : 200,
    })
  } catch {
    return NextResponse.json({
      status: 'partial', sent, failed: failed + 1, skipped, timestamp: now.toISOString(),
      error: "Le traitement des emails n'a pas pu etre termine.",
    }, { status: 503 })
  }
}
