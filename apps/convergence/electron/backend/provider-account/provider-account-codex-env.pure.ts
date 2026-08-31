import {
  CLAUDE_ACCOUNT_ENV_PASSTHROUGH_PREFIXES,
  PROVIDER_ACCOUNT_ENV_BASE_ALLOWLIST,
} from './provider-account-env.pure'

/**
 * Child-environment construction for Codex processes (ADR 0007, PA9).
 *
 * Codex keeps its ChatGPT credential in a plaintext `auth.json` inside
 * `CODEX_HOME`, so account isolation is a directory rather than a keychain
 * slot. The investigation measured the property this relies on: an empty
 * `CODEX_HOME` yields 401 rather than falling back to the ambient login, so an
 * account whose directory is wrong fails closed instead of quietly spending
 * somebody else's subscription.
 *
 * Same allowlist discipline as Claude, and for the same reason: `OPENAI_API_KEY`
 * in the environment outranks the ChatGPT login, and a blocklist could only
 * enumerate the names that exist today. As with Claude, **the allowlist applies
 * only when an account is selected** — with none, the environment is today's
 * environment untouched.
 */

/** Codex behaviour switches that carry no credential. */
export const CODEX_ACCOUNT_ENV_ALLOWLIST: readonly string[] = [
  ...PROVIDER_ACCOUNT_ENV_BASE_ALLOWLIST,
  'RUST_LOG',
  'RUST_BACKTRACE',
  'CODEX_SANDBOX',
  'CODEX_SANDBOX_NETWORK_DISABLED',
]

/**
 * Never inherited when an account is selected. The API keys outrank the
 * ChatGPT login Codex accounts are built on, and `CODEX_HOME` is set from the
 * account itself, so an inherited copy could only fight it.
 */
export const CODEX_ACCOUNT_ENV_FORBIDDEN: readonly string[] = [
  'OPENAI_API_KEY',
  'CODEX_API_KEY',
  'OPENAI_BASE_URL',
  'CODEX_HOME',
]

/** The account half of the environment: which `CODEX_HOME` to open. */
export interface CodexAccountEnvTarget {
  /** `CODEX_HOME`. The `auth.json` inside it is the credential. */
  configDir: string
}

export interface BuildCodexAccountEnvInput {
  baseEnv: NodeJS.ProcessEnv
  /** `null` selects the ambient `~/.codex` login and disables the allowlist. */
  account: CodexAccountEnvTarget | null
  injections?: NodeJS.ProcessEnv
}

export function buildCodexAccountEnv(
  input: BuildCodexAccountEnvInput,
): NodeJS.ProcessEnv {
  if (!input.account) {
    // Ambient default account: byte-equivalent to the environment Convergence
    // has always spawned Codex with.
    return { ...input.baseEnv, ...input.injections }
  }

  const forbidden = new Set(CODEX_ACCOUNT_ENV_FORBIDDEN)
  const env: NodeJS.ProcessEnv = {}

  for (const [name, value] of Object.entries(input.baseEnv)) {
    if (value === undefined) continue
    if (forbidden.has(name)) continue
    if (!isPassedThrough(name)) continue
    env[name] = value
  }

  env.CODEX_HOME = input.account.configDir

  Object.assign(env, input.injections)

  assertNoInheritedCredentials(env, input.account)
  return env
}

function isPassedThrough(name: string): boolean {
  return (
    CODEX_ACCOUNT_ENV_ALLOWLIST.includes(name) ||
    CLAUDE_ACCOUNT_ENV_PASSTHROUGH_PREFIXES.some((prefix) =>
      name.startsWith(prefix),
    )
  )
}

/**
 * Defence in depth, mirroring the Claude boundary: a future edit that
 * allowlists a credential variable becomes a loud failure rather than a
 * silently wrong account.
 */
function assertNoInheritedCredentials(
  env: NodeJS.ProcessEnv,
  account: CodexAccountEnvTarget,
): void {
  for (const name of CODEX_ACCOUNT_ENV_FORBIDDEN) {
    if (name === 'CODEX_HOME') continue
    if (env[name] !== undefined) {
      throw new Error(
        `Refusing to spawn Codex for a selected account with ${name} in the ` +
          'environment: it outranks the ChatGPT login and would silently ' +
          'serve a different identity.',
      )
    }
  }

  if (env.CODEX_HOME !== account.configDir) {
    throw new Error(
      'Refusing to spawn Codex with a CODEX_HOME that does not match the ' +
        'selected account.',
    )
  }
}
