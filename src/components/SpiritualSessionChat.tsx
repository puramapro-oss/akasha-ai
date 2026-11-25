import { useMemo, useState } from 'react'
import { useChatMessages } from '@/hooks/useChatMessages'
import { DEFAULT_AKASHA_MODEL } from '@/lib/constants'
import { isAdultForSymbolicIAO } from '@/lib/symbolic-cycles'
import { buildSessionChatContext, previewSessionChatContext, SESSION_OUTCOMES, type SpiritualSessionInput } from '@/lib/spiritual-session'

function withNatalSummary(message: string, summary?: string) {
  return message && summary ? message + '\nSynthèse natale choisie : ' + summary : message
}

export function SpiritualSessionChat({ input, question, natalSummary }: { input: SpiritualSessionInput; question: string; natalSummary?: string }) {
  const [attachNatal, setAttachNatal] = useState(false)
  const [shareIntentions, setShareIntentions] = useState(false)
  const [shareNatalReading, setShareNatalReading] = useState(false)
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const { messages, sending, sendMessage, clearMessages, error: chatError } = useChatMessages()
  let adult = false
  try { adult = !!input.birthDate && isAdultForSymbolicIAO(input.birthDate) } catch { /* Invalid dates are ineligible. */ }

  const hasIntentions = Boolean(input.personalization?.wish?.trim() || input.personalization?.mission?.trim())
  const outcome = input.personalization?.outcome
  const fullNatal = attachNatal ? natalSummary : undefined
  const preview = useMemo(() => adult ? withNatalSummary(previewSessionChatContext(input, {
    question, shareIntentions, shareNatalReading,
  }), fullNatal) : '', [adult, input, question, shareIntentions, shareNatalReading, fullNatal])

  function revokeApproval() {
    setConsent(false)
    setError('')
    clearMessages()
  }

  function resetAttachments() {
    setAttachNatal(false)
    setShareIntentions(false)
    setShareNatalReading(false)
  }

  async function send() {
    if (!consent || !adult || sending) return
    try {
      const base = buildSessionChatContext(input, { consent, question, shareIntentions, shareNatalReading })
      if (!base) throw new Error('Vérifie la date et ton accord avant cet envoi.')
      const prompt = withNatalSummary(base, fullNatal)
      setConsent(false)
      resetAttachments()
      setError('')
      await sendMessage(prompt, DEFAULT_AKASHA_MODEL, async () => {}, async () => {})
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Envoi impossible.')
    }
  }

  return (
    <div className="space-y-3 border-t border-white/15 pt-4">
      <h4 className="font-semibold">Approfondir avec IAO</h4>
      <p className="text-sm text-white/75">L’envoi inclut ta demande telle que tu l’as écrite, les choix de séance et les résultats sélectionnés. Cet échange peut figurer dans l’historique du chat.</p>
      {!adult && <p className="text-sm text-amber-100">Cette séance reste sur cet écran. L’envoi depuis ce parcours est réservé aux adultes ayant renseigné leur <a className="underline" href="#dates-cycles">date de naissance</a>.</p>}
      {(hasIntentions || outcome) && <div className="space-y-1">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" disabled={!adult || sending} checked={shareIntentions}
            aria-describedby={hasIntentions && outcome ? 'share-outcome-help' : undefined}
            onChange={event => { setShareIntentions(event.target.checked); revokeApproval() }} />
          {hasIntentions ? 'Partager mon envie et ma mission avec IAO' : 'Partager le résultat souhaité avec IAO'}
        </label>
        {hasIntentions && outcome && <p id="share-outcome-help" className="text-xs text-white/65">Ce choix inclut le résultat souhaité · {SESSION_OUTCOMES[outcome]}.</p>}
      </div>}
      {input.personalization?.natal && <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" disabled={!adult || sending} checked={shareNatalReading} onChange={event => {
          setShareNatalReading(event.target.checked)
          revokeApproval()
        }} />Partager le repère natal choisi avec IAO
      </label>}
      {natalSummary && <div className="space-y-2 rounded-lg border border-violet-200/20 p-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" disabled={!adult || sending} checked={attachNatal} onChange={event => {
            setAttachNatal(event.target.checked)
            revokeApproval()
          }} />Joindre ma synthèse natale à cet envoi
        </label>
        <details className="text-xs text-white/70">
          <summary className="cursor-pointer">Voir la synthèse proposée</summary>
          <p className="mt-2 whitespace-pre-line">{natalSummary}</p>
        </details>
      </div>}
      {preview && <details className="min-w-0 max-w-full rounded-lg border border-white/20 p-3 text-sm">
        <summary className="cursor-pointer">Voir le message exact avant l’envoi</summary>
        <pre className="mt-3 max-w-full whitespace-pre-wrap [overflow-wrap:anywhere] font-sans text-white/80">{preview}</pre>
      </details>}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" disabled={!adult || sending} checked={consent} onChange={event => {
          setConsent(event.target.checked)
          if (!event.target.checked) resetAttachments()
          setError('')
          clearMessages()
        }} />J’autorise cet envoi à IAO
      </label>
      <button type="button" disabled={!adult || !consent || sending} onClick={send}
        className="rounded-xl border border-cyan-200/45 px-4 py-2.5 text-sm font-semibold text-cyan-100 disabled:opacity-40">
        {sending ? 'IAO répond…' : 'Envoyer cette séance à IAO'}
      </button>
      {sending && <button type="button" className="ml-3 text-sm text-cyan-200 underline" onClick={clearMessages}>Interrompre la réponse</button>}
      {(error || chatError) && <p role="alert" className="text-sm text-rose-200">{error || chatError}</p>}
      <div aria-live="polite" className="space-y-2">
        {messages.filter(message => message.role === 'assistant' && message.content).map(message =>
          <p key={message.id} className="whitespace-pre-wrap break-words rounded-lg bg-white/5 p-3 text-sm">{message.content}</p>)}
      </div>
    </div>
  )
}
