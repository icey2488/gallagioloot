import { useState } from 'react'
import { ASSUMPTIONS } from '@engine/core/rank'

const CYA =
  "GallagioLoot prices your bonus roll. It does not know your guild's kill order, your luck, or Blizzard's undocumented loot rules. The knockout-sharing behavior across specs is community-reported, not documented. Sim data is only as good as the sim you pasted."

const DELVES_NOTE =
  'Delves and Prey Hunts are bonus roll targets but are not simmed; only worth a roll if that is the only content you run.'

/** Renders in-flow after the active screen's content, inside the same max-width column. Disclaimers live only here -- never inline in tables or on the recommendation card. */
export function Footer() {
  const [assumptionsOpen, setAssumptionsOpen] = useState(false)

  return (
    <footer className="app-footer panel">
      <div className="app-footer__columns">
        <div className="app-footer__col app-footer__col--main">
          <p>{CYA}</p>
          <details className="app-footer__assumptions" onToggle={(e) => setAssumptionsOpen(e.currentTarget.open)}>
            <summary>{assumptionsOpen ? 'Hide assumptions' : 'Show assumptions'}</summary>
            <ul>
              {ASSUMPTIONS.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          </details>
        </div>
        <div className="app-footer__col app-footer__col--aside">
          <p>{DELVES_NOTE}</p>
        </div>
      </div>
    </footer>
  )
}
