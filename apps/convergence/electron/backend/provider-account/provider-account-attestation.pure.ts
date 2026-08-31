import type { ClaudeAccountIdentity } from './provider-account-enrolment.pure'
import type { ProviderAccountStatus } from './provider-account.types'

/**
 * Fail-closed identity attestation (ADR 0007, PA7).
 *
 * `CLAUDE_SECURESTORAGE_CONFIG_DIR` is absent from Anthropic's published
 * environment-variable reference. It works in 2.1.220 and an invalid
 * namespaced credential fails closed rather than falling back to the default
 * account, but neither property is guaranteed across releases — so Convergence
 * checks the served identity instead of trusting the mechanism.
 *
 * The check covers more than the undocumented variable. Every channel that can
 * make an account serve the wrong credential — a future release ignoring the
 * variable, a shared-settings `apiKeyHelper`, a credential in the settings
 * `env` block — ends in the same observable place: the account directory
 * reports an identity that is not the enrolled one. This is the only mechanism
 * that catches all of them, because it looks at the outcome rather than the
 * cause.
 */

export type AttestationOutcome =
  /** The account directory reports the identity it was enrolled with. */
  | 'verified'
  /** It reports somebody else — fail closed. */
  | 'identity-mismatch'
  /** It reports an identity but the account was enrolled without one. */
  | 'identity-unknown'
  /** Nothing could be read. Not evidence of anything; status is left alone. */
  | 'unreadable'

export interface AttestationVerdict {
  outcome: AttestationOutcome
  /** `null` leaves the stored status untouched. */
  status: ProviderAccountStatus | null
  detail: string | null
}

export interface AttestIdentityInput {
  enrolled: { email: string | null; orgId: string | null }
  /** Read from the account directory's own `.claude.json`, never `auth status`. */
  observed: ClaudeAccountIdentity | null
}

export function attestAccountIdentity(
  input: AttestIdentityInput,
): AttestationVerdict {
  if (!input.observed) {
    return {
      outcome: 'unreadable',
      status: null,
      detail:
        'The account directory reported no identity. Left as-is: an unreadable ' +
        'file is not evidence that the credential changed.',
    }
  }

  if (!input.enrolled.email && !input.enrolled.orgId) {
    return {
      outcome: 'identity-unknown',
      status: null,
      detail: 'No enrolled identity to compare against.',
    }
  }

  const emailMatches =
    !input.enrolled.email || input.enrolled.email === input.observed.email
  const orgMatches =
    !input.enrolled.orgId || input.enrolled.orgId === input.observed.orgId

  if (emailMatches && orgMatches) {
    return { outcome: 'verified', status: 'connected', detail: null }
  }

  return {
    outcome: 'identity-mismatch',
    status: 'unavailable',
    detail:
      `Enrolled as ${describeIdentity(input.enrolled)} but the account ` +
      `directory now reports ${describeIdentity(input.observed)}. Disabled ` +
      'until reconnected rather than spending the wrong account.',
  }
}

function describeIdentity(identity: {
  email: string | null
  orgId: string | null
}): string {
  return identity.email ?? identity.orgId ?? 'an unknown identity'
}

export interface AttestationDueInput {
  /** Claude Code version observed now. */
  currentVersion: string | null
  /** Version at the last attestation, if any. */
  lastVersion: string | null
  /** Epoch millis of the last attestation, or null if never. */
  lastCheckedAt: number | null
  now: number
  intervalMs: number
}

/**
 * Attestation runs on Claude version change and periodically thereafter. The
 * version trigger is the important one: a release that renames or ignores the
 * undocumented variable arrives exactly there.
 */
export function isAttestationDue(input: AttestationDueInput): boolean {
  if (input.lastCheckedAt === null) return true
  if (input.currentVersion !== input.lastVersion) return true
  return input.now - input.lastCheckedAt >= input.intervalMs
}
