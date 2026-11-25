import type { NatalTimeWindow } from '@/lib/natal-time-window'
import { zodiacSignNames } from '@/lib/symbolic-cycles'

export function EstimatedNatalDetails({ reading, zodiacLabel }: { reading: NatalTimeWindow; zodiacLabel: string }) {
  const angles = [
    { label: 'Ascendant', signs: reading.ascendantSigns },
    { label: 'Milieu du ciel', signs: reading.midheavenSigns },
  ]
  return (
    <div aria-live="polite" className="space-y-3 border-t border-white/20 pt-4">
      <h3 className="text-lg font-semibold">Thème avec une heure estimée</h3>
      <p className="text-sm text-violet-100">{zodiacLabel} · ±{reading.minutes} minutes</p>
      <p className="text-sm">Le calcul couvre {reading.samples} instants espacés d’une minute, bornes comprises. Deux signes peuvent apparaître si la position change de signe ou en frôle la limite. Un changement très bref entre deux mesures peut échapper au calcul.</p>
      <table aria-label="Signes observés dans la fourchette" className="w-full text-left text-sm">
        <thead><tr><th scope="col">Repère</th><th scope="col">Signes observés</th></tr></thead>
        <tbody>{[...reading.positions, ...angles].map(p => (
          <tr key={p.label} className="border-t border-white/15"><th scope="row" className="py-2 pr-4 font-medium">{p.label}</th>
            <td>{p.signs.length ? zodiacSignNames(p.signs) : 'Indéterminé sur cette fourchette'}</td></tr>
        ))}</tbody>
      </table>
      <p className="text-xs text-white/70">Les angles nécessitent les coordonnées du lieu et un résultat défini à chaque mesure. Un saut d’au moins un signe entre deux mesures rend aussi l’ascendant incertain. Les degrés, maisons, aspects et l’ascendant des profections sont réservés au calcul avec une heure précise.</p>
      <a href="#session-title" className="text-sm text-cyan-200 underline">Revenir à ma séance</a>
    </div>
  )
}
