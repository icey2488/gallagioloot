import { SPECS } from '@engine/lookup/specs'

/** Loot-spec picker in the header, next to the character switcher. Lists all 40 specs, grouped by class. */
export function LootSpecPicker(props: { lootSpecId: number | null; onChange: (specId: number) => void }) {
  const { lootSpecId, onChange } = props

  const classNames = [...new Set(SPECS.map((s) => s.className))]

  return (
    <select aria-label="Loot spec" value={lootSpecId ?? ''} onChange={(e) => e.target.value && onChange(Number(e.target.value))}>
      <option value="" disabled>
        Loot spec…
      </option>
      {classNames.map((className) => (
        <optgroup key={className} label={className}>
          {SPECS.filter((s) => s.className === className).map((s) => (
            <option key={s.specId} value={s.specId}>
              {s.specName}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
