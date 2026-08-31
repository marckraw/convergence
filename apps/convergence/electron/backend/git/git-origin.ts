import { execFile, execFileSync } from 'child_process'
import { promisify } from 'util'
import { normalizeGitHubRemoteUrl } from '../../../src/shared/lib/git-origin.pure'

const execFileAsync = promisify(execFile)

/** The one question both readers ask git. */
const ORIGIN_URL_ARGS = ['config', '--get', 'remote.origin.url'] as const

const ORIGIN_READ_OPTIONS = {
  timeout: 5_000,
  encoding: 'utf8',
} as const

function firstOriginUrl(output: string): string | null {
  const url = output.trim()
  return url.length > 0 ? url : null
}

/**
 * Reads the `origin` remote URL of a local repository synchronously. Used on
 * the session start path, where the caller cannot await; `git config` is a
 * local file read and returns immediately. Returns null when the directory is
 * not a repository or has no origin remote.
 */
export function readGitOriginUrl(repositoryPath: string): string | null {
  try {
    return firstOriginUrl(
      execFileSync('git', [...ORIGIN_URL_ARGS], {
        cwd: repositoryPath,
        ...ORIGIN_READ_OPTIONS,
      }),
    )
  } catch {
    return null
  }
}

/**
 * What a daemon would clone for a local checkout: its `origin`, rewritten into
 * the form the remote execution host accepts, or null when there is nothing a
 * daemon could clone (MAR-2689).
 *
 * One rewrite because it is one question asked from two places that must
 * never answer it differently: the strip shows this value as the place a
 * remote session will work, and the start path sends it. `main/index.ts` used
 * to spell the read and the rewrite out inline, which was fine while it was
 * the only caller; the moment the renderer had to *show* the same repository
 * before send, spelling it out a second time would have made "what the strip
 * says" and "what the send carries" two derivations of one fact — the exact
 * shape this era exists to end (MAR-2619).
 *
 * Synchronous, and staying that way: this is the start path's reader, whose
 * caller cannot await. The renderer asks the same question through the async
 * twin below.
 */
export function readCloneableRepositoryUrl(
  repositoryPath: string,
): string | null {
  const origin = readGitOriginUrl(repositoryPath)
  return origin ? normalizeGitHubRemoteUrl(origin) : null
}

/**
 * The same answer, without stopping the main process to get it (MAR-2689).
 *
 * The IPC door the composer reads through is new, and a new door does not
 * inherit the old one's excuse. `execFileSync` blocks the whole main process
 * for as long as git takes — up to the five-second timeout on a slow or
 * network-backed filesystem — and the renderer's question is one nothing is
 * waiting on. The start path keeps the synchronous reader because its caller
 * genuinely cannot await; this one has always been able to.
 *
 * The rewrite is the same function, so the strip and the wire still state one
 * value: only the way git is invoked differs.
 */
export async function readCloneableRepositoryUrlAsync(
  repositoryPath: string,
): Promise<string | null> {
  const origin = await readGitOriginUrlAsync(repositoryPath)
  return origin ? normalizeGitHubRemoteUrl(origin) : null
}

/** The asynchronous half of `readGitOriginUrl`, with the identical refusal. */
async function readGitOriginUrlAsync(
  repositoryPath: string,
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', [...ORIGIN_URL_ARGS], {
      cwd: repositoryPath,
      ...ORIGIN_READ_OPTIONS,
    })
    return firstOriginUrl(stdout)
  } catch {
    return null
  }
}
