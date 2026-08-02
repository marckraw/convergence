/**
 * Child-environment construction for Claude provider processes (ADR 0007).
 *
 * Documented authentication precedence places `ANTHROPIC_AUTH_TOKEN`,
 * `ANTHROPIC_API_KEY`, `apiKeyHelper` and `CLAUDE_CODE_OAUTH_TOKEN` above
 * subscription OAuth, so any inherited credential silently outranks the
 * selected account. A blocklist can only enumerate the variables that exist
 * today; a future release that adds one would regress account selection with
 * no visible failure. The environment is therefore built from an allowlist.
 *
 * Both list styles rot. The difference is how: a stale blocklist means the
 * wrong account, invisibly; a stale allowlist means a missing MCP server or
 * missing telemetry, loudly. The loud failure is the one worth having.
 *
 * **The allowlist applies only when an account is selected.** With no account
 * — the ambient default, i.e. the shared `~/.claude` credential — the child
 * environment is today's environment untouched, because there is no selection
 * to outrank and stripping inherited variables would itself be a behaviour
 * change.
 */

/**
 * Inherited variables a Claude process (and the stdio MCP servers it spawns)
 * needs to behave normally. Grows loudly: when something breaks under a
 * selected account, the fix is a name added here.
 */
export const CLAUDE_ACCOUNT_ENV_ALLOWLIST: readonly string[] = [
  // Process basics
  'PATH',
  'HOME',
  'SHELL',
  'USER',
  'LOGNAME',
  'TMPDIR',
  'TERM',
  'TERM_PROGRAM',
  'TERM_PROGRAM_VERSION',
  'COLORTERM',
  'LANG',
  'LANGUAGE',
  'LC_ALL',
  'LC_CTYPE',
  'LC_MESSAGES',
  'TZ',
  '__CF_USER_TEXT_ENCODING',
  // Network and TLS trust
  'HTTP_PROXY',
  'http_proxy',
  'HTTPS_PROXY',
  'https_proxy',
  'ALL_PROXY',
  'all_proxy',
  'NO_PROXY',
  'no_proxy',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'REQUESTS_CA_BUNDLE',
  'CURL_CA_BUNDLE',
  // Toolchain roots, so PATH-resolved shims still resolve for stdio MCP servers
  'NVM_DIR',
  'NVM_BIN',
  'FNM_DIR',
  'FNM_MULTISHELL_PATH',
  'VOLTA_HOME',
  'ASDF_DIR',
  'ASDF_DATA_DIR',
  'PYENV_ROOT',
  'JAVA_HOME',
  'GOPATH',
  'CARGO_HOME',
  'RUSTUP_HOME',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_CACHE_HOME',
  // Claude Code behaviour switches that carry no credential
  'CLAUDE_CODE_ENABLE_TELEMETRY',
  'CLAUDE_CODE_MAX_OUTPUT_TOKENS',
  'DISABLE_TELEMETRY',
  'DISABLE_ERROR_REPORTING',
  'DISABLE_AUTOUPDATER',
  'DISABLE_NON_ESSENTIAL_MODEL_CALLS',
  'MAX_THINKING_TOKENS',
  'BASH_DEFAULT_TIMEOUT_MS',
  'BASH_MAX_TIMEOUT_MS',
  'BASH_MAX_OUTPUT_LENGTH',
  'MCP_TIMEOUT',
  'MCP_TOOL_TIMEOUT',
  'MAX_MCP_OUTPUT_TOKENS',
]

/**
 * Prefixes passed through wholesale.
 *
 * `OTEL_` carries the user's own skill-telemetry configuration — Convergence
 * only injects its embedded sink when the user has not configured one, so
 * dropping these would silently disable telemetry the user set up.
 * `CONVERGENCE_` is our own injection channel, including
 * `CONVERGENCE_CLAUDE_DEFERRED_TOOL_RESPONSE`, which the AskUserQuestion hook
 * reads out of its own environment.
 */
export const CLAUDE_ACCOUNT_ENV_PASSTHROUGH_PREFIXES: readonly string[] = [
  'OTEL_',
  'CONVERGENCE_',
]

/**
 * Never inherited, whatever else says so.
 *
 * The first four outrank subscription OAuth in Claude's documented auth
 * precedence; the cloud selectors redirect the process to a different provider
 * entirely; the two directory variables are set from the account itself, so an
 * inherited copy could only fight it.
 */
export const CLAUDE_ACCOUNT_ENV_FORBIDDEN: readonly string[] = [
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CCR_OAUTH_TOKEN_FILE',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CONFIG_DIR',
  'CLAUDE_SECURESTORAGE_CONFIG_DIR',
]

/** The account half of the environment: which credential slot to open. */
export interface ClaudeAccountEnvTarget {
  configDir: string
  credentialDir: string
}

export interface BuildClaudeAccountEnvInput {
  /** Normally `process.env`. */
  baseEnv: NodeJS.ProcessEnv
  /** `null` selects the ambient default account and disables the allowlist. */
  account: ClaudeAccountEnvTarget | null
  /**
   * Extra variable names to inherit, derived from the account's own
   * `mcpServers` configuration rather than guessed.
   */
  passthroughNames?: readonly string[]
  /** Values Convergence sets itself; applied last, over everything. */
  injections?: NodeJS.ProcessEnv
}

function isPassedThrough(
  name: string,
  passthroughNames: ReadonlySet<string>,
): boolean {
  return (
    CLAUDE_ACCOUNT_ENV_ALLOWLIST.includes(name) ||
    passthroughNames.has(name) ||
    CLAUDE_ACCOUNT_ENV_PASSTHROUGH_PREFIXES.some((prefix) =>
      name.startsWith(prefix),
    )
  )
}

export function buildClaudeAccountEnv(
  input: BuildClaudeAccountEnvInput,
): NodeJS.ProcessEnv {
  if (!input.account) {
    // Ambient default account: byte-equivalent to the environment Convergence
    // has always spawned Claude with.
    return { ...input.baseEnv, ...input.injections }
  }

  const forbidden = new Set(CLAUDE_ACCOUNT_ENV_FORBIDDEN)
  const passthroughNames = new Set(
    (input.passthroughNames ?? []).filter((name) => !forbidden.has(name)),
  )

  const env: NodeJS.ProcessEnv = {}
  for (const [name, value] of Object.entries(input.baseEnv)) {
    if (value === undefined) continue
    if (forbidden.has(name)) continue
    if (!isPassedThrough(name, passthroughNames)) continue
    env[name] = value
  }

  env.CLAUDE_CONFIG_DIR = input.account.configDir
  env.CLAUDE_SECURESTORAGE_CONFIG_DIR = input.account.credentialDir

  Object.assign(env, input.injections)

  assertNoInheritedCredentials(env, input.account)
  return env
}

/**
 * Defence in depth. Unreachable while the lists above are consistent, which is
 * exactly why it is worth having: it turns a future edit that allowlists a
 * credential variable into a loud failure instead of a silently wrong account.
 */
function assertNoInheritedCredentials(
  env: NodeJS.ProcessEnv,
  account: ClaudeAccountEnvTarget,
): void {
  for (const name of CLAUDE_ACCOUNT_ENV_FORBIDDEN) {
    if (
      name === 'CLAUDE_CONFIG_DIR' ||
      name === 'CLAUDE_SECURESTORAGE_CONFIG_DIR'
    ) {
      continue
    }
    if (env[name] !== undefined) {
      throw new Error(
        `Refusing to spawn Claude for a selected account with ${name} in the ` +
          'environment: it outranks subscription OAuth and would silently ' +
          'serve a different identity.',
      )
    }
  }

  if (
    env.CLAUDE_CONFIG_DIR !== account.configDir ||
    env.CLAUDE_SECURESTORAGE_CONFIG_DIR !== account.credentialDir
  ) {
    throw new Error(
      'Refusing to spawn Claude with account directories that do not match ' +
        'the selected account.',
    )
  }
}
