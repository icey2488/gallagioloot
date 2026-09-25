const RAID_DIFFICULTY_WORDS = new Set(['lfr', 'normal', 'heroic', 'mythic'])

/**
 * "raid-vault-heroic" -> "Heroic" (Raidbots' shape). QE Live reports carry a bare difficulty
 * instead -- a raid difficulty word ("heroic") or a dungeon keystone level ("10") -- see
 * mapDifficulty in src/normalize/qelive.ts. The proxy only ever returns raid/dungeon reports
 * (anything else is rejected with a 422 before it reaches the client -- see
 * UnsupportedContentError), so a `difficulty` outside both shapes means something unexpected
 * got through; render it as "Unknown" rather than a raw fragment like "331".
 */
export function isRecognizedDifficulty(difficulty: string, contentType?: 'raid' | 'dungeon' | string): boolean {
  if (difficulty.startsWith('raid') || difficulty.startsWith('dungeon')) return true
  if (contentType === 'raid') return RAID_DIFFICULTY_WORDS.has(difficulty)
  if (contentType === 'dungeon') return /^\d+$/.test(difficulty)
  return false
}

export function formatDifficulty(difficulty: string, contentType?: 'raid' | 'dungeon' | string): string {
  if (!isRecognizedDifficulty(difficulty, contentType)) return 'Unknown'
  // Raidbots' Mythic+ id ("dungeon-mythic-weekly10") names the key level, never "Weekly10".
  const keyLevel = difficulty.startsWith('dungeon') ? /(\d+)$/.exec(difficulty)?.[1] : undefined
  if (keyLevel) return `+${keyLevel}`
  const last = difficulty.split('-').pop() ?? difficulty
  return last.charAt(0).toUpperCase() + last.slice(1)
}

/**
 * "Sep 22" for a report's sim date (year appended when it isn't `now`'s year), in the viewer's timezone
 * unless `timeZone` is given. Undefined for a missing or unparseable date.
 */
export function formatSimDate(iso: string | undefined, now: Date = new Date(), timeZone?: string): string | undefined {
  if (!iso) return undefined
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return undefined
  const year = (d: Date) => Number(new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone }).format(d))
  const withYear = year(date) !== year(now)
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}), timeZone }).format(date)
}

/** "572,817": a report's baseline DPS/HPS with thousands separators. */
export function formatBaseline(baseline: number): string {
  return Math.round(baseline).toLocaleString('en-US')
}
