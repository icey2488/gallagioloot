import { ChipStack } from './ChipStack'

export function CharacterSwitcher(props: {
  keys: string[]
  currentKey: string | null
  onSwitch: (key: string) => void
  voidcoreCount: number
  onVoidcoreChange: (count: number) => void
}) {
  const { keys, currentKey, onSwitch, voidcoreCount, onVoidcoreChange } = props

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {keys.length > 0 && (
        <select aria-label="Switch character" value={currentKey ?? ''} onChange={(e) => e.target.value && onSwitch(e.target.value)}>
          <option value="" disabled>
            Switch character…
          </option>
          {keys.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      )}
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <ChipStack count={voidcoreCount} />
        <input
          type="number"
          min={0}
          value={voidcoreCount}
          onChange={(e) => onVoidcoreChange(Number(e.target.value) || 0)}
          style={{ width: 48 }}
          aria-label="Voidcore count"
        />
      </label>
    </div>
  )
}
