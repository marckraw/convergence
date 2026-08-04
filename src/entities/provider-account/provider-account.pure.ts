import type {
  ProviderAccount,
  ProviderAccountAttestationResult,
  ProviderAccountHealth,
  ProviderAccountStatus,
} from './provider-account.types'

/**
 * An account is identity and entitlements, not an anonymous slot, so every
 * label the user reads leads with who it is.
 */
export function describeProviderAccountStatus(status: ProviderAccountStatus): {
  label: string
  tone: 'ok' | 'warning' | 'danger'
} {
  switch (status) {
    case 'connected':
      return { label: 'Connected', tone: 'ok' }
    case 'expired':
      return { label: 'Needs login', tone: 'warning' }
    case 'unavailable':
      return { label: 'Disabled', tone: 'danger' }
  }
}

export interface ProviderAccountHealthSummary {
  /** Accounts attestation disabled because they served the wrong identity. */
  mismatched: ProviderAccountAttestationResult[]
  /** Account-directory entries the manifest did not plan for. */
  unknownEntries: string[]
  /** True when shared settings make account selection decorative. */
  hasSettingsOverride: boolean
}

export function summariseProviderAccountHealth(
  health: ProviderAccountHealth | null,
  accounts: ProviderAccount[],
): ProviderAccountHealthSummary {
  if (!health) {
    return {
      mismatched: [],
      unknownEntries: [],
      hasSettingsOverride: false,
    }
  }

  const known = new Set(accounts.map((account) => account.id))

  return {
    mismatched: health.accounts.filter(
      (result) =>
        result.outcome === 'identity-mismatch' && known.has(result.accountId),
    ),
    unknownEntries: [
      ...new Set(health.accounts.flatMap((result) => result.unknownEntries)),
    ].sort(),
    hasSettingsOverride: health.settingsWarnings.length > 0,
  }
}

/**
 * One row of the provider-accounts settings surface (ADR 0007, PA6).
 *
 * The same SIM framing as the composer picker: identity leads, everything else
 * qualifies it. Health verdicts live on the row rather than in a separate panel
 * because the useful question is "is *this* account trustworthy", and PA7's net
 * is only worth building if its answer is visible where accounts are managed.
 */
export interface ProviderAccountSettingsRow {
  id: string
  /** Who the account is. */
  identity: string
  /** The renameable label, shown only when it says something the identity does not. */
  label: string
  showsLabel: boolean
  organization: string | null
  /**
   * The subscription tier, or null. Never a guess: the account directory
   * records `organizationRole` right beside the tier, and displaying that
   * instead is how this field said "admin" for a Max account.
   */
  plan: string | null
  isDefault: boolean
  status: { label: string; tone: 'ok' | 'warning' | 'danger' }
  /** Why the status is what it is. Null when the account is simply fine. */
  statusDetail: string | null
  /** Health observations worth showing even for a connected account. */
  notes: string[]
  canSetDefault: boolean
  lastValidatedAt: string | null
}

const STATUS_DETAILS: Record<ProviderAccountStatus, string | null> = {
  connected: null,
  expired: 'Sign in again before this account can serve turns.',
  unavailable:
    'Identity attestation disabled this account. Reconnect it to use it again.',
}

export function buildProviderAccountSettingsRows(
  accounts: ProviderAccount[],
  health: ProviderAccountHealth | null,
): ProviderAccountSettingsRow[] {
  const verdicts = new Map(
    (health?.accounts ?? []).map((verdict) => [verdict.accountId, verdict]),
  )

  return accounts.map((account) => {
    const identity = describeProviderAccountIdentity(account)
    const verdict = verdicts.get(account.id)
    const notes: string[] = []

    if (verdict?.outcome === 'unreadable') {
      notes.push(
        'Convergence could not read this account directory at the last check, ' +
          'so its identity is unconfirmed rather than wrong.',
      )
    }
    if (verdict?.unknownEntries.length) {
      notes.push(
        `The account directory has entries the layout does not account for: ${verdict.unknownEntries.join(', ')}. ` +
          'Reported rather than silently partitioned.',
      )
    }
    if (verdict?.missingLinks.length) {
      notes.push(
        `Shared entries this account cannot see: ${verdict.missingLinks.join(', ')}. ` +
          'Reconnect relinks them.',
      )
    }

    return {
      id: account.id,
      identity,
      label: account.label,
      showsLabel: account.label.trim() !== identity.trim(),
      organization: account.orgId,
      plan: account.plan,
      isDefault: account.isDefault,
      status: describeProviderAccountStatus(account.status),
      statusDetail: verdict?.detail ?? STATUS_DETAILS[account.status],
      notes,
      canSetDefault: !account.isDefault && isProviderAccountSelectable(account),
      lastValidatedAt: account.lastValidatedAt,
    }
  })
}

/**
 * The composer's account picker (ADR 0007, PA5).
 *
 * An account is identity and entitlements, not an anonymous battery: accounts
 * live in different organizations, and organizations differ in model rollouts
 * and defaults, so a swap can change what actually serves the next turn. Every
 * label therefore leads with *who*, never with a gauge or a slot number.
 */

/** Sentinel for "no account selected" — the ambient `~/.claude` credential. */
export const AMBIENT_DEFAULT_ACCOUNT_ID = '__ambient-default__'

export const AMBIENT_DEFAULT_ACCOUNT_LABEL = 'Default account'

/**
 * Why the account picker cannot be used right now, or null (ADR 0007, PA10).
 *
 * Accounts are host-scoped: their directories live on *this* machine and the
 * execution-host wire protocol carries no account reference, so a remote
 * session runs on the remote host's own credential whatever is selected here.
 * Saying so is the point — a picker that silently did nothing would be worse
 * than one that explains itself.
 */
export function describeProviderAccountSelectionBlock(
  executionHost: string | null | undefined,
): string | null {
  return executionHost === 'remote'
    ? 'Account selection is local-only for now. This session runs on a remote ' +
        'execution host, which uses its own credential.'
    : null
}

/**
 * Only the accounts that could serve this session (ADR 0007, PA9).
 *
 * Accounts are per provider — a Codex `CODEX_HOME` cannot serve a Claude turn —
 * so offering the wrong provider's accounts would promise a swap that
 * `resolveAccountForTurn` has no way to honour.
 */
export function providerAccountsForProvider(
  accounts: ProviderAccount[],
  providerId: string | null | undefined,
): ProviderAccount[] {
  if (!providerId) return []
  return accounts.filter((account) => account.providerId === providerId)
}

export function describeProviderAccountIdentity(
  account: ProviderAccount,
): string {
  return account.email ?? account.label
}

export interface ProviderAccountPickerItem {
  id: string
  label: string
  description?: string
  badge?: { label: string; title?: string }
  disabled?: boolean
}

/**
 * Only a connected account can serve a turn. `resolveAccountForTurn` already
 * refuses the others, so offering them would promise a turn that is going to
 * be rejected — they are listed with the reason instead of hidden, because a
 * disappearing account is more confusing than a greyed-out one.
 */
export function isProviderAccountSelectable(account: ProviderAccount): boolean {
  return account.status === 'connected'
}

export function buildProviderAccountPickerItems(
  accounts: ProviderAccount[],
): ProviderAccountPickerItem[] {
  const ambient: ProviderAccountPickerItem = {
    id: AMBIENT_DEFAULT_ACCOUNT_ID,
    label: AMBIENT_DEFAULT_ACCOUNT_LABEL,
    description: 'The Claude Code login this machine already had.',
  }

  return [
    ambient,
    ...accounts.map((account) => {
      const selectable = isProviderAccountSelectable(account)
      const status = describeProviderAccountStatus(account.status)

      return {
        id: account.id,
        label: describeProviderAccountIdentity(account),
        description: account.orgId
          ? `Organization ${account.orgId}`
          : undefined,
        badge: selectable
          ? account.isDefault
            ? { label: 'default', title: 'Preselected for new sessions' }
            : undefined
          : {
              label: status.label,
              title:
                account.status === 'expired'
                  ? 'Sign in again before this account can serve turns.'
                  : 'Identity attestation disabled this account. Reconnect it to use it again.',
            },
        disabled: !selectable,
      }
    }),
  ]
}

/** What the composer shows as the current pick. */
export function describeSelectedProviderAccount(
  accountId: string | null,
  accounts: ProviderAccount[],
): string {
  if (!accountId) return AMBIENT_DEFAULT_ACCOUNT_LABEL
  const account = accounts.find((candidate) => candidate.id === accountId)
  return account
    ? describeProviderAccountIdentity(account)
    : AMBIENT_DEFAULT_ACCOUNT_LABEL
}

export function providerAccountIdFromPickerValue(value: string): string | null {
  return value === AMBIENT_DEFAULT_ACCOUNT_ID ? null : value
}

/**
 * Whether the account may be changed right now.
 *
 * PA4 holds one immutable account for a whole logical turn, including the
 * processes a deferred-tool answer or a recovery restart spawns. Offering the
 * picker while any of that is in flight would promise a swap the backend
 * correctly refuses to make — so the picker locks until the turn settles, and
 * the swap applies to the *next* turn.
 */
export function isProviderAccountSelectionLocked(
  session: { status: string; attention: string } | null,
): boolean {
  if (!session) return false
  if (session.status === 'running') return true
  return (
    session.attention === 'needs-input' ||
    session.attention === 'needs-approval'
  )
}

/**
 * What the picker should show when a session becomes active.
 *
 * The honest answer to "which account is this conversation on" is the account
 * that served its most recent turn — PA4's durable record — rather than
 * anything the composer remembers, which would drift after a restart. A
 * session with no turns yet, and every new session, falls back to the enrolled
 * default if there is one, and otherwise to the ambient account, which is
 * exactly today's behaviour.
 */
export function resolveInitialProviderAccountSelection(input: {
  accounts: ProviderAccount[]
  lastTurnAccountId?: string | null
  hasActiveSession: boolean
}): string | null {
  if (input.hasActiveSession) {
    const recorded = input.accounts.find(
      (account) => account.id === input.lastTurnAccountId,
    )
    if (recorded) return recorded.id
    // A recorded account that no longer exists, or a session whose turns all
    // ran on the ambient default, both mean "no selection".
    if (input.lastTurnAccountId) return null
  }

  const enrolledDefault = input.accounts.find(
    (account) => account.isDefault && isProviderAccountSelectable(account),
  )
  return enrolledDefault?.id ?? null
}
