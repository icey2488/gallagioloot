/**
 * The item ids of a Raidbots profile's equipped gear (`rawFormData.droptimizer.equipped`:
 * slot name -> item object carrying a numeric `id`). Sorted and de-duplicated (a ring and a
 * trinket pair can share an id); anything malformed is skipped.
 */
export function extractEquippedItemIds(equipped: unknown): number[] {
  if (typeof equipped !== 'object' || equipped === null || Array.isArray(equipped)) return []

  const ids = new Set<number>()
  for (const item of Object.values(equipped)) {
    if (typeof item !== 'object' || item === null || !('id' in item)) continue
    const id = (item as { id: unknown }).id
    if (typeof id === 'number' && Number.isInteger(id) && id > 0) ids.add(id)
  }
  return Array.from(ids).sort((a, b) => a - b)
}
