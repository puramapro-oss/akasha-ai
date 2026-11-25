const schema = 'purama.rishi.numerology.v1'
const fields = ['schema', 'pythagoreanLifePath', 'chaldeanBirth', 'loShuMissing', 'tantricSoul', 'kua'] as const

export interface RishiNumerologyReading {
  schema: typeof schema
  pythagoreanLifePath: number
  chaldeanBirth: number
  loShuMissing: number[]
  tantricSoul: number
  kua: number | null
}

function digit(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 9
}

function traditionalNumber(value: unknown, masters: readonly number[]): value is number {
  return digit(value) || (typeof value === 'number' && masters.includes(value))
}

function isLoShuList(value: unknown): value is number[] {
  if (!Array.isArray(value) || value.length > 9) return false
  let previous = 0
  for (const entry of value) {
    if (!digit(entry) || entry <= previous) return false
    previous = entry
  }
  return true
}

export function parseRishiNumerologyReading(value: unknown): RishiNumerologyReading {
  const invalid = () => new RangeError('Choisis le résumé de numérologie exporté par RISHI au format JSON v1.')
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid()
  const obj = value as Record<string, unknown>
  if (Object.keys(obj).length !== fields.length || !fields.every(key => Object.hasOwn(obj, key))) throw invalid()
  const { pythagoreanLifePath, chaldeanBirth, loShuMissing, tantricSoul, kua } = obj
  if (obj.schema !== schema
    || !traditionalNumber(pythagoreanLifePath, [11, 22, 33, 44])
    || !digit(chaldeanBirth)
    || !isLoShuList(loShuMissing)
    || !traditionalNumber(tantricSoul, [11, 22])
    || !(kua === null || (digit(kua) && kua !== 5))) throw invalid()
  return { schema, pythagoreanLifePath, chaldeanBirth, loShuMissing: [...loShuMissing], tantricSoul, kua }
}

export function describeRishiNumerologyReading(reading: RishiNumerologyReading): string {
  const { pythagoreanLifePath, chaldeanBirth, loShuMissing, tantricSoul, kua } = parseRishiNumerologyReading(reading)
  return [
    `Chemin de vie pythagoricien ${pythagoreanLifePath}`,
    `nombre de naissance chaldéen ${chaldeanBirth}`,
    loShuMissing.length ? `chiffres absents de la grille Lo Shu (${loShuMissing.join(', ')})` : 'grille Lo Shu complète',
    `nombre de l’âme tantrique ${tantricSoul}`,
    kua === null ? 'Kua non renseigné' : `Kua ${kua}`,
  ].join(' · ')
}
