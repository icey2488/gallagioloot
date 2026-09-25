// Roll-target identity and labels across several loaded reports. Pure.
import type { NormalizedReport, TargetKind } from '../types'

type ReportIdentity = Pick<NormalizedReport, 'difficulty' | 'targetKind' | 'track'>

const RAID_DIFFICULTY_LABELS: Record<string, string> = { lfr: 'LFR', normal: 'Normal', heroic: 'Heroic', mythic: 'Mythic' }

/** Payloads from before Mythic+ support carry no `targetKind`; they were always raid-shaped. */
export function targetKindOf(report: Pick<NormalizedReport, 'targetKind'>): TargetKind {
  return report.targetKind ?? 'raid'
}

/**
 * The `difficulty` a knockout state for this report is keyed under. Raid: the report's own
 * difficulty string, exactly as before, so every existing saved knockout state keeps loading
 * under the same storage key. Mythic+: per upgrade track (e.g. "mplus-myth"), since the
 * roll's item track -- not the key's exact level -- is what the knockout pool is shared across.
 */
export function knockoutDifficulty(report: ReportIdentity): string {
  if (targetKindOf(report) !== 'mplus') return report.difficulty
  const track = report.track?.name?.toLowerCase()
  return track ? `mplus-${track}` : `mplus-${report.difficulty}`
}

/** Unique across every loaded report: the same boss on two difficulties is two targets. */
export function targetKey(report: ReportIdentity, encounterId: number): string {
  return `${knockoutDifficulty(report)}:${encounterId}`
}

/** Lowest key level of an M+ report: `track.keyLevelMin`, else the trailing number of the difficulty id ("dungeon-mythic-weekly10" -> 10). */
export function keyLevelOf(report: ReportIdentity): number | undefined {
  if (report.track?.keyLevelMin !== undefined) return report.track.keyLevelMin
  const match = /(\d+)$/.exec(report.difficulty)
  return match ? Number(match[1]) : undefined
}

/**
 * Human label for a report's difficulty or track: raid "Mythic" (from "raid-vault-mythic" or
 * QE Live's bare "mythic"); Mythic+ "+10 (Myth)" -- never the raw "Weekly10" id fragment.
 */
export function difficultyLabel(report: ReportIdentity): string {
  if (targetKindOf(report) === 'mplus') {
    const level = keyLevelOf(report)
    const levelText = level !== undefined ? `+${level}` : 'Mythic+'
    return report.track?.name ? `${levelText} (${report.track.name})` : levelText
  }
  const last = (report.difficulty.split('-').pop() ?? report.difficulty).toLowerCase()
  return RAID_DIFFICULTY_LABELS[last] ?? last.charAt(0).toUpperCase() + last.slice(1)
}

/** A BossEval's target key, falling back to its encounter id for hand-built evals that predate target keys. */
export function evalKey(boss: { targetKey?: string; encounterId: number }): string {
  return boss.targetKey ?? String(boss.encounterId)
}

/** Only Mythic+ targets are repeatable (one roll per completed key, and a dungeon can be rerun). */
export function isRepeatable(boss: { kind?: TargetKind }): boolean {
  return boss.kind === 'mplus'
}
