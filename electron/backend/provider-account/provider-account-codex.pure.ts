import { buildCodexAccountEnv } from './provider-account-codex-env.pure'
import type { ProviderAccountCommand } from './provider-account-enrolment.pure'

/**
 * Codex enrolment, built as data rather than executed here (ADR 0007, PA9).
 *
 * `codex login` writes a plaintext `auth.json` into `CODEX_HOME`, so the whole
 * of account isolation for Codex is which directory that variable points at.
 * The invocation is therefore worth asserting in a test that can never run it:
 * a login with the wrong `CODEX_HOME` writes the credential into the shared
 * `~/.codex` and silently rebinds the machine's default Codex identity.
 */

export interface BuildCodexLoginCommandInput {
  binaryPath: string
  /** `CODEX_HOME` for this account. Immutable after enrolment. */
  configDir: string
  baseEnv: NodeJS.ProcessEnv
}

export function buildCodexAccountLoginCommand(
  input: BuildCodexLoginCommandInput,
): ProviderAccountCommand {
  if (!input.configDir.trim()) {
    throw new Error(
      'Enrolling a Codex account requires its own CODEX_HOME, or the login ' +
        'would overwrite the shared one.',
    )
  }

  return {
    command: input.binaryPath,
    args: ['login'],
    env: buildCodexAccountEnv({
      baseEnv: input.baseEnv,
      account: { configDir: input.configDir },
    }),
  }
}

export function buildCodexAccountLogoutCommand(
  input: BuildCodexLoginCommandInput,
): ProviderAccountCommand {
  if (!input.configDir.trim()) {
    throw new Error(
      'Removing a Codex account requires its own CODEX_HOME, or the logout ' +
        'would sign out the shared one.',
    )
  }

  return {
    command: input.binaryPath,
    args: ['logout'],
    env: buildCodexAccountEnv({
      baseEnv: input.baseEnv,
      account: { configDir: input.configDir },
    }),
  }
}

/**
 * Permissions for the credential file Codex writes in plaintext. The keychain
 * does this job for Claude; here it is the filesystem's, and only ours to
 * enforce because a world-readable `auth.json` is a credential anyone on the
 * machine can copy.
 */
export const CODEX_AUTH_FILE_MODE = 0o600

export const CODEX_AUTH_FILE_NAME = 'auth.json'

export interface CodexAccountIdentity {
  email: string | null
  /** The ChatGPT account the login belongs to; the Codex analogue of an org. */
  orgId: string | null
  plan: string | null
}

/**
 * Reads the identity a Codex home reports about itself, from the same
 * `auth.json` the quota reader already parses. Never from `codex login status`:
 * under a shared home that reports whichever login happened last, independent
 * of the credential a given account actually holds.
 */
export function readCodexIdentityFromAuth(
  auth: unknown,
): CodexAccountIdentity | null {
  const root = asRecord(auth)
  const tokens = asRecord(root?.tokens)
  if (!tokens) return null

  const idToken = asRecord(tokens.id_token)
  const email = readString(idToken?.email)
  const orgId =
    readString(tokens.account_id) ?? readString(idToken?.chatgpt_account_id)
  // The tier, where the login records one. Never inferred from a role or a
  // capability list — an absent tier is reported as absent.
  const plan =
    readString(idToken?.chatgpt_plan_type) ??
    readString(
      asRecord(idToken?.['https://api.openai.com/auth'])?.chatgpt_plan_type,
    )

  if (!email && !orgId) return null

  return { email, orgId, plan }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
