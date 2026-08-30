import type { ExecutionHostEventEnvelope } from '@mrck-labs/execution-host-protocol'
import { DAEMON_HEALTH_FIXTURE_0_26_1 } from './execution-host-health.fixture'

/** The provider listing the stub daemon serves from `/v0/meta`. */
export const DAEMON_META = {
  providers: [
    {
      id: 'claude',
      label: 'Claude Code',
      available: true,
      authenticated: true,
      models: [{ slug: 'sonnet', label: 'Claude Sonnet' }],
      features: { resume: true, followup: true },
    },
    {
      id: 'codex',
      label: 'Codex',
      available: true,
      authenticated: true,
      models: [{ slug: 'gpt-5.5', label: 'GPT-5.5' }],
      features: { resume: false, followup: true },
    },
  ],
}
export interface StubDaemon {
  fetchFn: typeof fetch
  emit: (envelope: ExecutionHostEventEnvelope) => void
  /**
   * Pushes several envelopes as one chunk, the way a replay reaches a client:
   * the daemon writes its frames back to back and they arrive coalesced, so a
   * single stream read hands the adapter the whole batch at once.
   */
  emitBatch: (envelopes: ExecutionHostEventEnvelope[]) => void
  /** Pushes an SSE frame the protocol decoder will reject. */
  emitRaw: (data: string) => void
  dropStream: () => void
  startRequests: Array<Record<string, unknown>>
  commandEnvelopes: Array<Record<string, unknown>>
  /**
   * The same envelopes with the session id the URL addressed them to — the
   * half that says a command reached the run it was meant for.
   */
  commandRequests: Array<{
    sessionId: string
    envelope: Record<string, unknown>
  }>
  eventStreamLastEventIds: Array<string | null>
  setMetaStatus: (status: number) => void
  /**
   * Replaces the provider listing. Two stub daemons in one test have to be
   * tellable apart by what they serve, or "each host holds its own cache" is
   * unobservable.
   */
  setMeta: (body: unknown) => void
  /** Raw `/health` body; null makes the route 404, as an older daemon does. */
  setHealthBody: (body: string | null) => void
  /** A proxy that swallows `/health` by hanging instead of answering. */
  setHealthHangs: (hangs: boolean) => void
  healthRequests: Array<{ authorization: string | null }>
  setStartStatus: (status: number) => void
  setCommandStatus: (status: number) => void
  setEventsStatus: (status: number) => void
  /**
   * The snapshot `GET /v0/execution/sessions/<id>` answers with. Two daemons
   * in one test must describe different workspaces, or "the panel asked the
   * machine the session named" cannot be told from "the panel asked
   * something".
   */
  setSessionSnapshot: (sessionId: string, snapshot: unknown) => void
  /** Session ids whose snapshot this daemon was asked for, in order. */
  snapshotRequests: string[]
  /**
   * The body `GET /v0/projects` answers with (MAR-2689). Two daemons in one
   * test must offer different Projects, or "the slot asked the machine the
   * strip names" cannot be told from "the slot asked something".
   */
  setProjects: (body: unknown) => void
  /** Makes `/v0/projects` fail, the way a daemon behind a bad proxy does. */
  setProjectsStatus: (status: number) => void
  /**
   * Answers `/v0/projects` from this function instead of the fixed body, so a
   * test can decide when each read lands (MAR-2689).
   *
   * Two reads overlapping is the only way to prove a slow answer cannot
   * overwrite a newer one's, and which of them finishes first cannot be left to
   * a sleep. The responder is handed the call number, one-based.
   */
  setProjectsResponder: (
    responder: ((call: number) => Promise<unknown>) | null,
  ) => void
  /** How many times this daemon was asked where it can work. */
  projectsRequests: number
}

/**
 * A stub agents-daemon speaking the execution host wire protocol over `fetch`:
 * `/health`, `/v0/meta`, session start, posted commands, and an SSE event
 * stream that replays by `Last-Event-ID` the way the real daemon does.
 *
 * It lives in a fixture rather than inside one test file because two suites
 * need the same daemon: the adapter tests, which prove what
 * `RemoteExecutionHost` does with an event, and the session tests, which prove
 * what the session record does with it. A second hand-rolled daemon would let
 * the two drift, and the drift would land exactly where the wire meets the
 * session — the seam MAR-2582 was lost in.
 */
export function createStubDaemon(): StubDaemon {
  const encoder = new TextEncoder()
  const log: ExecutionHostEventEnvelope[] = []
  const startRequests: Array<Record<string, unknown>> = []
  const commandEnvelopes: Array<Record<string, unknown>> = []
  const commandRequests: Array<{
    sessionId: string
    envelope: Record<string, unknown>
  }> = []
  const startedSessionIds = new Set<string>()
  const projectsRequests: { count: number } = { count: 0 }
  let projectsBody: unknown = { projects: [] }
  let projectsStatus = 200
  let projectsResponder: ((call: number) => Promise<unknown>) | null = null
  const eventStreamLastEventIds: Array<string | null> = []
  const healthRequests: Array<{ authorization: string | null }> = []
  const snapshotRequests: string[] = []
  const sessionSnapshots = new Map<string, unknown>()
  const current: {
    controller: ReadableStreamDefaultController<Uint8Array> | null
  } = { controller: null }
  let metaStatus = 200
  let meta: unknown = DAEMON_META
  let healthBody: string | null = DAEMON_HEALTH_FIXTURE_0_26_1
  let healthHangs = false
  let startStatus = 201
  let commandStatus = 202
  let eventsStatus = 200

  const sseChunk = (envelope: ExecutionHostEventEnvelope): Uint8Array =>
    encoder.encode(`id: ${envelope.seq}\ndata: ${JSON.stringify(envelope)}\n\n`)

  const jsonResponse = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })

  const headerValue = (
    headers: RequestInit['headers'],
    name: string,
  ): string | null => {
    if (!headers) return null
    const record = headers as Record<string, string>
    return record[name] ?? null
  }

  const fetchFn = (async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'

    if (url.endsWith('/health')) {
      healthRequests.push({
        authorization: headerValue(init?.headers, 'Authorization'),
      })
      if (healthHangs) {
        // Like real fetch, the only thing that settles this is the caller's
        // own abort signal.
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('The operation was aborted due to timeout')),
          )
        })
      }
      if (healthBody === null) {
        return jsonResponse({ error: 'not found' }, 404)
      }
      return new Response(healthBody, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (method === 'GET' && url.endsWith('/v0/projects')) {
      projectsRequests.count += 1
      if (projectsStatus !== 200) {
        return jsonResponse({ error: 'projects unavailable' }, projectsStatus)
      }
      if (projectsResponder) {
        return jsonResponse(await projectsResponder(projectsRequests.count))
      }
      return jsonResponse(projectsBody)
    }

    if (url.endsWith('/v0/meta')) {
      if (metaStatus !== 200) {
        return jsonResponse({ error: 'meta unavailable' }, metaStatus)
      }
      return jsonResponse(meta)
    }

    if (method === 'POST' && url.endsWith('/v0/execution/sessions')) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      startRequests.push(body)
      if (startStatus !== 201) {
        return jsonResponse({ error: 'start rejected' }, startStatus)
      }
      const config = body.config as { sessionId: string }
      // The daemon takes one start per session id and answers a second with
      // 409 (`execution-session-manager.ts:436-438`). A session that already
      // exists is continued with a `send-message` command, never restarted —
      // which is what Emergence, the working client for this daemon, does:
      // it has exactly one call to start and no second one anywhere
      // (`execution-client.service.ts:128,411`).
      if (startedSessionIds.has(config.sessionId)) {
        return jsonResponse(
          { error: `Session already exists: ${config.sessionId}` },
          409,
        )
      }
      startedSessionIds.add(config.sessionId)
      return jsonResponse(
        { protocolVersion: 1, sessionId: config.sessionId },
        201,
      )
    }

    if (method === 'GET' && /\/v0\/execution\/sessions\/[^/]+$/.test(url)) {
      const sessionId = decodeURIComponent(url.split('/').pop() ?? '')
      snapshotRequests.push(sessionId)
      const snapshot = sessionSnapshots.get(sessionId)
      if (snapshot === undefined) {
        return jsonResponse({ error: `Unknown session: ${sessionId}` }, 404)
      }
      return jsonResponse(snapshot)
    }

    if (method === 'POST' && url.includes('/commands')) {
      if (commandStatus !== 202) {
        return jsonResponse({ error: 'command rejected' }, commandStatus)
      }
      const envelope = JSON.parse(String(init?.body)) as Record<string, unknown>
      commandEnvelopes.push(envelope)
      commandRequests.push({
        sessionId: sessionIdFromUrl(url),
        envelope,
      })
      return jsonResponse({ accepted: true }, 202)
    }

    if (url.includes('/events')) {
      const lastEventId = headerValue(init?.headers, 'Last-Event-ID')
      eventStreamLastEventIds.push(lastEventId)
      if (eventsStatus !== 200) {
        return jsonResponse({ error: 'stream rejected' }, eventsStatus)
      }
      const afterSeq = lastEventId ? Number(lastEventId) : 0
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          current.controller = controller
          for (const envelope of log) {
            if (envelope.seq > afterSeq) controller.enqueue(sseChunk(envelope))
          }
          init?.signal?.addEventListener('abort', () => {
            if (current.controller === controller) current.controller = null
            try {
              controller.error(new Error('aborted'))
            } catch {
              // Stream may already be closed.
            }
          })
        },
        cancel() {
          if (current.controller) current.controller = null
        },
      })
      return new Response(stream, { status: 200 })
    }

    throw new Error(`Unexpected request: ${method} ${url}`)
  }) as typeof fetch

  return {
    fetchFn,
    emit(envelope) {
      log.push(envelope)
      current.controller?.enqueue(sseChunk(envelope))
    },
    emitBatch(envelopes) {
      for (const item of envelopes) log.push(item)
      const controller = current.controller
      if (!controller) return
      controller.enqueue(
        encoder.encode(
          envelopes
            .map((item) => `id: ${item.seq}\ndata: ${JSON.stringify(item)}\n\n`)
            .join(''),
        ),
      )
    },
    emitRaw(data) {
      current.controller?.enqueue(encoder.encode(`data: ${data}\n\n`))
    },
    dropStream() {
      const controller = current.controller
      current.controller = null
      controller?.close()
    },
    startRequests,
    commandEnvelopes,
    commandRequests,
    eventStreamLastEventIds,
    healthRequests,
    snapshotRequests,
    setSessionSnapshot(sessionId, snapshot) {
      sessionSnapshots.set(sessionId, snapshot)
    },
    setMetaStatus(status) {
      metaStatus = status
    },
    setMeta(body) {
      meta = body
    },
    setHealthBody(body) {
      healthBody = body
    },
    setHealthHangs(hangs) {
      healthHangs = hangs
    },
    setStartStatus(status) {
      startStatus = status
    },
    setCommandStatus(status) {
      commandStatus = status
    },
    setEventsStatus(status) {
      eventsStatus = status
    },
    setProjects(body) {
      projectsBody = body
    },
    setProjectsStatus(status) {
      projectsStatus = status
    },
    setProjectsResponder(responder) {
      projectsResponder = responder
    },
    get projectsRequests() {
      return projectsRequests.count
    },
  }
}

/** The session id a `/v0/execution/sessions/<id>/...` URL addresses. */
function sessionIdFromUrl(url: string): string {
  const match = /\/v0\/execution\/sessions\/([^/]+)\//.exec(url)
  return match ? decodeURIComponent(match[1]) : ''
}

/** Wraps one wire event in the envelope the daemon streams it inside. */
export function envelope(
  seq: number,
  event: ExecutionHostEventEnvelope['event'],
  sessionId = 's-1',
): ExecutionHostEventEnvelope {
  return { protocolVersion: 1, sessionId, seq, event }
}

/**
 * A promise the test settles by hand, so a window that would otherwise close
 * by luck has a known width.
 *
 * Without one, the stub daemon answers within the same run of microtasks the
 * caller already awaits, and a test about what happens *before* it answers
 * passes for a reason that has nothing to do with the code under it.
 */
export function deferred(): { promise: Promise<void>; release: () => void } {
  let release = (): void => {}
  const promise = new Promise<void>((resolve) => {
    release = () => resolve()
  })
  return { promise, release }
}

/**
 * Runs a promise and reports what became of it, without ever rethrowing — the
 * only way to assert that something is still *pending* rather than settled.
 */
export function track(promise: Promise<unknown>): {
  settled: () => 'pending' | 'resolved' | 'rejected'
  error: () => Error | null
  done: Promise<void>
} {
  let state: 'pending' | 'resolved' | 'rejected' = 'pending'
  let failure: Error | null = null
  const done = promise.then(
    () => {
      state = 'resolved'
    },
    (error: unknown) => {
      state = 'rejected'
      failure = error instanceof Error ? error : new Error(String(error))
    },
  )
  return { settled: () => state, error: () => failure, done }
}

/** Long enough for every queued microtask and timer to have run. */
export async function letEverythingQueuedRun(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 25))
}

/** Polls until the predicate holds, so async wire work needs no sleeps. */
export async function waitUntil(
  predicate: () => boolean,
  description: string,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${description}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}
