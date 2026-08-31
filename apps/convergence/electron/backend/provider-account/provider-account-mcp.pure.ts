import { buildClaudeAccountEnv } from './provider-account-env.pure'
import type { ClaudeAccountEnvTarget } from './provider-account-env.pure'
import type { ProviderAccountCommand } from './provider-account-enrolment.pure'
import {
  stripTerminalControlSequences,
  summarizeTerminalOutput,
} from './provider-account-pty-runner.pure'

/**
 * Per-account MCP connector authorization (ADR 0007, PA11).
 *
 * MCP OAuth tokens are namespaced per credential slot, which is what makes the
 * hot-swap design bearable: each account authorizes a connector **once** and
 * keeps that authorization across every future swap — unlike the manual logout
 * flow this design replaced, which destroyed tokens on every switch.
 *
 * The corollary is that authorization has to run *as the account*. A
 * `claude mcp login` spawned with the ambient environment writes its tokens
 * into the default slot, so the account the user asked for stays
 * unauthenticated while the app reports success. That is the failure this
 * module exists to prevent, and it is why the command is built through
 * `buildClaudeAccountEnv` rather than assembled by hand at a call site.
 *
 * ## Probe-first: what is asserted vs what is assumed
 *
 * Asserted here and covered by tests: the *environment* a login runs under,
 * and that a failure the stream reports is turned into an actionable note
 * rather than a silent tool degradation.
 *
 * **Assumed, and flagged for live verification (PA11 QA):** the exact CLI
 * surface — that `claude mcp login <server>` is the subcommand name in the
 * installed Claude Code, and the precise wording it and the session stream use
 * when a server needs authentication. Both are concentrated here as data so a
 * single live probe can correct them without touching a call site.
 */

/** Argument vector for authorizing one server. Isolated so a probe can fix it. */
export const CLAUDE_MCP_LOGIN_SUBCOMMAND: readonly string[] = ['mcp', 'login']

/**
 * Upstream's flag for authorizing without a browser handoff. Used when the
 * session cannot open one, so the user is told what to do instead of watching
 * nothing happen.
 */
export const CLAUDE_MCP_NO_BROWSER_FLAG = '--no-browser'

export interface BuildClaudeMcpLoginCommandInput {
  binaryPath: string
  /** `null` authorizes the ambient default account, which is still a choice. */
  account: ClaudeAccountEnvTarget | null
  serverName: string
  baseEnv: NodeJS.ProcessEnv
  /**
   * False when the surface asking for authorization cannot hand off to a
   * browser. Adds the upstream fallback flag rather than pretending.
   */
  canOpenBrowser?: boolean
  workingDirectory?: string
}

export function buildClaudeMcpLoginCommand(
  input: BuildClaudeMcpLoginCommandInput,
): ProviderAccountCommand {
  const serverName = input.serverName.trim()
  if (!serverName) {
    throw new Error('Authorizing a connector requires the server name.')
  }

  const args = [...CLAUDE_MCP_LOGIN_SUBCOMMAND, serverName]
  if (input.canOpenBrowser === false) {
    args.push(CLAUDE_MCP_NO_BROWSER_FLAG)
  }

  return {
    command: input.binaryPath,
    args,
    env: buildClaudeAccountEnv({
      baseEnv: input.baseEnv,
      account: input.account,
    }),
    ...(input.workingDirectory ? { cwd: input.workingDirectory } : {}),
  }
}

/**
 * Wordings that mean the login did not authorize anything, as data (PA11.1).
 *
 * A terminal has one stream, so a failure arrives as text rather than as
 * something written to stderr — and a CLI that prints an error can still exit
 * 0. Both halves are checked because the failure this guards against is the
 * lying one: reporting success while the account stays unauthorized.
 *
 * The first two entries are verbatim from the field (Marcin's QA on the
 * installed build, 2026-08-05). **Flagged for live verification:** the rest is
 * standard OAuth vocabulary; a miss here degrades to trusting the exit code,
 * which is the pre-PTY behaviour rather than a wrong claim.
 */
export const CLAUDE_MCP_LOGIN_FAILURE_PATTERNS: readonly RegExp[] = [
  // Both apostrophes, because the CLI types curly ones and a straight-quote
  // pattern silently matches nothing — which would fail in the lying direction.
  /couldn['’]?t complete authentication/i,
  /stdin isn['’]?t a terminal/i,
  /authentication (?:failed|was cancell?ed)/i,
  /failed to authenticate/i,
  /authorization failed/i,
]

export interface ClaudeMcpLoginOutcome {
  ok: boolean
  /** What to tell the person. Null when the authorization worked. */
  message: string | null
}

/**
 * Did this login actually authorize the server?
 *
 * Reads the terminal the way a person would: the exit code first, then what
 * was on screen. Anything unrecognised counts as success, because the caller
 * re-reads `mcp list` afterwards — the row's truth comes from the provider,
 * not from this guess, and refusing to believe an unfamiliar success would
 * block that refresh.
 */
export function interpretClaudeMcpLoginOutcome(input: {
  exitCode: number
  output: string
}): ClaudeMcpLoginOutcome {
  const text = stripTerminalControlSequences(input.output)
  const saidItFailed = CLAUDE_MCP_LOGIN_FAILURE_PATTERNS.some((pattern) =>
    pattern.test(text),
  )

  if (input.exitCode === 0 && !saidItFailed) {
    return { ok: true, message: null }
  }

  const tail = summarizeTerminalOutput(input.output)
  return {
    ok: false,
    message:
      tail ||
      (input.exitCode === 0
        ? 'the command reported an authentication failure'
        : `exit code ${input.exitCode}`),
  }
}

/**
 * Listing a server's status has to run as the account too: `claude mcp list`
 * reports whichever credential slot the environment points at, so the ambient
 * answer says nothing about whether *this* account has authorized anything.
 */
export const CLAUDE_MCP_LIST_SUBCOMMAND: readonly string[] = ['mcp', 'list']

export function buildClaudeMcpListCommand(input: {
  binaryPath: string
  account: ClaudeAccountEnvTarget | null
  baseEnv: NodeJS.ProcessEnv
  workingDirectory?: string
}): ProviderAccountCommand {
  return {
    command: input.binaryPath,
    args: [...CLAUDE_MCP_LIST_SUBCOMMAND],
    env: buildClaudeAccountEnv({
      baseEnv: input.baseEnv,
      account: input.account,
    }),
    ...(input.workingDirectory ? { cwd: input.workingDirectory } : {}),
  }
}

/**
 * Wordings that mean "this MCP server needs authorizing", as data.
 *
 * Deliberately a list rather than one regex: these are strings from a CLI
 * Convergence does not own, they differ between the `mcp list` table and the
 * session stream, and they change between releases. A miss here degrades to
 * today's behaviour — a tool that quietly does not work — rather than to a
 * wrong claim, which is the right direction to fail.
 *
 * **Flagged for live verification:** collected from the shapes Convergence
 * already parses (`mapClaudeStatus` matches "Needs authentication") plus the
 * standard OAuth vocabulary. A live probe should confirm the exact stream
 * wording and prune whatever never appears.
 */
export const CLAUDE_MCP_AUTH_FAILURE_PATTERNS: readonly RegExp[] = [
  /needs? authentication/i,
  /not authenticated/i,
  /authentication required/i,
  /requires? (?:authentication|authorization)/i,
  /unauthorized/i,
  /oauth token (?:has )?expired/i,
  /re-?authenticate/i,
]

/**
 * Server names as they appear around such a failure. Only the shapes that
 * actually name a server are matched — an authentication failure Convergence
 * cannot attribute to a server produces no note at all, because a note that
 * cannot say *which* connector to authorize is worse than none.
 */
const SERVER_NAME_PATTERNS: readonly RegExp[] = [
  /MCP server ["'`]?([\w.@/-]+)["'`]?/i,
  /server ["'`]?([\w.@/-]+)["'`]? (?:needs|requires)/i,
  /^([\w.@/-]+):\s/,
  /mcp__([a-z0-9_]+?)__/i,
]

export interface ClaudeMcpAuthFailure {
  serverName: string
}

/**
 * Recognises an auth-shaped MCP failure in provider output.
 *
 * Both halves must hold: the text has to look like an authentication problem
 * *and* name a server. Matching only the first would let an unrelated
 * "unauthorized" in a tool result produce a bogus authorize prompt.
 */
export function matchClaudeMcpAuthFailure(
  text: unknown,
): ClaudeMcpAuthFailure | null {
  if (typeof text !== 'string') return null
  const candidate = text.trim()
  if (!candidate) return null

  if (!CLAUDE_MCP_AUTH_FAILURE_PATTERNS.some((p) => p.test(candidate))) {
    return null
  }

  for (const pattern of SERVER_NAME_PATTERNS) {
    const serverName = pattern.exec(candidate)?.[1]?.trim()
    if (serverName) return { serverName }
  }

  return null
}

export interface DescribeMcpAuthorizationNoteInput {
  serverName: string
  /** Who the turn ran as. Null is the ambient default account. */
  accountLabel: string | null
  /**
   * False in a session that cannot hand off to a browser. The run-6 lesson:
   * say so, rather than offering an action that will appear to do nothing.
   */
  canOpenBrowser: boolean
}

/**
 * The dirty-reconnection note.
 *
 * Names the server **and** the account, because with several accounts on one
 * machine "Linear needs authentication" is ambiguous in exactly the way that
 * wastes someone's afternoon: the connector may be perfectly authorized under
 * the account they used yesterday.
 */
export function describeMcpAuthorizationNote(
  input: DescribeMcpAuthorizationNoteInput,
): string {
  const account = input.accountLabel ?? 'the default account'
  const head = `**${input.serverName}** is not authorized for ${account}, so its tools were unavailable for this turn.`

  return input.canOpenBrowser
    ? `${head} Authorize it for this account to use it here.`
    : `${head} This session cannot open a browser, so authorize it from Settings → Accounts → Connectors.`
}
