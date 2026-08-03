import { createHash } from 'crypto'
import { join } from 'path'
import type {
  ProviderAccount,
  ProviderAccountAuthKind,
  ProviderAccountRow,
  ProviderAccountStatus,
} from './provider-account.types'

/**
 * Account directory roots, relative to the user's home directory.
 *
 * Hardcoded on purpose. The account directory path is hashed into the macOS
 * keychain service name, so it is a correctness constraint rather than a layout
 * preference: deriving it from `app.getPath('userData')` would split dev
 * (`convergence`) from packaged (`Convergence`) — the same folder on a
 * case-insensitive disk, but a different hash — and accounts enrolled under
 * `npm run dev` would be invisible in the installed build. See ADR 0007.
 */
export const PROVIDER_ACCOUNT_CONFIG_ROOT_SEGMENTS = [
  '.convergence',
  'provider-accounts',
] as const

/**
 * The credential namespace lives under its own root rather than inside the
 * config directory, so the configuration layout can be restructured later
 * without changing the hash and orphaning keychain slots.
 */
export const PROVIDER_ACCOUNT_CREDENTIAL_ROOT_SEGMENTS = [
  '.convergence',
  'provider-credentials',
] as const

/** Base of the keychain service name Claude Code derives its slot from. */
export const CLAUDE_KEYCHAIN_SERVICE_BASE = 'Claude Code'

/** Keychain account fallback when `$USER` is missing or not slot-safe. */
export const CLAUDE_KEYCHAIN_ACCOUNT_FALLBACK = 'claude-code-user'

/**
 * Two vocabularies, mapped in one place (ruled 2026-08-03).
 *
 * Rows and the domain model speak the **registry id** (`claude-code`), the same
 * id the provider registry and session rows already use. Filesystem paths speak
 * a short, fixed **path token** (`claude`). The token is hashed into the
 * keychain slot name at enrolment and can never change afterwards, so it is
 * pinned per provider rather than derived from the registry id — a later rename
 * of a provider id must not orphan anybody's credentials.
 *
 * Unknown providers throw rather than guess: PA9 adds Codex here deliberately,
 * with the same one-way door in mind.
 */
const PROVIDER_ACCOUNT_PATH_TOKENS: Readonly<Record<string, string>> = {
  'claude-code': 'claude',
}

export function providerAccountPathToken(providerId: string): string {
  const token = PROVIDER_ACCOUNT_PATH_TOKENS[providerId]
  if (!token) {
    throw new Error(
      `No provider account path token for ${JSON.stringify(providerId)}. ` +
        'Account directory names are hashed into keychain slot names, so each ' +
        'provider needs a token pinned here before it can enrol accounts.',
    )
  }
  return token
}

const SAFE_PATH_SEGMENT = /^[a-zA-Z0-9._-]+$/

const SAFE_KEYCHAIN_ACCOUNT = /^[a-zA-Z0-9._-]+$/

export interface ProviderAccountDirInput {
  /** Absolute home directory. Passed in, never read from the environment here. */
  homeDir: string
  /** Registry id, e.g. `claude-code`. Mapped to its path token internally. */
  providerId: string
  accountId: string
}

function assertSafeSegment(value: string, field: string): string {
  if (!SAFE_PATH_SEGMENT.test(value) || value === '.' || value === '..') {
    throw new Error(
      `Unsafe provider account ${field}: ${JSON.stringify(value)}. ` +
        'Account directory paths are hashed into keychain slot names and must ' +
        'be plain path segments.',
    )
  }
  return value
}

/**
 * `~/.convergence/provider-accounts/<pathToken>/<accountId>` — the value of
 * `CLAUDE_CONFIG_DIR` for this account.
 */
export function deriveProviderAccountConfigDir(
  input: ProviderAccountDirInput,
): string {
  return join(
    input.homeDir,
    ...PROVIDER_ACCOUNT_CONFIG_ROOT_SEGMENTS,
    assertSafeSegment(providerAccountPathToken(input.providerId), 'providerId'),
    assertSafeSegment(input.accountId, 'accountId'),
  )
}

/**
 * `~/.convergence/provider-credentials/<pathToken>/<accountId>` — the value of
 * `CLAUDE_SECURESTORAGE_CONFIG_DIR` for this account, and therefore the string
 * that decides which keychain slot the account's credential lands in.
 */
export function deriveProviderAccountCredentialDir(
  input: ProviderAccountDirInput,
): string {
  return join(
    input.homeDir,
    ...PROVIDER_ACCOUNT_CREDENTIAL_ROOT_SEGMENTS,
    assertSafeSegment(providerAccountPathToken(input.providerId), 'providerId'),
    assertSafeSegment(input.accountId, 'accountId'),
  )
}

/** Roots the sweep and the removal guard scan. */
export function deriveProviderAccountConfigRoot(
  homeDir: string,
  providerId: string,
): string {
  return join(
    homeDir,
    ...PROVIDER_ACCOUNT_CONFIG_ROOT_SEGMENTS,
    providerAccountPathToken(providerId),
  )
}

export function deriveProviderAccountCredentialRoot(
  homeDir: string,
  providerId: string,
): string {
  return join(
    homeDir,
    ...PROVIDER_ACCOUNT_CREDENTIAL_ROOT_SEGMENTS,
    providerAccountPathToken(providerId),
  )
}

/**
 * Guard for the only destructive operation in this module. Removal deletes a
 * directory tree, so it refuses anything that is not a direct child of the
 * provider's own account root — a malformed or attacker-supplied path can never
 * reach outside it.
 */
export function assertRemovableAccountDir(dir: string, root: string): void {
  const prefix = root.endsWith('/') ? root : `${root}/`
  const remainder = dir.startsWith(prefix) ? dir.slice(prefix.length) : null

  if (
    !remainder ||
    remainder.includes('/') ||
    remainder === '.' ||
    remainder === '..' ||
    !SAFE_PATH_SEGMENT.test(remainder)
  ) {
    throw new Error(
      `Refusing to remove ${JSON.stringify(dir)}: it is not a direct child of ` +
        `${JSON.stringify(root)}.`,
    )
  }
}

/** First eight hex characters of `sha256(NFC(dir))`, as Claude Code computes it. */
export function hashProviderAccountDir(dir: string): string {
  return createHash('sha256')
    .update(dir.normalize('NFC'), 'utf8')
    .digest('hex')
    .slice(0, 8)
}

/**
 * The keychain service name Claude Code stores subscription OAuth under.
 *
 * The suffix is applied on the *presence of a non-empty value*, not on the
 * value itself: pointing `CLAUDE_CONFIG_DIR` at the default `~/.claude` still
 * produces a hashed slot, while an unset or empty variable yields the shared
 * default slot. Asserted in one place so the undocumented naming function is
 * never re-derived at a call site.
 */
export function deriveClaudeKeychainService(
  credentialDir: string | null | undefined,
  oauthFileSuffix = '',
): string {
  const base = `${CLAUDE_KEYCHAIN_SERVICE_BASE}${oauthFileSuffix}-credentials`
  if (!credentialDir) return base
  return `${base}-${hashProviderAccountDir(credentialDir)}`
}

/**
 * The keychain *account* field, which is the OS username. Slots are therefore
 * bound to the macOS user: a new machine or username requires re-enrolment.
 */
export function deriveClaudeKeychainAccount(
  user: string | null | undefined,
): string {
  if (!user || !SAFE_KEYCHAIN_ACCOUNT.test(user)) {
    return CLAUDE_KEYCHAIN_ACCOUNT_FALLBACK
  }
  return user
}

function parseAuthKind(value: string): ProviderAccountAuthKind {
  return value === 'setup-token' ? 'setup-token' : 'subscription-oauth'
}

function parseStatus(value: string): ProviderAccountStatus {
  if (value === 'expired' || value === 'unavailable') return value
  return 'connected'
}

export function mapProviderAccountRow(
  row: ProviderAccountRow,
): ProviderAccount {
  return {
    id: row.id,
    providerId: row.provider_id,
    label: row.label,
    authKind: parseAuthKind(row.auth_kind),
    email: row.email,
    orgId: row.org_id,
    plan: row.plan,
    configDir: row.config_dir,
    credentialDir: row.credential_dir,
    executionHostId: row.execution_host_id,
    isDefault: row.is_default === 1,
    status: parseStatus(row.status),
    lastValidatedAt: row.last_validated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
