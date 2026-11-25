import { describe, expect, it } from 'vitest'
import { creativeExercise } from './session-creation'
import { composeSpiritualSession, previewSessionChatContext, type SpiritualSessionInput } from './spiritual-session'

const wish = 'Organiser un atelier de dessin mais seulement en visio'
const mission = 'Partager le dessin avec mes voisins'
const natal = { id: 'body:Sun', group: 'Astres' as const, label: 'Soleil en Bélier', question: 'Quelle priorité veux-tu choisir ?', basis: ['détail local'] }
const base: SpiritualSessionInput = {
  mode: 'mixed', focus: 'custom', minutes: 1, guidance: 'quiet',
  useAstrology: false, useNumerology: false, birthDate: '1990-03-14', asOfDate: '2026-11-25',
  techniques: ['mantra', 'observation', 'writing', 'visualization', 'kindness', 'prayer'],
  personalization: { wish, mission, outcome: 'draft', natal },
}

describe('respect des contraintes exprimées et du rythme de la séance', () => {
  it('propose une vraie invitation compatible avec le seul format demandé', () => {
    for (const suffix of ['mais seulement en visio', 'uniquement en visioconférence', 'en visio exclusivement']) {
      const exercise = creativeExercise('Je voudrais organiser un atelier de dessin ' + suffix, mission, 'draft')
      expect(exercise.draft?.title).toBe('Invitation à adapter')
      expect(exercise.draft?.text).toContain('Bonjour ! J’aimerais organiser un atelier de dessin en visioconférence.')
      expect(exercise.draft?.text).toContain('participer à distance')
      expect(exercise.draft?.text).toContain(mission)
      expect(exercise.prompt).not.toMatch(/lieu|présentiel/i)
    }
    expect(creativeExercise(wish, '', 'choice').prompt).toContain('deux durées ou deux activités')
    const inPerson = creativeExercise('Préparer une rencontre en présentiel uniquement', '', 'draft')
    expect(inPerson.draft?.text).toContain('Quel lieu vous serait accessible')
    expect(inPerson.draft?.text).not.toMatch(/visio|distance/i)
  })

  it('préserve les mots de la personne sans trancher une contradiction ou une exclusion', () => {
    for (const request of [
      'Organiser un atelier en présentiel mais seulement en visio',
      'Organiser un atelier en salle ou en visio',
      'Organiser un atelier mais pas en visio',
      'Organiser un atelier mais je refuse la visio',
      'Organiser un atelier puis annuler la rencontre',
    ]) {
      const exercise = creativeExercise(request, '', 'draft')
      expect(exercise.prompt).toBeUndefined()
      expect(exercise.draft?.title).toBe('Première note d’intention')
      expect(exercise.draft?.text).toContain(request)
      expect(exercise.draft?.text).not.toContain('Bonjour !')
    }
  })

  it('protège le temps des six techniques, même avec mission, thème et résultat créatif', () => {
    for (const [minutes, guidance] of [[1, 'guided'], [2, 'guided'], [30, 'quiet']] as const) {
      const plan = composeSpiritualSession({ ...base, minutes, guidance })
      const middle = plan.steps.slice(1, -1)
      expect(plan.steps.reduce((total, step) => total + step.seconds, 0)).toBe(minutes * 60)
      expect(middle.map(step => step.id)).toEqual(base.techniques)
      expect(plan.steps[0].text).toBe(natal.question)
      for (const step of middle) {
        expect(step.text.length).toBeLessThan(70)
        expect(step.text).not.toMatch(/visio|priorité|atelier/)
      }
      expect(plan.steps.at(-1)?.text).toContain('ta rencontre en visio')
      expect(plan.starterDraft?.text).toContain('atelier de dessin en visioconférence')
    }
  })

  it('met à jour l’envie et la mission hors minuterie sans réintroduire les préférences précédentes', () => {
    const edit = { wish: 'Composer une mélodie', mission: 'Apprendre à écouter', outcome: 'action' as const }
    const original = composeSpiritualSession({ ...base, personalization: { wish, mission, outcome: 'action' } })
    const revised = composeSpiritualSession({ ...base, personalization: edit })
    expect(original.reflection).toContain(mission)
    expect(revised.reflection).toContain(edit.mission)
    expect(revised.reflection).toContain(edit.wish)
    expect(revised.reflection).not.toContain(mission)
    expect(revised.steps.at(-1)?.text).toContain('ta création musicale')
    const cleared = composeSpiritualSession({ ...base, personalization: {} })
    expect(cleared.reflection).toBeNull()
    expect(cleared).toEqual(composeSpiritualSession({ ...base, personalization: undefined }))
  })

  it('garde le rappel complet d’une heure de naissance estimée hors des étapes courtes', () => {
    const question = 'Heure estimée à ±30 minutes. Signes observés à intervalles d’une minute, bornes comprises. ' + natal.question
    const input = { ...base, personalization: { natal: { ...natal, question } } }
    const plan = composeSpiritualSession(input)
    expect(plan.steps[0].text).toBe('Pense au repère natal que tu as choisi.')
    expect(plan.reflection).toContain(question)
    expect(plan.steps.map(step => step.text).join(' ')).not.toContain('±30 minutes')
    expect(previewSessionChatContext(input, { question: '' })).not.toContain('±30 minutes')
    expect(previewSessionChatContext(input, { question: '', shareNatalReading: true })).toContain(question)
  })

  it('recompose le message court avec les seuls détails autorisés', () => {
    for (const shareIntentions of [false, true]) for (const shareNatalReading of [false, true]) {
      const prompt = previewSessionChatContext(base, { question: '', shareIntentions, shareNatalReading })
      expect(prompt.includes(wish)).toBe(shareIntentions)
      expect(prompt.includes(mission)).toBe(shareIntentions)
      expect(prompt.includes('visio')).toBe(shareIntentions)
      expect(prompt.includes(natal.label)).toBe(shareNatalReading)
      expect(prompt.includes(natal.question)).toBe(shareNatalReading)
      expect(prompt).not.toContain(natal.basis[0])
      expect(prompt).not.toContain(base.birthDate)
    }
  })
})
