/**
 * Shared "is this gap small enough to call a toss-up" rule, used by rank.ts (top boss vs.
 * runner-up) and vault.ts (voidcore vs. vault item). A gap is a toss-up when it's smaller
 * than a fixed floor, smaller than a percentage of a reference value (the bigger/leading
 * figure), or -- when both sides carry a known error margin -- smaller than that combined
 * margin (the ranking is within sim noise).
 */
export function isTossUpGap(
  gap: number,
  referenceValue: number,
  opts: { pctOfReference: number; floor?: number; errorBand?: number }
): boolean {
  if (opts.errorBand !== undefined && gap < opts.errorBand) return true
  const fixedBand = Math.max(opts.floor ?? 0.1, opts.pctOfReference * referenceValue)
  return gap < fixedBand
}
