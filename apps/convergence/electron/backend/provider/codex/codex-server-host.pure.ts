import { compareSemver } from '../provider-status.pure'

/**
 * The line the app-server prints on stderr when it binds its listener.
 *
 * Measured against codex-cli 0.153.4 on 2026-09-05:
 *
 * ```
 * codex app-server (WebSockets)
 *   listening on: ws://127.0.0.1:61988
 *   readyz: http://127.0.0.1:61988/readyz
 * ```
 *
 * The line terminator is required, and it is the whole point: stderr arrives in
 * chunks the writer never chose, so a chunk that ends inside the port
 * (`ws://127.0.0.1:5` of `…:5150`) reads as a perfectly well-formed URL. The
 * host commits to the first address it is given and never re-reads, so half a
 * port would send every readiness probe to a port nobody listens on and the
 * server would be reported as "never became ready" (MAR-2823 F8).
 */
export function parseCodexListeningUrl(stderr: string): string | null {
  const match = stderr.match(
    /listening on:[^\S\r\n]*(ws:\/\/[^\s]*)[^\S\r\n]*\r?\n/,
  )
  const url = match?.[1]?.trim()
  if (!url) return null
  // A trailing punctuation mark would make the URL unparseable later, where
  // the failure would read as "the server never became ready".
  return url.replace(/[.,;]+$/, '')
}

/**
 * Turns the listener URL into the readiness probe URL.
 *
 * Readiness is observed on plain HTTP against the same port, and the request
 * must carry no `Origin`: the server answers 200 without one and **403 with
 * one** (measured, constitution A3) — a 403 read as "not ready" would turn a
 * healthy server into a permanent warm-up.
 */
export function buildCodexReadyUrl(listeningUrl: string): string | null {
  try {
    const url = new URL(listeningUrl)
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') return null
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:'
    url.pathname = '/readyz'
    return url.toString()
  } catch {
    return null
  }
}

/**
 * Identity of a resident server: one per execution host, per Codex home.
 *
 * The home is the account (ADR 0007, PA9) — two accounts are two credentials
 * and two state directories, so they can never share a process; two sessions
 * on one account always must.
 */
export function codexServerKey(input: {
  executionHostId: string | null | undefined
  codexHome: string | null | undefined
}): string {
  const host = input.executionHostId?.trim() || 'local'
  const home = input.codexHome?.trim() || 'ambient-default'
  return `${host}::${home}`
}

/**
 * The first codex-cli that can host the resident server.
 *
 * `--listen ws://` and `thread/unsubscribe` are what the design rests on; both
 * were measured on 0.153.4 and neither existed in the 0.14x line Convergence
 * used to spawn per turn.
 */
export const CODEX_RESIDENT_SERVER_MIN_VERSION = '0.153.0'

/**
 * An unreadable version is treated as **supported**, which is the opposite of
 * the call `piSupportsAgentSettled` makes, for the opposite reason.
 *
 * Pi has no observation to fall back on, so it guesses pessimistically. Here
 * the readiness probe *is* the observation: a binary that cannot host the
 * server never answers `/readyz`, and that failure arrives named, with the
 * process's own stderr attached. Refusing on an unreadable string would mean a
 * change in the format of `codex --version` silently disables Codex entirely,
 * with no fallback path left to catch it (the per-turn spawn is gone).
 */
export function supportsResidentCodexServer(
  version: string | null | undefined,
): boolean {
  if (!version || !version.trim()) return true

  const comparison = compareSemver(version, CODEX_RESIDENT_SERVER_MIN_VERSION)
  if (comparison === null) return true
  return comparison >= 0
}

export function buildCodexVersionRefusal(version: string | null): string {
  return (
    `Codex ${version ?? 'unknown'} is too old for Convergence: the resident app-server needs ` +
    `codex-cli ${CODEX_RESIDENT_SERVER_MIN_VERSION} or newer. Update Codex and restart Convergence.`
  )
}

export type CodexUnsubscribeStatus =
  | 'unsubscribed'
  | 'notSubscribed'
  | 'notLoaded'

/**
 * `thread/unsubscribe` answers with a status, and none of the three is an
 * error (measured: unsubscribed → notSubscribed → notLoaded across repeated
 * calls). Releasing a session that the server had already dropped is a normal
 * outcome, not a failure to report.
 */
export function readCodexUnsubscribeStatus(
  payload: unknown,
): CodexUnsubscribeStatus | null {
  if (!payload || typeof payload !== 'object') return null
  const status = (payload as { status?: unknown }).status
  return status === 'unsubscribed' ||
    status === 'notSubscribed' ||
    status === 'notLoaded'
    ? status
    : null
}

/**
 * What the session says when the resident server dies underneath it.
 *
 * The stderr tail is the only place the process ever explains itself
 * (MAR-2317), and the sentence has to promise the right thing: the server
 * comes back by itself on the next message, and the thread survives on disk.
 */
export function buildCodexServerObituary(input: {
  code: number | null
  signal: string | null
  stderrTail: string
}): string {
  const cause =
    input.code !== null
      ? `exited with code ${input.code}`
      : `was stopped by ${input.signal ?? 'an unknown signal'}`
  const tail = input.stderrTail.trim()
  const suffix = tail ? `: ${tail}` : ''
  return `The Codex app-server ${cause}${suffix}. The next message starts a fresh one and resumes this thread.`
}

/**
 * Whether a turn we sent but never saw acknowledged actually landed.
 *
 * The user message the server recorded carries the `clientId` we generated for
 * it, so the thread's own turn list answers the question that decides between
 * resending and adopting. Measured shape (0.153.4):
 * `{ data: [ { items: [ { type: 'userMessage', clientId: '…' } ] } ] }`.
 *
 * Three answers, not two. A payload we cannot read is **not** a thread without
 * our message in it: the RPC succeeded, so the transport never noticed, and
 * folding that into `false` authorises a resend of a turn the model may already
 * have run (MAR-2823 F5). Only a negative we could actually validate — turns we
 * parsed, and no page left unread — may end in a resend.
 */
export type CodexThreadLanding = true | false | 'unreadable'

export function threadContainsClientMessage(
  payload: unknown,
  clientUserMessageId: string,
): CodexThreadLanding {
  if (!clientUserMessageId) return false
  const turns = readTurns(payload)
  if (turns === null) return 'unreadable'

  if (findTurnWithClientMessage(turns, clientUserMessageId)) return true

  // Absence is only established over the whole history: a cursor means there
  // are turns we never looked at, and our message could be in any of them.
  return hasMoreTurnPages(payload) ? 'unreadable' : false
}

/**
 * What the server already did with a turn we lost the acknowledgement for.
 *
 * Knowing it landed is not enough to rejoin it: adopting means naming the turn
 * again (so steer and interrupt still reach it) and, when the model has already
 * finished, putting the answer it produced into the transcript — a turn that
 * completed while nobody was subscribed streams to no one (MAR-2823 F4).
 */
export interface CodexLandedTurn {
  turnId: string | null
  completed: boolean
  agentText: string | null
}

export function readLandedTurn(
  payload: unknown,
  clientUserMessageId: string,
): CodexLandedTurn | null {
  if (!clientUserMessageId) return null
  const turns = readTurns(payload)
  if (turns === null) return null

  const turn = findTurnWithClientMessage(turns, clientUserMessageId)
  if (!turn) return null

  const record = turn as { id?: unknown; turnId?: unknown; status?: unknown }
  const turnId =
    typeof record.id === 'string'
      ? record.id
      : typeof record.turnId === 'string'
        ? record.turnId
        : null

  const agentText = readAgentText(turnItems(turn))
  return {
    turnId,
    completed: record.status === 'completed' || record.status === 'failed',
    agentText,
  }
}

function findTurnWithClientMessage(
  turns: unknown[],
  clientUserMessageId: string,
): Record<string, unknown> | null {
  for (const turn of turns) {
    for (const item of turnItems(turn)) {
      if (!item || typeof item !== 'object') continue
      const record = item as { type?: unknown; clientId?: unknown }
      if (
        record.type === 'userMessage' &&
        record.clientId === clientUserMessageId
      ) {
        return turn as Record<string, unknown>
      }
    }
  }

  return null
}

function turnItems(turn: unknown): unknown[] {
  if (!turn || typeof turn !== 'object') return []
  const items = (turn as { items?: unknown }).items
  return Array.isArray(items) ? items : []
}

/**
 * The last agent message of a turn, as the transcript would have shown it.
 *
 * Measured shapes (0.153.4): `{ type: 'agentMessage', text }` and the
 * content-array form the same item takes on `thread/read`.
 */
function readAgentText(items: unknown[]): string | null {
  let text: string | null = null
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const record = item as { type?: unknown; text?: unknown; content?: unknown }
    if (record.type !== 'agentMessage') continue
    if (typeof record.text === 'string' && record.text) {
      text = record.text
      continue
    }
    if (Array.isArray(record.content)) {
      const joined = record.content
        .map((part) =>
          part &&
          typeof part === 'object' &&
          typeof (part as { text?: unknown }).text === 'string'
            ? (part as { text: string }).text
            : '',
        )
        .join('')
      if (joined) text = joined
    }
  }
  return text
}

/** `null` means "this is not a turn list", which is not the same as an empty one. */
function readTurns(payload: unknown): unknown[] | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as { data?: unknown; thread?: { turns?: unknown } }
  if (Array.isArray(record.data)) return record.data
  if (Array.isArray(record.thread?.turns)) return record.thread.turns
  return null
}

function hasMoreTurnPages(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false
  const cursor = (payload as { nextCursor?: unknown }).nextCursor
  return typeof cursor === 'string' && cursor.length > 0
}

/**
 * A thread that has never taken a user message has no rollout, and both
 * `thread/resume` and `thread/turns/list` refuse it by saying so (measured:
 * `no rollout found for thread id …`, `is not materialized yet`). For
 * reconciliation that refusal is an *answer* — nothing landed — not an error to
 * escalate.
 */
export function isCodexThreadUnmaterializedError(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase()
  return (
    message.includes('no rollout found') ||
    message.includes('not materialized yet')
  )
}

export interface ProcessTableRow {
  pid: number
  ppid: number
}

/**
 * Reads the pid/ppid pairs of `ps -Ao pid,ppid`, header and blank lines and all.
 *
 * Parentage is the whole rule: the live canary already counts *servers* rather
 * than processes this way, because `codex` on npm is a Node shim that execs the
 * vendored Rust binary and one server is therefore always two rows.
 */
export function parseProcessTable(stdout: string): ProcessTableRow[] {
  const rows: ProcessTableRow[] = []
  for (const line of stdout.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\b/)
    if (!match) continue
    rows.push({ pid: Number(match[1]), ppid: Number(match[2]) })
  }
  return rows
}

/**
 * Every descendant of `rootPid` in a `ps` snapshot, **deepest first**.
 *
 * The order is the point. SIGKILL cannot be forwarded, so signalling the npm
 * shim alone leaves the Rust grandchild holding the port — the orphan the
 * escalation exists to prevent (MAR-2823 L2'). Killing deepest first means no
 * process in the tree is ever signalled after the parent that would have been
 * asked to pass it on.
 *
 * A `ps` table is a snapshot of a moving system and pids are reused, so
 * parentage can point in a circle; a visited set makes that a lie rather than
 * an infinite loop inside app quit.
 */
export function collectDescendantPids(
  rows: ProcessTableRow[],
  rootPid: number,
): number[] {
  const childrenOf = new Map<number, number[]>()
  for (const row of rows) {
    if (row.pid === row.ppid) continue
    const siblings = childrenOf.get(row.ppid)
    if (siblings) siblings.push(row.pid)
    else childrenOf.set(row.ppid, [row.pid])
  }

  const levels: number[][] = []
  const visited = new Set<number>([rootPid])
  let frontier = (childrenOf.get(rootPid) ?? []).filter(
    (pid) => !visited.has(pid),
  )

  while (frontier.length > 0) {
    for (const pid of frontier) visited.add(pid)
    levels.push(frontier)
    frontier = frontier
      .flatMap((pid) => childrenOf.get(pid) ?? [])
      .filter((pid) => !visited.has(pid))
  }

  return levels.reverse().flat()
}
