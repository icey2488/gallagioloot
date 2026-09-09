import { ASSUMPTIONS } from '@engine/core/rank'

const CYA =
  "GallagioLoot prices your bonus roll. It does not know your guild's kill order, your luck, or Blizzard's undocumented loot rules. The knockout-sharing behavior across specs is community-reported, not documented. Sim data is only as good as the sim you pasted."

const DELVES_NOTE =
  'Delves and Prey Hunts are bonus roll targets but are not simmed; only worth a roll if that is the only content you run.'

/** Fixed on every screen. Disclaimers live only here -- never inline in tables or on the recommendation card. */
export function Footer() {
  return (
    // tabIndex so the scrollable region (overflow-y: auto, capped height) is keyboard-reachable -- WCAG 2.1.1.
    <footer className="app-footer" tabIndex={0}>
      <div className="app-footer__columns">
        <div className="app-footer__col app-footer__col--main">
          <p>{CYA}</p>
          <ul>
            {ASSUMPTIONS.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </div>
        <div className="app-footer__col app-footer__col--aside">
          <p>{DELVES_NOTE}</p>
        </div>
      </div>
    </footer>
  )
}
