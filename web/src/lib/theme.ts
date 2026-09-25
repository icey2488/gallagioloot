export type ThemeId = 'midnight' | 'green' | 'red'
export const THEME_STORAGE_KEY = 'gallagioloot:theme'
export const DEFAULT_THEME: ThemeId = 'midnight'
export const THEME_OPTIONS: ReadonlyArray<{ id: ThemeId; label: string }> = [
  { id: 'midnight', label: 'Midnight' },
  { id: 'green', label: 'Felt green' },
  { id: 'red', label: 'Craps red' },
]

export function parseTheme(value: unknown): ThemeId {
  if (value === 'midnight' || value === 'green' || value === 'red') {
    return value
  }
  return DEFAULT_THEME
}

export function loadTheme(): ThemeId {
  try {
    const result = localStorage.getItem(THEME_STORAGE_KEY)
    return parseTheme(result)
  } catch {
    return DEFAULT_THEME
  }
}

export function saveTheme(id: ThemeId): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id)
  } catch {
    // Storage blocked or full: the choice just doesn't persist.
  }
}

/** Every theme, Midnight included, gets an explicit data-theme so the choice is inspectable; Midnight's CSS is the :root default. */
export function applyTheme(id: ThemeId): void {
  document.documentElement.dataset.theme = id
}
