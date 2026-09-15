import { stripTerminalControlSequences } from './provider-account-pty-runner.pure'

/** Only vendor OAuth authorization destinations may become clickable links. */
export function isProviderLoginUrl(
  value: string,
  providerId: 'claude-code' | 'codex',
): boolean {
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      url.hash
    )
      return false
    return providerId === 'codex'
      ? url.hostname === 'auth.openai.com' &&
          url.pathname === '/oauth/authorize'
      : (url.hostname === 'claude.com' &&
          url.pathname === '/cai/oauth/authorize') ||
          (url.hostname === 'claude.ai' && url.pathname === '/oauth/authorize')
  } catch {
    return false
  }
}

/** Raw PTY text is reduced to a URL and a prompt flag, never a transcript. */
export function readProviderLoginProgress(
  raw: string,
  providerId: 'claude-code' | 'codex',
): { authorizationUrl: string | null; needsCode: boolean } {
  const text = stripTerminalControlSequences(raw)
  // A PTY chunk can stop inside the URL or its ANSI reset. Publish only once
  // a delimiter has arrived; otherwise a clickable link can contain truncated
  // OAuth parameters or a partial terminal escape.
  const urls = text.match(/https:\/\/[^\s<>"']+(?=[\s<>"'])/g) ?? []
  const authorizationUrl =
    urls.find((value) => isProviderLoginUrl(value, providerId)) ?? null
  const prose = text.replace(/https:\/\/\S+/g, '')
  return {
    authorizationUrl,
    needsCode:
      providerId === 'claude-code' &&
      /(?:paste|enter|provide)[^\n]{0,70}(?:authorization\s+)?code/i.test(
        prose,
      ),
  }
}

export function validateProviderLoginCode(value: unknown): string {
  if (typeof value !== 'string')
    throw new Error('Paste the authorization code from the login page.')
  const code = value.trim()
  if (
    !code ||
    code.length > 4096 ||
    /\s/.test(code) ||
    [...code].some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    )
  )
    throw new Error('Paste a single authorization code from the login page.')
  return code
}

/** Fixed messages only: subprocess errors may contain tokens or pasted codes. */
export function classifyProviderLoginFailure(error: unknown): {
  kind: 'busy' | 'cleanup' | 'identity' | 'unavailable' | 'failed'
  message: string
} {
  const message = error instanceof Error ? error.message : ''
  if (/Incomplete Claude account cleanup failed/.test(message))
    return {
      kind: 'cleanup',
      message:
        'Sign-in did not finish and its credential could not be discarded. The incomplete login needs cleanup before connecting again.',
    }
  if (/Incomplete account directory cleanup failed/.test(message))
    return {
      kind: 'cleanup',
      message:
        'Sign-in did not finish and its incomplete account directory could not be removed. Its files need attention before retrying.',
    }
  if (
    /credential could not be (?:removed|discarded)|sign-out failed|logout failed/i.test(
      message,
    )
  )
    return {
      kind: 'cleanup',
      message:
        'Sign-in did not finish and its credential could not be discarded. The account remains disabled. Retry reconnect before using it.',
    }
  if (/previous account config could not be restored/i.test(message))
    return {
      kind: 'cleanup',
      message:
        'Sign-in did not finish and the previous account config could not be restored. The account remains disabled. Check its files before reconnecting.',
    }
  if (/active|busy|being updated|running work/i.test(message))
    return {
      kind: 'busy',
      message:
        'This account is busy. Wait for its work or account maintenance to finish, then retry.',
    }
  if (
    /originally enrolled|different account|different workspace|original.*identity/i.test(
      message,
    )
  )
    return {
      kind: 'identity',
      message:
        'The login did not match the enrolled account. Reconnect and choose the original account and workspace in the browser.',
    }
  if (/config could not be read/i.test(message))
    return {
      kind: 'unavailable',
      message:
        'The account config could not be read. Sign-in was not started and credentials were not changed.',
    }
  if (/not available on PATH|not installed/i.test(message))
    return {
      kind: 'unavailable',
      message:
        'The provider CLI is unavailable. Install it or refresh provider detection, then retry.',
    }
  return {
    kind: 'failed',
    message:
      'Sign-in did not complete. Retry and choose the intended account in the browser.',
  }
}
