/**
 * Domain model for provider accounts. See
 * `docs/adr/0007-provider-accounts-are-namespaced-credentials-with-shared-conversations.md`.
 *
 * An account is identity and entitlements, not merely capacity: accounts belong
 * to different organizations, and organizations differ in model rollouts and
 * defaults. Rows carry **non-secret metadata only** — the credential itself
 * lives in the OS keychain, addressed by `credentialDir`, and is resolved at
 * execution time.
 */

/**
 * How the account authenticates. `subscription-oauth` is the chosen mechanism
 * (namespaced keychain slot); `setup-token` is the documented degraded fallback
 * retained by ADR 0007 and must not become the default path.
 */
export type ProviderAccountAuthKind = 'subscription-oauth' | 'setup-token'

/**
 * `expired` means the credential needs a re-login; `unavailable` means identity
 * attestation failed (PA7) and the account is disabled until reconnected.
 */
export type ProviderAccountStatus = 'connected' | 'expired' | 'unavailable'

export interface ProviderAccount {
  id: string
  providerId: string
  /** Display label. Renameable — unlike the two directory paths. */
  label: string
  authKind: ProviderAccountAuthKind
  /** Identity attested from the account directory's own `.claude.json`. */
  email: string | null
  orgId: string | null
  plan: string | null
  /**
   * `CLAUDE_CONFIG_DIR` for this account. Immutable after enrolment: it is
   * hashed into the keychain service name, so moving it orphans the credential.
   */
  configDir: string
  /**
   * `CLAUDE_SECURESTORAGE_CONFIG_DIR` for this account. Pinned separately from
   * `configDir` so the configuration layout can be restructured later without
   * orphaning keychain slots. Also immutable after enrolment.
   */
  credentialDir: string
  /** Accounts are scoped to an execution host; remote hosts fail closed (PA10). */
  executionHostId: string
  /**
   * The enrolled account preselected for new sessions. Distinct from the
   * *ambient* default account — no account selected at all, i.e. the shared
   * `~/.claude` credential — which has no row here.
   */
  isDefault: boolean
  status: ProviderAccountStatus
  lastValidatedAt: string | null
  createdAt: string
  updatedAt: string
}

/** Persisted shape. Column names are snake_case; the domain model is camelCase. */
export interface ProviderAccountRow {
  id: string
  provider_id: string
  label: string
  auth_kind: string
  email: string | null
  org_id: string | null
  plan: string | null
  config_dir: string
  credential_dir: string
  execution_host_id: string
  is_default: number
  status: string
  last_validated_at: string | null
  created_at: string
  updated_at: string
}

export interface CreateProviderAccountInput {
  id: string
  providerId: string
  label: string
  authKind: ProviderAccountAuthKind
  configDir: string
  credentialDir: string
  executionHostId: string
  email?: string | null
  orgId?: string | null
  plan?: string | null
  status?: ProviderAccountStatus
  lastValidatedAt?: string | null
}

/**
 * The attested identity block, written whole at enrolment (PA3) and on every
 * re-attestation (PA7) so a stale field can never survive a successful check.
 */
export interface ProviderAccountIdentity {
  email: string | null
  orgId: string | null
  plan: string | null
  status: ProviderAccountStatus
  lastValidatedAt: string | null
}
