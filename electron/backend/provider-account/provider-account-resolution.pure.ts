import type { CodexAccountEnvTarget } from './provider-account-codex-env.pure'
import type { ClaudeAccountEnvTarget } from './provider-account-env.pure'
import type { ProviderAccount } from './provider-account.types'

/**
 * Turning a recorded account id into the directories that decide which
 * credential serves a turn (ADR 0007, PA4).
 *
 * Three outcomes, and the distinction matters:
 *
 * - **No id** is the ambient default account — no selection was made, so the
 *   turn runs exactly as it always has. This is the behaviour-neutral path and
 *   it must never throw.
 * - **An id with no account** means a row was removed between the turn being
 *   queued and served. Failing is the honest answer; silently falling back to
 *   the default would spend the wrong subscription without a trace.
 * - **An id for a disabled account** is PA7 arriving: attestation found it
 *   serving somebody else, so turns stop going to it rather than spending it.
 */
export function resolveAccountForTurn(input: {
  accountId: string | null | undefined
  account: ProviderAccount | null
}): ClaudeAccountEnvTarget | null {
  if (!input.accountId) return null

  if (!input.account) {
    throw new Error(
      `Provider account ${input.accountId} no longer exists. The turn was not ` +
        'started, because running it would silently spend a different account.',
    )
  }

  if (input.account.status !== 'connected') {
    throw new Error(
      `Provider account ${describeAccount(input.account)} is ` +
        `${input.account.status} and cannot serve turns. Reconnect it, or ` +
        'pick another account.',
    )
  }

  return {
    configDir: input.account.configDir,
    credentialDir: input.account.credentialDir,
  }
}

/**
 * The message a remote session gets when an account is selected (PA10).
 *
 * Written once, so the composer and the backend say the same thing rather than
 * two different half-truths.
 */
export const REMOTE_ACCOUNT_SELECTION_UNAVAILABLE =
  'Account selection is local-only for now. A session on a remote execution ' +
  'host runs on that host’s own credential, so pick "Default account" or ' +
  'run this session locally.'

/**
 * Refuses a remote turn that names a local account (ADR 0007, PA10).
 *
 * Accounts are host-scoped: their directories exist on *this* machine, and the
 * execution-host wire protocol carries no account reference. A remote host
 * therefore runs on its own ambient credential no matter what is selected here.
 *
 * Failing is the only honest option. Running it anyway would spend an
 * unexpected subscription *and* record the local account id against the turn,
 * so the transcript would assert something that never happened — and there is
 * nothing downstream that could ever contradict it.
 */
export function assertLocalAccountSelection(input: {
  executionHost: string
  accountId: string | null | undefined
}): void {
  if (!input.accountId) return
  if (input.executionHost !== 'remote') return

  throw new Error(REMOTE_ACCOUNT_SELECTION_UNAVAILABLE)
}

/**
 * The same three outcomes for Codex, whose account is a `CODEX_HOME` rather
 * than a keychain namespace (ADR 0007, PA9). Deliberately the same guard, so a
 * removed or attestation-disabled account stops receiving work whichever
 * provider it belongs to.
 */
export function resolveCodexAccountForTurn(input: {
  accountId: string | null | undefined
  account: ProviderAccount | null
}): CodexAccountEnvTarget | null {
  const resolved = resolveAccountForTurn(input)
  return resolved ? { configDir: resolved.configDir } : null
}

function describeAccount(account: ProviderAccount): string {
  return account.email ?? account.label
}

/**
 * The account a continuation must use.
 *
 * A logical turn can spawn several processes — a deferred-tool answer, a plan
 * approval, a recovery restart after a dropped continuation. Every one of them
 * belongs to the turn that started it, so the snapshot taken at the top is
 * reused rather than re-resolved. Re-resolving would let a selection made
 * mid-turn leak into a process the user already believes is running on the
 * previous account, and Claude's own transcript records no account attribution
 * to contradict it later.
 */
export function selectTurnAccountSnapshot<T>(input: {
  continuesCurrentTurn: boolean
  currentSnapshot: T | null
  resolveFresh: () => T
}): T {
  if (input.continuesCurrentTurn && input.currentSnapshot !== null) {
    return input.currentSnapshot
  }
  return input.resolveFresh()
}
