/**
 * Spawn-time reconciliation of the per-account `.claude.json` (ADR 0007).
 *
 * Project trust and the `mcpServers` list live inside the per-account
 * `.claude.json`, which is the one file deliberately *not* shared by symlink.
 * Seeding it at enrolment is not enough: accounts drift apart as new projects
 * are trusted and new servers added afterwards. The shared `~/.claude.json`
 * stays the source of truth for both, and the active account's copy is
 * reconciled against it at spawn.
 *
 * Trust is copied, never invented. If the user has not trusted a directory in
 * the shared profile, nothing is written and Claude asks, exactly as it would
 * today.
 */

const TRUST_KEY = 'hasTrustDialogAccepted'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export interface ReconcileAccountClaudeConfigInput {
  /** Parsed per-account `.claude.json`, or null when it does not exist yet. */
  accountConfig: Record<string, unknown> | null
  /** Parsed shared `~/.claude.json`, or null when unreadable. */
  sharedConfig: Record<string, unknown> | null
  /** The session's working directory, whose trust entry is reconciled. */
  workingDirectory: string
}

export interface ReconcileAccountClaudeConfigResult {
  config: Record<string, unknown>
  /** False when the account file already agreed — nothing needs writing. */
  changed: boolean
}

/**
 * Copies the shared `mcpServers` list and the trust flag for one directory
 * into the account config, leaving every other key — identity, organization
 * caches, and the per-slot `mcpOAuth` tokens that make connector auth survive
 * a swap — untouched.
 */
export function reconcileAccountClaudeConfig(
  input: ReconcileAccountClaudeConfigInput,
): ReconcileAccountClaudeConfigResult {
  const config: Record<string, unknown> = { ...(input.accountConfig ?? {}) }
  let changed = input.accountConfig === null

  const sharedServers = isRecord(input.sharedConfig?.mcpServers)
    ? input.sharedConfig.mcpServers
    : null
  if (sharedServers) {
    const current = isRecord(config.mcpServers) ? config.mcpServers : null
    if (!current || !sameJson(current, sharedServers)) {
      config.mcpServers = { ...sharedServers }
      changed = true
    }
  }

  const sharedTrust = readTrustFlag(input.sharedConfig, input.workingDirectory)
  if (sharedTrust !== undefined) {
    const projects = isRecord(config.projects) ? { ...config.projects } : {}
    const existing = isRecord(projects[input.workingDirectory])
      ? (projects[input.workingDirectory] as Record<string, unknown>)
      : {}

    if (existing[TRUST_KEY] !== sharedTrust) {
      projects[input.workingDirectory] = {
        ...existing,
        [TRUST_KEY]: sharedTrust,
      }
      config.projects = projects
      changed = true
    }
  }

  return { config, changed }
}

function readTrustFlag(
  config: Record<string, unknown> | null,
  workingDirectory: string,
): boolean | undefined {
  const projects = isRecord(config?.projects) ? config.projects : null
  const project = isRecord(projects?.[workingDirectory])
    ? (projects[workingDirectory] as Record<string, unknown>)
    : null
  const value = project?.[TRUST_KEY]
  return typeof value === 'boolean' ? value : undefined
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Variable names an `mcpServers` block depends on inheriting.
 *
 * Two sources: `${VAR}` references, which Claude expands from its own
 * environment, and the keys of each server's `env` block, since a config that
 * declares a variable and leaves it empty is the idiom for "inherit this".
 * Deriving the names from configuration is what keeps the allowlist honest —
 * the alternative is guessing which variables somebody's server needs.
 */
export function collectMcpEnvPassthroughNames(mcpServers: unknown): string[] {
  if (!isRecord(mcpServers)) return []

  const names = new Set<string>()

  for (const server of Object.values(mcpServers)) {
    if (!isRecord(server)) continue

    if (isRecord(server.env)) {
      for (const name of Object.keys(server.env)) {
        names.add(name)
      }
    }

    for (const name of collectVariableReferences(server)) {
      names.add(name)
    }
  }

  return [...names]
}

const VARIABLE_REFERENCE = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-[^}]*)?\}/g

function collectVariableReferences(value: unknown): string[] {
  if (typeof value === 'string') {
    return [...value.matchAll(VARIABLE_REFERENCE)].map((match) => match[1])
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectVariableReferences)
  }
  if (isRecord(value)) {
    return Object.values(value).flatMap(collectVariableReferences)
  }
  return []
}
