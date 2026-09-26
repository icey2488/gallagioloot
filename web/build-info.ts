import { execFileSync } from 'node:child_process'

function git(args: string[]): string | null {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

/** Read at build time (never hand-typed): the commit being built, and whether the working tree differs from it (untracked files count). Empty sha when git or the checkout is unavailable. */
export function readBuildInfo(): { sha: string; fullSha: string; dirty: boolean } {
  const fullSha = git(['rev-parse', 'HEAD'])
  if (!fullSha) return { sha: '', fullSha: '', dirty: false }
  const sha = git(['rev-parse', '--short', 'HEAD']) ?? fullSha.slice(0, 7)
  const status = git(['status', '--porcelain'])
  return { sha, fullSha, dirty: status === null ? false : status.length > 0 }
}
