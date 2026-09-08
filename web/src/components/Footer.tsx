import { ASSUMPTIONS } from '@engine/core/rank'

const CYA =
  "GallagioLoot prices your bonus roll. It does not know your guild's kill order, your luck, or Blizzard's undocumented loot rules. The knockout-sharing behavior across specs is community-reported, not documented. Sim data is only as good as the sim you pasted."

/** Fixed on every screen. Disclaimers live only here -- never inline in tables or on the recommendation card. */
export function Footer() {
  return (
    <footer className="app-footer">
      <p>{CYA}</p>
      <ul>
        {ASSUMPTIONS.map((assumption) => (
          <li key={assumption}>{assumption}</li>
        ))}
      </ul>
    </footer>
  )
}
