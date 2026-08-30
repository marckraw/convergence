/**
 * Rewrites a GitHub remote URL — however it is written locally — into the
 * https form the remote execution host clones with. Local checkouts commonly
 * use the SSH scp form (git@github.com:owner/repo.git), which the daemon's
 * URL parsing cannot accept. Returns null for remotes that are not GitHub
 * repositories the daemon can clone.
 *
 * It lives in `src/shared` — reachable from the renderer and from the main
 * process alike — because both ends now need the *same* rewrite and for the
 * same reason (MAR-2689). The strip matches a remote Project's origin against
 * the local project's, and two origins that differ only by scheme or a
 * trailing `.git` are the same repository; the start path turns the local
 * origin into what the daemon clones. A second copy of this normalisation on
 * the renderer side would be a rule in two places, and a rule in two places is
 * one that drifts — which is exactly how the same id came to be read two
 * different ways at two doors before (`namesThisMachine`).
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
