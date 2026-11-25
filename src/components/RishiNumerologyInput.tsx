import { useEffect, useRef, useState } from 'react'
import { describeRishiNumerologyReading, parseRishiNumerologyReading, type RishiNumerologyReading } from '@/lib/rishi-numerology-reading'

const fileLimit = 4096

export function RishiNumerologyInput({ onChange }: { onChange: (value: RishiNumerologyReading | null) => void }) {
  const [reading, setReading] = useState<RishiNumerologyReading | null>(null)
  const [applied, setApplied] = useState(false)
  const [message, setMessage] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const revision = useRef(0)
  useEffect(() => () => { revision.current++ }, [])

  function clear() {
    revision.current++
    setReading(null)
    setApplied(false)
    setMessage('')
    if (input.current) input.current.value = ''
    onChange(null)
  }

  async function openFile(file?: File) {
    if (!file) return
    clear()
    const current = revision.current
    if (file.size > fileLimit) {
      setMessage('Ce fichier dépasse 4 Kio. Choisis uniquement le résumé exporté par RISHI.')
      return
    }
    try {
      const value = parseRishiNumerologyReading(JSON.parse(await file.text()))
      if (revision.current === current) setReading(value)
    } catch {
      if (revision.current === current) setMessage('Fichier incompatible. Choisis le résumé de numérologie JSON v1 exporté depuis RISHI.')
    }
  }

  return (
    <fieldset className="space-y-3 rounded-xl border border-white/20 p-4">
      <legend className="px-1 font-medium">Ma lecture RISHI (facultative)</legend>
      <label className="block text-sm">
        Importer le résumé de numérologie RISHI
        <input ref={input} type="file" accept=".json,application/json"
          className="mt-2 block w-full text-sm"
          onChange={event => { void openFile(event.target.files?.[0]) }} />
      </label>
      <p className="text-xs text-white/70">Depuis la numérologie de RISHI, exporte le résumé JSON puis ouvre-le ici. Tu choisis ensuite si tu l’ajoutes à ta séance.</p>
      {message && <p role="alert" className="text-sm text-rose-200">{message}</p>}
      {reading && <div className="space-y-2">
        <p aria-live="polite" className="text-sm">{describeRishiNumerologyReading(reading)}</p>
        {applied
          ? <p role="status" className="text-sm text-cyan-100">Lecture ajoutée à ta séance.</p>
          : <button type="button" className="rounded-lg border border-cyan-200/35 px-3 py-2 text-sm text-cyan-100"
              onClick={() => { setApplied(true); onChange(reading) }}>Utiliser cette lecture dans ma séance</button>}
        <button type="button" className="rounded-lg px-3 py-2 text-sm underline" onClick={clear}>Effacer la lecture RISHI</button>
      </div>}
    </fieldset>
  )
}
