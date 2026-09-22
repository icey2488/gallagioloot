/**
 * Content-type classification shared by the Raidbots and QE Live normalizers. Bonus rolls
 * only exist for raid bosses and Mythic+ dungeons, so anything else (crafted gear, PvP,
 * Delves, or content we don't recognize) is rejected before a NormalizedReport is built.
 *
 * The Raidbots signal is `instanceLibrary[].type` from live droptimizer data (instances.json
 * agrees: "raid", "dungeon", "professionMidnightEpic"/"professionMidnightPvp"/"professionMidnightRare",
 * "pvp-honor"/"pvp-world"/"pvp-conquest", "delve-mid1"/"delve-mid2", plus non-report container
 * types like "expansion-dungeon"/"mplus-chest"/"catalyst"/"bonus-roll" that never appear as a
 * droptimizer's own instance). QE Live's own `contentType` field ("Raid"/"Dungeon"/"Crafted"/"Delves")
 * is used directly instead.
 */
export type DetectedContentType = 'raid' | 'dungeon' | 'crafted' | 'pvp' | 'delve' | 'other'

type UnsupportedDetectedContentType = Exclude<DetectedContentType, 'raid' | 'dungeon'>

const CONTENT_TYPE_DETAIL: Record<UnsupportedDetectedContentType, string> = {
  crafted: 'This droptimizer is for crafted gear, not a raid boss or Mythic+ dungeon.',
  pvp: 'This droptimizer is for PvP gear, not a raid boss or Mythic+ dungeon.',
  delve: 'This droptimizer is for a Delve, not a raid boss or Mythic+ dungeon.',
  other: 'This report is not for a raid boss or a Mythic+ dungeon.',
}

const HINT = 'Run the droptimizer for a raid or a Mythic+ dungeon; bonus rolls only apply there.'

export class UnsupportedContentError extends Error {
  contentType: UnsupportedDetectedContentType

  constructor(contentType: UnsupportedDetectedContentType) {
    super(CONTENT_TYPE_DETAIL[contentType])
    this.contentType = contentType
  }
}

export function assertSupportedContentType(contentType: DetectedContentType): asserts contentType is 'raid' | 'dungeon' {
  if (contentType === 'raid' || contentType === 'dungeon') return
  throw new UnsupportedContentError(contentType)
}

export function unsupportedContentResponseBody(err: UnsupportedContentError) {
  return { error: 'unsupported_content', contentType: err.contentType, detail: err.message, hint: HINT }
}
