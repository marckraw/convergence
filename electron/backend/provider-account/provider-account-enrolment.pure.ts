import { join } from 'path'
import { buildClaudeAccountEnv } from './provider-account-env.pure'

/**
 * The `claude auth` invocations enrolment and removal depend on, built as data
 * rather than executed here.
 *
 * Both commands are one-way doors against a real credential store, so the
 * shape of the invocation is worth asserting in a test that can never run it:
 * the wrong `CLAUDE_CONFIG_DIR` on a logout wipes the shared profile's
 * `oauthAccount` (investigation finding 9), and a missing
 * `CLAUDE_SECURESTORAGE_CONFIG_DIR` on a login writes the credential to the
 * default slot instead of the account's.
 */
export interface ProviderAccountCommand {
  command: string
  args: string[]
  env: NodeJS.ProcessEnv
  cwd?: string
}

export interface BuildLoginCommandInput {
  binaryPath: string
  configDir: string
  credentialDir: string
  email: string
  baseEnv: NodeJS.ProcessEnv
}

/**
 * `--email` pre-fills the login page, which is what makes enrolment usable when
 * the browser already holds several Claude sessions — without it the user has
 * no way to tell which account they are about to authorise.
 */
export function buildProviderAccountLoginCommand(
  input: BuildLoginCommandInput,
): ProviderAccountCommand {
  const email = input.email.trim()
  if (!email) {
    throw new Error('Enrolment requires the email address of the account.')
  }

  return {
    command: input.binaryPath,
    args: ['auth', 'login', '--email', email],
    env: buildClaudeAccountEnv({
      baseEnv: input.baseEnv,
      account: {
        configDir: input.configDir,
        credentialDir: input.credentialDir,
      },
    }),
  }
}

export interface BuildLogoutCommandInput {
  binaryPath: string
  /**
   * A scratch directory, never the account's own and never the shared profile.
   * `claude auth logout` under a credential namespace but with the *shared*
   * config directory wipes the shared `oauthAccount` block.
   */
  throwawayConfigDir: string
  credentialDir: string
  baseEnv: NodeJS.ProcessEnv
}

export function buildProviderAccountLogoutCommand(
  input: BuildLogoutCommandInput,
): ProviderAccountCommand {
  if (!input.throwawayConfigDir.trim()) {
    throw new Error(
      'Removing an account requires a throwaway config directory, or logout ' +
        'would wipe the shared profile credential.',
    )
  }

  return {
    command: input.binaryPath,
    args: ['auth', 'logout'],
    env: buildClaudeAccountEnv({
      baseEnv: input.baseEnv,
      account: {
        configDir: input.throwawayConfigDir,
        credentialDir: input.credentialDir,
      },
    }),
  }
}

/**
 * Credential namespaces on disk that no enrolled account claims.
 *
 * These are left behind when a login is abandoned half way, or when a row is
 * removed while its keychain slot survives. Sweeping them means running the
 * documented logout against each — never deleting the keychain entry directly,
 * which would duplicate an undocumented naming function and would not port off
 * macOS.
 */
export function findOrphanCredentialDirs(input: {
  credentialRoot: string
  entriesOnDisk: readonly string[]
  enrolledCredentialDirs: readonly string[]
}): string[] {
  const claimed = new Set(input.enrolledCredentialDirs)

  return input.entriesOnDisk
    .map((entry) => join(input.credentialRoot, entry))
    .filter((dir) => !claimed.has(dir))
    .sort()
}

/**
 * The identity a Claude config directory reports about itself.
 *
 * Read from the account directory's own `.claude.json`, never from
 * `claude auth status`: under a shared configuration directory that command
 * reports whichever account logged in last, independent of the credential
 * actually in use.
 */
export interface ClaudeAccountIdentity {
  email: string | null
  orgId: string | null
  plan: string | null
}

export function readClaudeIdentityFromConfig(
  config: unknown,
): ClaudeAccountIdentity | null {
  if (typeof config !== 'object' || config === null) return null

  const oauthAccount = (config as { oauthAccount?: unknown }).oauthAccount
  if (typeof oauthAccount !== 'object' || oauthAccount === null) return null

  const record = oauthAccount as Record<string, unknown>
  const email =
    typeof record.emailAddress === 'string' ? record.emailAddress : null
  const orgId =
    typeof record.organizationUuid === 'string' ? record.organizationUuid : null
  const plan =
    typeof record.organizationRole === 'string'
      ? record.organizationRole
      : typeof record.subscriptionType === 'string'
        ? record.subscriptionType
        : null

  if (!email && !orgId) return null

  return { email, orgId, plan }
}

/** A label the user can tell apart before identity is known. */
export function deriveProviderAccountLabel(
  email: string,
  explicitLabel?: string | null,
): string {
  const label = explicitLabel?.trim()
  if (label) return label
  return email.trim()
}
