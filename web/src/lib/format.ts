/** "raid-vault-heroic" -> "Heroic" */
export function formatDifficulty(difficulty: string): string {
  const last = difficulty.split('-').pop() ?? difficulty
  return last.charAt(0).toUpperCase() + last.slice(1)
}
