import { describe, expect, it } from 'vitest'
import { buildSessionChatContext, composeSpiritualSession, previewSessionChatContext, type SpiritualSessionInput } from './spiritual-session'
import type { NatalReflectionOption } from './natal-reflection'

const base: SpiritualSessionInput = {
  mode: 'mixed', focus: 'custom', minutes: 5, guidance: 'guided', techniques: ['writing'],
  birthDate: '1990-03-14', asOfDate: '2026-11-25', useAstrology: false, useNumerology: false,
}
const wish = 'Organiser un atelier d’entraide'
const mission = 'Rendre les rencontres plus accessibles'
const natal: NatalReflectionOption = {
  id: 'overview', group: 'Vue d’ensemble', label: 'Vue d’ensemble de test',
  question: 'Quelle idée aurais-tu envie de transmettre ?',
  basis: ['Repère supplémentaire affiché sur cet appareil'],
}
function steps(input: SpiritualSessionInput) {
  return composeSpiritualSession(input).steps.map(step => step.text).join('\n')
}

describe('composition selon les envies, la mission déclarée et le thème choisi', () => {
  it('conserve le parcours classique sans indication personnelle', () => {
    expect(steps({ ...base, personalization: { wish: '  \n ' } })).toBe(steps(base))
  })

  it('produit deux exercices créatifs différents à thème et mission identiques', () => {
    const personal = { wish, mission, outcome: 'draft' as const, natal }
    const atelier = steps({ ...base, personalization: personal })
    const musique = steps({ ...base, personalization: { ...personal, wish: 'Je voudrais composer une chanson' } })
    expect(atelier).toContain('invitation en deux phrases')
    expect(musique).toContain('mélodie de quelques secondes')
    expect(musique).not.toContain('invitation en deux phrases')
    for (const text of [atelier, musique]) {
      expect(text).toContain(mission)
      expect(text).toContain(natal.question)
    }
  })

  it('emploie une proposition ouverte pour une demande inédite, négative ou ambiguë', () => {
    for (const request of ['Créer une carte tactile du quartier', 'Ne pas organiser un atelier', 'Organiser un atelier ou composer une chanson']) {
      const plan = steps({ ...base, personalization: { wish: request, outcome: 'draft' } })
      expect(plan).toContain('À qui ou à quoi destines-tu ta création')
      expect(plan).not.toContain('invitation en deux phrases')
    }
  })

  it('crée une amorce de texte locale et respecte les choix de partage lors de la recomposition', () => {
    const personal = { wish: 'Je veux organiser un atelier d’entraide', mission, outcome: 'draft' as const }
    const input = { ...base, personalization: personal }
    const draft = composeSpiritualSession(input).starterDraft
    expect(draft?.title).toBe('Invitation à adapter')
    expect(draft?.text).toContain('Bonjour ! J’aimerais organiser un atelier d’entraide.')
    expect(draft?.text).toContain(mission)
    expect(composeSpiritualSession({ ...base, personalization: { ...personal, outcome: 'action' } }).starterDraft).toBeNull()
    expect(previewSessionChatContext(input, { question: '' })).not.toContain('Aimeriez-vous y participer')
    expect(previewSessionChatContext(input, { question: '', shareIntentions: true })).toContain(draft!.text)
  })

  it('conserve chaque durée et produit uniquement le texte autorisé à chaque combinaison', () => {
    for (const mode of ['practical', 'mixed', 'spiritual'] as const) {
      for (const outcome of [undefined, 'action', 'draft', 'choice'] as const) {
        for (const selectedWish of [undefined, wish]) for (const selectedMission of [undefined, mission]) {
          for (const selectedNatal of [undefined, natal]) {
            const input = { ...base, mode, personalization: { outcome, wish: selectedWish, mission: selectedMission, natal: selectedNatal } }
            const plan = composeSpiritualSession(input)
            expect(plan.steps.reduce((sum, step) => sum + step.seconds, 0)).toBe(300)
            expect(steps(input).includes(natal.question)).toBe(mode !== 'practical' && !!selectedNatal)
            for (const shareIntentions of [false, true]) for (const shareNatalReading of [false, true]) {
              const selection = { question: '', shareIntentions, shareNatalReading }
              const sent = buildSessionChatContext(input, { ...selection, consent: true })
              expect(sent).toBe(previewSessionChatContext(input, selection))
              expect(sent.includes(wish)).toBe(shareIntentions && !!selectedWish)
              expect(sent.includes(mission)).toBe(shareIntentions && !!selectedMission)
              expect(sent.includes(natal.question)).toBe(shareNatalReading && mode !== 'practical' && !!selectedNatal)
              expect(sent.includes('Résultat demandé')).toBe(shareIntentions && !!outcome)
              expect(sent).not.toContain(natal.basis![0])
              expect(sent).not.toContain('1990-03-14')
              expect(buildSessionChatContext(input, { ...selection, consent: false })).toBe('')
            }
          }
        }
      }
    }
  })

  it('protège les valeurs privées même contre les indices indirects dans le texte envoyé', () => {
    const input = { ...base, personalization: { wish, mission, outcome: 'draft' as const, natal } }
    const privatePreview = previewSessionChatContext(input, { question: 'Ma demande libre' })
    expect(privatePreview).toBe(previewSessionChatContext(base, { question: 'Ma demande libre' }))
    expect(privatePreview).not.toContain('invitation en deux phrases')
    expect(previewSessionChatContext(input, { question: '', shareNatalReading: true })).not.toContain('invitation en deux phrases')
  })

  it('accepte les limites de saisie et maintient le parcours des mineurs sur l’appareil', () => {
    expect(() => steps({ ...base, personalization: { mission: 'é'.repeat(240) } })).not.toThrow()
    expect(() => steps({ ...base, personalization: { wish: 'é'.repeat(241) } })).toThrow(RangeError)
    expect(() => steps({ ...base, personalization: { outcome: 'bad' as never } })).toThrow(RangeError)
    const minor = { ...base, birthDate: '2020-03-14', personalization: { wish, mission, natal } }
    expect(steps(minor)).toContain(mission)
    expect(() => buildSessionChatContext(minor, { consent: true, question: '', shareIntentions: true })).toThrow(RangeError)
  })
})
