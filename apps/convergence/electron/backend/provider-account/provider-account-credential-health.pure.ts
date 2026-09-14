import type { AttestationOutcome } from './provider-account-attestation.pure'
import type { ProviderAccountStatus } from './provider-account.types'

export type ClaudeCredentialHealth = 'present' | 'absent' | 'unknown'

/** Only classify local CLI evidence. Neither cached identity nor a local
 * credential proves that the provider will accept the next request. */
export function classifyClaudeCredentialHealth(
  code: number | null,
  output: string,
): ClaudeCredentialHealth {
  try {
    const value: unknown = JSON.parse(output)
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return 'unknown'
    const status = value as Record<string, unknown>
    if (status.apiProvider !== 'firstParty') return 'unknown'
    if (code === 1 && status.loggedIn === false && status.authMethod === 'none')
      return 'absent'
    if (
      code === 0 &&
      status.loggedIn === true &&
      ['claude.ai', 'oauth_token'].includes(String(status.authMethod))
    )
      return 'present'
  } catch {
    /* Output is never included in a diagnostic. */
  }
  return 'unknown'
}

export function resolveClaudeHealthStatus(
  current: ProviderAccountStatus,
  identity: AttestationOutcome,
  credential: ClaudeCredentialHealth,
): ProviderAccountStatus {
  if (identity === 'identity-mismatch') return 'unavailable'
  // Local presence cannot prove an expired token works, or that a refused
  // reconnect successfully discarded a foreign credential. Only reconnect
  // restores these rows; attestation can demote but never promote them.
  if (current === 'unavailable' || current === 'expired') return current
  return credential === 'absent' ? 'expired' : current
}
