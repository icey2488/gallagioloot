/**
 * Canonical comparison key for a pasted report URL or bare id: `raidbots:<id>` or `qelive:<id>`, or null
 * when it isn't a recognizable report. Trims, ignores host case, trailing slash, query string and fragment.
 * (Drafted by local Ollama qwen2.5-coder:7b; edited to export it and to take the LAST matching path segment.)
 */
export function normalizeReportUrl(input: string): string | null {
  input = input.trim()
  if (input === '') return null

  try {
    const url = new URL(input)
    const hostname = url.hostname.toLowerCase()
    const pathname = url.pathname.split('/').filter((segment) => segment !== '')

    if (hostname === 'raidbots.com' || hostname.endsWith('.raidbots.com')) {
      const id = pathname.filter((segment) => /^[A-Za-z0-9_-]{22}$/.test(segment)).pop()
      if (id) return `raidbots:${id}`
    } else if (hostname === 'questionablyepic.com' || hostname.endsWith('.questionablyepic.com')) {
      const id = pathname.filter((segment) => /^[a-z]{12}$/.test(segment)).pop()
      if (id) return `qelive:${id}`
    }
  } catch {
    // Not a valid URL, treat as bare id
    if (/^[A-Za-z0-9_-]{22}$/.test(input)) return `raidbots:${input}`
    if (/^[a-z]{12}$/.test(input)) return `qelive:${input}`
  }

  return null
}
