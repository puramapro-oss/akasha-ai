export interface NatalPlace {
  name: string
  latitude: number
  longitude: number
  zone: string
}

export interface ListedNatalPlace extends NatalPlace {
  country: string
  region: string
  names: string[]
}

// Preserve non-Latin scripts and their marks. GeoNames' supplied ASCII name
// provides a second, searchable spelling where one exists.
function searchKey(value: string): string {
  return value.trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/ß/g, 'ss')
    .replace(/[\s.'‘’ʼ‐‑–—-]+/g, '')
}

export function parseNatalPlaces(text: string): ListedNatalPlace[] {
  const places: ListedNatalPlace[] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue
    const [name, ascii, country, region, lat, lng, zone] = line.split('\t')
    const latitude = Number(lat)
    const longitude = Number(lng)
    if (!name || !/^[A-Z]{2}$/.test(country ?? '') || !zone || !lat || !lng ||
      !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
      !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
      throw new Error('Répertoire des villes illisible.')
    }
    const names = [searchKey(name)]
    const alias = searchKey(ascii)
    if (alias && alias !== names[0]) names.push(alias)
    places.push({ name, country, region, latitude, longitude, zone, names })
  }
  if (!places.length) throw new Error('Répertoire des villes vide.')
  return places
}

export function searchNatalPlaces(places: ListedNatalPlace[], query: string): ListedNatalPlace[] {
  const key = searchKey(query)
  if (Array.from(key).length < 2) return []
  const exact: ListedNatalPlace[] = []
  const prefixes: ListedNatalPlace[] = []
  for (const place of places) {
    if (place.names.includes(key)) exact.push(place)
    else if (place.names.some(name => name.startsWith(key))) prefixes.push(place)
  }
  // Both lists retain the population order of the source, including homonyms.
  return exact.concat(prefixes)
}

// The static resource and its in-flight request are shared between mounts.
// Searches and selections stay in component state and are never cached here.
let directory: Promise<ListedNatalPlace[]> | undefined

export function loadNatalPlaces(): Promise<ListedNatalPlace[]> {
  directory ??= fetch('/data/natal-places.tsv').then(async response => {
    if (!response.ok) throw new Error('Répertoire des villes indisponible.')
    return parseNatalPlaces(await response.text())
  }).catch(error => {
    directory = undefined
    throw error
  })
  return directory
}
