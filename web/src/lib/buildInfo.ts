/** Spec version shown in the footer. The single source of truth: bump it here when a spec version ships. */
export const APP_VERSION = 'v2.15'

export type FooterStamp = {
  versionText: string
  shaText: string | null
  commitUrl: string | null
  sourceUrl: string
  licenseUrl: string
}

/** What vite.config.ts injects at build time from `git` (see build-info.ts); empty sha when the build is not inside a git checkout. */
export type BuildInfo = { sha: string; fullSha: string; dirty: boolean }

// Drafted by local Ollama (qwen2.5-coder:7b), edited for this codebase's style (no semicolons).
export function buildFooterStamp(version: string, sha: string, fullSha: string, dirty: boolean): FooterStamp {
  const trimmedSha = sha.trim()
  const trimmedFullSha = fullSha.trim()
  const sourceUrl = 'https://github.com/icey2488/gallagioloot'
  const licenseUrl = `${sourceUrl}/blob/main/LICENSE`

  if (trimmedSha === '') {
    return { versionText: version, shaText: null, commitUrl: null, sourceUrl, licenseUrl }
  }

  const shaText = dirty ? `${trimmedSha}-dirty` : trimmedSha
  const commitUrl = trimmedFullSha !== '' ? `${sourceUrl}/commit/${trimmedFullSha}` : `${sourceUrl}/commit/${trimmedSha}`

  return { versionText: version, shaText, commitUrl, sourceUrl, licenseUrl }
}

/** The build's own stamp. The globals only exist in a vite build/dev server; tests (and any other bundler) get the no-sha stamp. */
export const BUILD_INFO: BuildInfo = {
  sha: typeof __BUILD_SHA__ === 'string' ? __BUILD_SHA__ : '',
  fullSha: typeof __BUILD_FULL_SHA__ === 'string' ? __BUILD_FULL_SHA__ : '',
  dirty: typeof __BUILD_DIRTY__ === 'boolean' ? __BUILD_DIRTY__ : false,
}
