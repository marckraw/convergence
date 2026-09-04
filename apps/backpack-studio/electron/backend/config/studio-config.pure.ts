/**
 * Where Backpack Studio works, read once from the environment (MAR-2770).
 *
 * v1 is hardcoded to one machine by constitution law 6 — no accounts, no
 * endpoint picker, no daemon URL in the UI — so "hardcoded" here means four
 * environment variables the person running the app never sees. They are read in
 * the main process and nowhere else.
 *
 * The token is the reason this file is pure and returns a value rather than
 * logging one. It is carried in a field that no code path prints, no snapshot
 * carries and no IPC channel exposes; the only thing that ever leaves this
 * module with the token inside it is an `Authorization` header. A missing token
 * is reported by NAME — `BACKPACK_STUDIO_DAEMON_TOKEN` — and never by value,
 * which is also why `describeMissing` takes the names and not the environment.
 */

/** The environment variable names, in the order the honest screen lists them. */
export const STUDIO_ENV_KEYS = {
  daemonUrl: 'BACKPACK_STUDIO_DAEMON_URL',
  daemonToken: 'BACKPACK_STUDIO_DAEMON_TOKEN',
  daemonProject: 'BACKPACK_STUDIO_DAEMON_PROJECT',
  provider: 'BACKPACK_STUDIO_PROVIDER',
} as const

/**
 * The provider id Studio asks the daemon for when nothing says otherwise.
 *
 * `claude` and not `claude-code`: the daemon this app is aimed at advertises
 * `{"claude":true,"codex":true,"cursor":false,"gemini":false}` in the `/health`
 * body captured verbatim in `DAEMON_HEALTH_FIXTURE_0_26_1`, and a start naming
 * a provider it does not have is refused. The id belongs to the daemon's
 * namespace, not to a product name, which is exactly why the variable exists —
 * a machine that names it differently is one `BACKPACK_STUDIO_PROVIDER` away.
 */
export const DEFAULT_STUDIO_PROVIDER_ID = 'claude'

export interface StudioConfig {
  daemonBaseUrl: string
  /** Main-process only. Never crosses the preload boundary. */
  daemonToken: string
  /** The directory on the daemon the Entity works in. */
  daemonProject: string
  providerId: string
}

export type StudioConfigReading =
  | { ok: true; config: StudioConfig }
  | { ok: false; missing: string[] }

/**
 * Reads the configuration out of an environment-shaped record.
 *
 * A variable that is present but blank counts as missing: an empty base URL is
 * not a machine and an empty token is not a credential, and treating either as
 * configured turns a setup mistake into a network error nobody can read.
 *
 * The provider is the one variable with a default, so it can never be missing.
 */
export function readStudioConfig(
  env: Record<string, string | undefined>,
): StudioConfigReading {
  const daemonBaseUrl = trimmed(env[STUDIO_ENV_KEYS.daemonUrl])
  const daemonToken = trimmed(env[STUDIO_ENV_KEYS.daemonToken])
  const daemonProject = trimmed(env[STUDIO_ENV_KEYS.daemonProject])
  const providerId =
    trimmed(env[STUDIO_ENV_KEYS.provider]) ?? DEFAULT_STUDIO_PROVIDER_ID

  const missing: string[] = [
    [daemonBaseUrl, STUDIO_ENV_KEYS.daemonUrl],
    [daemonToken, STUDIO_ENV_KEYS.daemonToken],
    [daemonProject, STUDIO_ENV_KEYS.daemonProject],
  ]
    .filter(([value]) => value === null)
    .map(([, name]) => name as string)

  if (
    daemonBaseUrl === null ||
    daemonToken === null ||
    daemonProject === null
  ) {
    return { ok: false, missing }
  }
  return {
    ok: true,
    config: { daemonBaseUrl, daemonToken, daemonProject, providerId },
  }
}

/**
 * Parses a `.env` file's text into an environment-shaped record.
 *
 * Studio is run from dev by Marcin's hand (constitution law 13), so the four
 * variables live in a gitignored `.env` beside the app rather than in his
 * shell. This reads the small subset such a file actually uses — `KEY=value`,
 * comments, blank lines, `export` prefixes, and quotes around a value — and
 * ignores anything it does not recognise rather than guessing at it.
 *
 * A real environment variable always wins over the file (see `mergeEnv`),
 * because the shell is the more deliberate of the two.
 */
export function parseDotEnv(text: string): Record<string, string> {
  const values: Record<string, string> = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue
    const withoutExport = line.startsWith('export ')
      ? line.slice('export '.length).trim()
      : line
    const separator = withoutExport.indexOf('=')
    if (separator <= 0) continue
    const key = withoutExport.slice(0, separator).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
    values[key] = unquote(withoutExport.slice(separator + 1).trim())
  }
  return values
}

/**
 * The environment the app actually reads: the process's own, with the `.env`
 * file standing in only where the process says nothing.
 *
 * "Says nothing" means the key is absent — an explicitly blank variable is a
 * deliberate answer and is not overridden, so `BACKPACK_STUDIO_PROVIDER=` in a
 * shell falls back to the default rather than silently picking up a stale
 * value from a file.
 */
export function mergeEnv(
  processEnv: Record<string, string | undefined>,
  fileEnv: Record<string, string>,
): Record<string, string | undefined> {
  const merged: Record<string, string | undefined> = { ...fileEnv }
  for (const [key, value] of Object.entries(processEnv)) {
    if (value !== undefined) merged[key] = value
  }
  return merged
}

/**
 * The honest screen's sentence, built from names alone.
 *
 * It takes the missing names rather than the environment so that no call site
 * can hand a value to something that formats text.
 */
export function describeMissing(missing: readonly string[]): string {
  if (missing.length === 0) return 'Backpack Studio is configured.'
  const list = missing.join(', ')
  return missing.length === 1
    ? `Backpack Studio needs ${list} before it can reach the daemon.`
    : `Backpack Studio needs these before it can reach the daemon: ${list}.`
}

function trimmed(value: string | undefined): string | null {
  if (value === undefined) return null
  const text = value.trim()
  return text === '' ? null : text
}

function unquote(value: string): string {
  const quoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  return quoted && value.length >= 2 ? value.slice(1, -1) : value
}
