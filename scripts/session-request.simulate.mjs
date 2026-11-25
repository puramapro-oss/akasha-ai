import assert from 'node:assert/strict'
import { suggestSessionPreferences as suggest } from '../src/lib/session-request.ts'

const fixed = [
  ['Je veux trois minutes de silence pour préparer une décision, sans astrologie.', {minutes:3, guidance:'quiet', focus:'discernment', useAstrology:false}],
  ['Je veux une pratique guidée de bienveillance, sans astrologie ni numérologie sacrée.', {focus:'kindness', guidance:'guided', useAstrology:false, useNumerology:false}],
  ['Je souhaite méditer cinq minutes, en mode spirituel.', {minutes:5, mode:'spiritual'}],
  ['Je souhaite une séance de 6min en mode pratique.', {minutes:6, mode:'practical', useAstrology:false, useNumerology:false}],
  ['En mode laïque, six minutes de concentration.', {focus:'attention', minutes:6, mode:'practical', useAstrology:false, useNumerology:false}],
  ['Séance de vingt-et-une minutes pour me recentrer.', {minutes:21, focus:'attention'}],
  ['Méditation entre 2 et 4 minutes.', {}],
  ['Je veux trois ou cinq minutes de méditation.', {}],
  ['Méditation de 2 à 4 minutes.', {}],
  ['Séance de 32 minutes.', {}],
  ['Séance de quatre-vingt-trois minutes.', {}],
  ['Séance de quarante deux minutes.', {}],
  ['Séance de 2,5 minutes.', {}],
  ['Séance de 0.5 minutes.', {}],
  ['Méditation de trois minutes et trente secondes.', {}],
  ['Méditation pendant trois minutes et demie.', {}],
  ['Je veux environ cinq minutes de méditation.', {}],
  ['Je veux dix minutes maximum de méditation.', {}],
  ['Séance de 3 minutes, puis de 4 minutes.', {}],
  ['Je veux du silence et je ne veux pas de silence.', {}],
  ['Je veux du silence ou une pratique guidée.', {}],
  ['Je veux un exercice de discernement et de gratitude.', {}],
  ['Je veux une séance en mode mixte et en mode spirituel.', {}],
  ['Je demande le mode factuel, sans astro ni numérologie.', {mode:'practical', useAstrology:false, useNumerology:false}],
  ['Avec astrologie et numérologie sacrée.', {mode:'mixed',useAstrology:true,useNumerology:true}],
  ['Sans astrologie et avec numérologie.', {mode:'mixed',useAstrology:false,useNumerology:true}],
  ['Je veux la numérologie, mais sans numérologie.', {}],
  ["Je n’exclus pas l’astrologie.", {}],
  ['Pas seulement la numérologie.', {}],
  ['Je ne veux pas de numérologie.', {useNumerology:false}],
  ['Je veux une séance sans numérologie, mais avec astrologie.', {mode:'mixed',useAstrology:true,useNumerology:false}],
  ["Elle m’a dit : « je veux une séance en silence, sans astrologie ».", {}],
  ['Ma fille veut trois minutes de gratitude.', {}],
  ['Traduis « Je veux un temps de gratitude » en italien.', {}],
  ['Résume ce texte sur la méditation en trois minutes.', {}],
  ['Une recette pour cuire les pâtes 9 minutes.', {}],
  ['Comment réparer un vélo en 8 minutes ?', {}],
  ['Je veux créer un tableau de recettes.', {}],
  ['Je veux une pratique en mode factuel. Elle veut dix minutes de silence.', {mode:'practical', useAstrology:false, useNumerology:false}],
  ['Je veux une séance avec astrologie et numérologie.', {mode:'mixed',useAstrology:true,useNumerology:true}],
  ['Combine l’astrologie et la numérologie.', {mode:'mixed',useAstrology:true,useNumerology:true}],
  ['En mode spirituel, combine l’astrologie et la numérologie.', {mode:'spiritual',useAstrology:true,useNumerology:true}],
  ['Je veux une séance avec astrologie et numérologie en mode pratique.', {mode:'practical',useAstrology:false,useNumerology:false}],
  ['Qu’est-ce que je peux apprendre avec la numérologie ?', {}],
  ['Je ne veux pas de séance avec astrologie.', {useAstrology:false}],
  ['Je veux une séance avec astrologie, mais sans astrologie.', {}],
  ['Je veux une séance avec astrologie ou numérologie.', {}],
  ['Je veux une séance avec astrologie non souhaitée.', {useAstrology:false}],
  ['La numérologie ne me convient pas.', {useNumerology:false}],
  ['Je veux méditer. Il faut redémarrer le serveur dans 20 minutes.', {}],
  ['Je veux méditer. Deux minutes.', {minutes:2}],
  ['Je veux du silence. Pas de numérologie.', {guidance:'quiet',useNumerology:false}],
  ['Est-ce que tu peux combiner l’astrologie et la numérologie pour une séance de 12 minutes ?', {mode:'mixed',useAstrology:true,useNumerology:true,minutes:12}],
  ['Est-ce que vous pourriez associer la numérologie et l’astrologie ?', {mode:'mixed',useNumerology:true,useAstrology:true}],
  ['Est-ce que tu peux expliquer la différence entre astrologie et numérologie pour une séance ?', {}],
  ['Est-ce que je peux essayer la numérologie ?', {}],
  ["Je veux essayer l'astrologie mais pas la numérologie.", {mode:'mixed',useAstrology:true,useNumerology:false}],
  ["Je ne veux pas essayer l'astrologie.", {useAstrology:false}],
  ['Je veux une pratique non religieuse.', {mode:'practical',useAstrology:false,useNumerology:false}],
  ['Je veux une séance laïque, avec astrologie.', {mode:'practical',useAstrology:false,useNumerology:false}],
  ['Je ne veux pas une séance laïque.', {}],
  ['', {}],
  [null, {}],
  [' '.repeat(2001) + 'méditation', {}],
]
for (const [text, expected] of fixed) assert.deepEqual(suggest(text), expected, String(text))

const durations = [[1,'une'],[2,'deux'],[3,'trois'],[4,'quatre'],[5,'cinq'],[10,'dix'],[11,'onze'],[16,'seize'],[17,'dix-sept'],[19,'dix-neuf'],[20,'vingt'],[21,'vingt et une'],[22,'vingt-deux'],[28,'vingt-huit'],[30,'trente']]
const focuses = [
  ['attention', 'me concentrer'], ['kindness', 'cultiver la compassion'],
  ['discernment', 'préparer une décision'], ['gratitude', 'cultiver la gratitude'],
]
const options = [
  ['', {}], [', sans astrologie', {useAstrology:false}],
  [', sans numérologie', {useNumerology:false}], [', sans astrologie ni numérologie', {useAstrology:false,useNumerology:false}],
  [', avec astrologie et numérologie', {useAstrology:true,useNumerology:true}], [', sans astrologie mais avec numérologie', {useAstrology:false,useNumerology:true}],
]
const guidance = [['quiet','en silence'],['guided','pas à pas']]
const modes = [['practical','factuel'],['mixed','mixte'],['spiritual','spirituel']]
const tested = new Set()
function check(text, expected) {
  assert.ok(!tested.has(text), 'duplicate generated request')
  tested.add(text)
  assert.deepEqual(suggest(text), expected, text)
}
for (const [minutes, word] of durations)
  for (const written of [String(minutes), word])
    for (const [focus, intention] of focuses)
      for (const [mode, label] of modes)
        for (const [key, style] of guidance)
          for (const [suffix, flags] of options) {
            const phrase = `Je veux une séance de ${written} ${minutes === 1 ? 'minute' : 'minutes'} ${style} en mode ${label} pour ${intention}${suffix}.`
            check(phrase, {minutes, guidance:key, mode, focus, ...(mode === 'practical' ? {useAstrology:false,useNumerology:false} : flags)})
            check(`Ma sœur a dit : « ${phrase} »`, {})
            check(`Traduis cette demande : "${phrase}"`, {})
          }
process.stdout.write(JSON.stringify({fixed:fixed.length, distinctGenerated:tested.size, total:fixed.length+tested.size}) + '\n')
