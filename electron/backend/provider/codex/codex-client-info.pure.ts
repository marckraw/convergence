/**
 * Codex's app-server echoes the handshake `clientInfo` back into the
 * `userAgent` it reports and into OpenAI's enterprise compliance log, so every
 * `initialize` Convergence sends must carry the real app version instead of a
 * placeholder.
 */
export interface CodexClientInfo {
  name: string
  title: string
  version: string
}

/** Used only when the app version is genuinely unavailable (e.g. bare tests). */
export const CODEX_UNKNOWN_APP_VERSION = '0.0.0'

export function buildCodexClientInfo(
  appVersion: string | null | undefined,
): CodexClientInfo {
  const version = appVersion?.trim()

  return {
    name: 'convergence',
    title: 'Convergence',
    version: version ? version : CODEX_UNKNOWN_APP_VERSION,
  }
}
