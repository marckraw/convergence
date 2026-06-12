import { execFileSync } from 'child_process'

/**
 * Reads the `origin` remote URL of a local repository synchronously. Used on
 * the session start path, where the caller cannot await; `git config` is a
 * local file read and returns immediately. Returns null when the directory is
 * not a repository or has no origin remote.
 */
export function readGitOriginUrl(repositoryPath: string): string | null {
  try {
    const output = execFileSync(
      'git',
      ['config', '--get', 'remote.origin.url'],
      { cwd: repositoryPath, timeout: 5_000, encoding: 'utf8' },
    )
    const url = output.trim()
    return url.length > 0 ? url : null
  } catch {
    return null
  }
}
