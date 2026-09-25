import { THEME_OPTIONS, parseTheme, type ThemeId } from '../lib/theme'

export function ThemePicker(props: { theme: ThemeId; onChange: (theme: ThemeId) => void }) {
  const { theme, onChange } = props
  return (
    <label className="theme-picker">
      <span className="theme-picker__label">Theme</span>
      <select aria-label="Theme" value={theme} onChange={(e) => onChange(parseTheme(e.target.value))}>
        {THEME_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
