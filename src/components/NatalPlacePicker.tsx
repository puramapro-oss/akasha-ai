'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { loadNatalPlaces, searchNatalPlaces, type ListedNatalPlace, type NatalPlace } from '@/lib/natal-places'

const countryNames = new Intl.DisplayNames(['fr'], { type: 'region' })
const pageSize = 8
const actionClass = 'rounded-lg border border-cyan-200/35 px-3 py-2 text-sm text-cyan-100'

export function NatalPlacePicker({ onChoose }: { onChoose: (place: NatalPlace) => void }) {
  const [state, setState] = useState<'closed' | 'loading' | 'ready' | 'error'>('closed')
  const [places, setPlaces] = useState<ListedNatalPlace[]>([])
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(pageSize)
  const request = useRef(0)
  const fieldId = useId()
  const helpId = useId()
  const results = useMemo(() => searchNatalPlaces(places, query), [places, query])
  useEffect(() => () => { request.current++ }, [])

  async function openDirectory() {
    const current = ++request.current
    setState('loading')
    try {
      const next = await loadNatalPlaces()
      if (current === request.current) {
        setPlaces(next)
        setState('ready')
      }
    } catch {
      if (current === request.current) setState('error')
    }
  }

  return (
    <div className="space-y-2">
      {state === 'closed' && <button type="button" className={actionClass} onClick={openDirectory}>Rechercher une ville</button>}
      {state !== 'closed' && <>
        <label htmlFor={fieldId} className="block text-sm">Ville de naissance</label>
        <input id={fieldId} type="text" autoComplete="off" spellCheck={false}
          className="w-full rounded-lg border border-white/25 bg-[#14141e] p-3 text-white"
          value={query} aria-describedby={helpId} onChange={event => { setQuery(event.target.value); setLimit(pageSize) }} />
        <p id={helpId} className="text-xs text-white/70">Saisis au moins deux caractères. La recherche se fait sur ton appareil. Tu peux aussi saisir le fuseau et les coordonnées à la main.</p>
        <p role="status" className="text-sm text-white/75">
          {state === 'loading' && 'Chargement du répertoire des villes…'}
          {state === 'ready' && Array.from(query.trim()).length >= 2 && (results.length
            ? `${results.length} ville${results.length > 1 ? 's' : ''} trouvée${results.length > 1 ? 's' : ''}.`
            : 'Aucune ville trouvée. Essaie une autre orthographe ou saisis les coordonnées à la main.')}
        </p>
        {state === 'error' && <div className="space-y-2">
          <p role="alert" className="text-sm text-rose-200">Le répertoire des villes est indisponible.</p>
          <button type="button" className={actionClass} onClick={openDirectory}>Réessayer</button>
        </div>}
        {state === 'ready' && results.length > 0 && <ul aria-label="Villes trouvées" className="space-y-1">
          {results.slice(0, limit).map((place, index) => (
            <li key={index}><button type="button" className="w-full rounded-lg border border-white/20 px-3 py-2 text-left text-sm hover:bg-white/10 focus-visible:outline-cyan-200"
              onClick={() => {
                onChoose({ name: place.name, latitude: place.latitude, longitude: place.longitude, zone: place.zone })
                setQuery('')
                setLimit(pageSize)
              }}>
              <strong>{place.name}</strong> · {countryNames.of(place.country) ?? place.country}{place.region && ` · région ${place.region}`} · {place.latitude}°, {place.longitude}°
            </button></li>
          ))}
        </ul>}
        {state === 'ready' && results.length > limit && <button type="button" className={actionClass}
          onClick={() => setLimit(value => value + pageSize)}>Afficher plus de villes</button>}
      </>}
      <p className="text-xs text-white/65">Données des villes fournies par <a className="underline" href="https://www.geonames.org/">GeoNames</a> sous licence <a className="underline" href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.</p>
    </div>
  )
}
