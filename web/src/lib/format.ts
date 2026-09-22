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
  const last = difficulty.split('-').pop() ?? difficulty
  return last.charAt(0).toUpperCase() + last.slice(1)
}
