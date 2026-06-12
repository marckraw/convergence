/**
 * Rewrites a GitHub remote URL — however it is written locally — into the
 * https form the remote execution host clones with. Local checkouts commonly
 * use the SSH scp form (git@github.com:owner/repo.git), which the daemon's
 * URL parsing cannot accept. Returns null for remotes that are not GitHub
 * repositories the daemon can clone.
 */
export function normalizeGitHubRemoteUrl(remoteUrl: string): string | null {
  const trimmed = remoteUrl.trim()
  if (!trimmed) return null

  const scpMatch = /^git@github\.com:(.+)$/.exec(trimmed)
  if (scpMatch?.[1]) {
    return normalizeOwnerRepoPath(scpMatch[1])
  }

  const sshPrefix = 'ssh://git@github.com/'
  if (trimmed.startsWith(sshPrefix)) {
    return normalizeOwnerRepoPath(trimmed.slice(sshPrefix.length))
  }

  try {
    const url = new URL(trimmed)
    if (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.hostname === 'github.com'
    ) {
      return normalizeOwnerRepoPath(url.pathname.replace(/^\//, ''))
    }
  } catch {
    return null
  }

  return null
}

function normalizeOwnerRepoPath(path: string): string | null {
  const segments = path
    .replace(/\.git$/, '')
    .split('/')
    .filter(Boolean)
  if (segments.length !== 2) return null
  const [owner, repo] = segments
  if (!owner || !repo) return null
  return `https://github.com/${owner}/${repo}.git`
}
