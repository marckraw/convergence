import {
  createSseParser,
  evaluateHandshake,
  parseDaemonHealth,
  parseRemoteExecutionHostStartResponse,
  RemoteExecutionHostError,
  type EndpointHandshakeResult,
  type MetaProbeOutcome,
} from '@convergence/execution-host-client'
import {
  encodeExecutionCommandEnvelope,
  encodeExecutionStartRequest,
  type ExecutionHostEventEnvelope,
} from '@mrck-labs/execution-host-protocol'
import {
  buildSendMessageEnvelope,
  buildStudioStartRequest,
  daemonUrl,
  describeDaemonFailure,
  readEnvelopeFrame,
  reconnectDelayMs,
  type StudioStartInput,
} from './daemon-wire.pure'

/**
 * Studio's half of the execution host wire (MAR-2770).
 *
 * The thin client the walking skeleton needs and nothing more: a handshake, one
 * start, an event stream that resumes from the last sequence it saw, and a
 * follow-up command. It talks to exactly one machine — the constitution's law 6
 * hardcodes v1 to one VPS — so there is no Endpoint list, no registry and no
 * resolver here.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO, so nobody has to read the code to find
 * out: approvals (`approve` / `deny` are never sent, and an
 * `approval-request` item is shown as a row and answered by nobody),
 * stopping a running session, attachments of any kind, steering, queued input,
 * workspace materialisation, Projects, Rooms, Environments, model and effort
 * selection. Every one of them is a beat of its own; none is silently
 * half-built — and a `stopSession` nothing calls would be exactly that, a
 * capability the app appears to have and no surface can reach.
 *
 * The token lives in this object and leaves it only inside an `Authorization`
 * header. It is never logged, never returned and never part of an error
 * message.
 */
export interface DaemonClientDeps {
  baseUrl: string
  token: string
  fetchFn?: typeof fetch
  /** Overridable so tests prove the backoff without waiting for it. */
  wait?: (ms: number) => Promise<void>
  /** Overridable so a test does not need eleven real attempts. */
  maxStreamAttempts?: number
  /** Overridable so a test does not wait fifteen seconds for a hung probe. */
  healthProbeTimeoutMs?: number
}

export interface StreamHandlers {
  /**
   * One envelope, in arrival order. Awaited, so the record is written before
   * the next one is read: a snapshot that has run ahead of the log on disk is a
   * transcript a restart cannot reproduce.
   */
  onEnvelope: (envelope: ExecutionHostEventEnvelope) => Promise<void>
  /**
   * A frame that could not be turned into an envelope for this session.
   *
   * A drop with nobody to tell is a defect of its own, so the reason travels
   * out of here rather than being swallowed at the parse.
   */
  onDroppedFrame: (reason: string) => void
}

/**
 * Emergence's number and its reasoning: `/health` runs provider-readiness
 * probes and takes several seconds cold, so a tight timeout misreports a
 * healthy daemon as one that answered nothing. The cap exists for the other
 * failure — a proxy that swallows the route by hanging rather than answering.
 */
const DEFAULT_HEALTH_PROBE_TIMEOUT_MS = 15_000

/** Ten attempts against a 30s cap tolerates roughly 2.5 minutes of outage. */
const DEFAULT_MAX_STREAM_ATTEMPTS = 10

export class DaemonClient {
  private readonly fetchFn: typeof fetch
  private readonly wait: (ms: number) => Promise<void>
  private readonly maxStreamAttempts: number
  private readonly healthProbeTimeoutMs: number

  constructor(private readonly deps: DaemonClientDeps) {
    this.fetchFn = deps.fetchFn ?? fetch
    this.wait =
      deps.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.maxStreamAttempts =
      deps.maxStreamAttempts ?? DEFAULT_MAX_STREAM_ATTEMPTS
    this.healthProbeTimeoutMs =
      deps.healthProbeTimeoutMs ?? DEFAULT_HEALTH_PROBE_TIMEOUT_MS
  }

  /**
   * `/health` unauthenticated, then `/v0/meta` with the token, judged together
   * by the package's own evaluator.
   *
   * Both halves, because they answer different questions. `/health` says
   * whether the machine is there and speaks a protocol this build knows;
   * `/v0/meta` is the only call that says whether the token is any good. A
   * handshake that reported `{ kind: 'ok' }` without making the authenticated
   * probe would claim a credential works when nobody had asked it to.
   */
  async handshake(): Promise<EndpointHandshakeResult> {
    let healthFailure: string | null = null
    let health = null

    try {
      const response = await this.fetchFn(
        daemonUrl(this.deps.baseUrl, '/health'),
        {
          method: 'GET',
          signal: AbortSignal.timeout(this.healthProbeTimeoutMs),
        },
      )
      if (!response.ok) {
        healthFailure = `Daemon answered /health with HTTP ${response.status}`
      } else {
        health = parseDaemonHealth(JSON.parse(await response.text()))
        if (health === null)
          healthFailure = 'Daemon /health body was unreadable'
      }
    } catch (error) {
      healthFailure = describeDaemonFailure(error)
    }

    return evaluateHandshake(health, healthFailure, await this.probeMeta())
  }

  /**
   * Starts one session. Resolves when the daemon has accepted it, and throws
   * with the daemon's own words when it has not.
   *
   * The echoed session id is checked by the package's parser, so a response
   * about another run fails the start rather than writing that run's answer
   * onto this conversation.
   */
  async startSession(input: StudioStartInput): Promise<void> {
    const response = await this.requestJson('/v0/execution/sessions', {
      method: 'POST',
      body: encodeExecutionStartRequest(buildStudioStartRequest(input)),
    })
    parseRemoteExecutionHostStartResponse(response, input.sessionId)
  }

  /** Sends a follow-up into a session the daemon is already holding. */
  async sendMessage(sessionId: string, text: string): Promise<void> {
    await this.postCommand(buildSendMessageEnvelope(sessionId, text))
  }

  /**
   * Follows a session's event stream until it is aborted, reconnecting from the
   * last sequence it saw.
   *
   * The daemon holds the stream open for a live session, so reaching the end of
   * one means the connection dropped rather than that the run finished — the
   * run's end arrives as an event. Resuming by `Last-Event-ID` is what makes a
   * reconnect (and an app restart) continue a conversation instead of
   * replaying it.
   *
   * Resolves normally when the caller aborts. Throws when the stream could not
   * be re-established within the attempt budget, and the caller records that on
   * the conversation: a stream that died is not a conversation that finished.
   */
  async followSession(
    sessionId: string,
    fromSeq: number,
    handlers: StreamHandlers,
    signal: AbortSignal,
  ): Promise<void> {
    let lastSeq = fromSeq
    let attempt = 0

    while (!signal.aborted) {
      let response: Response
      try {
        response = await this.openEventStream(sessionId, lastSeq, signal)
      } catch (error) {
        if (signal.aborted) return
        attempt += 1
        if (attempt >= this.maxStreamAttempts) {
          throw new RemoteExecutionHostError(
            `Conversation stream is unavailable: ${describeDaemonFailure(error)}`,
            error instanceof RemoteExecutionHostError ? error.kind : 'network',
          )
        }
        await this.waitForRetry(reconnectDelayMs(attempt), signal)
        continue
      }

      const reading = await this.readStream(
        response,
        sessionId,
        lastSeq,
        handlers,
      )
      lastSeq = reading.lastSeq
      if (signal.aborted) return

      // The budget is spent by ATTEMPTS, and an attempt only counts as having
      // worked once the host said something. Resetting on a successful open
      // alone gave a host that answers 200-and-closes an unlimited budget: the
      // loop re-opened forever at one second apart, a publish storm against a
      // machine that is plainly not serving this session. Delivering an
      // envelope is the difference between a stream and a socket.
      if (reading.envelopes > 0) attempt = 0

      attempt += 1
      if (attempt >= this.maxStreamAttempts) {
        throw new RemoteExecutionHostError(
          'Conversation stream dropped and could not be re-established.',
          'network',
        )
      }
      await this.waitForRetry(reconnectDelayMs(attempt), signal)
    }
  }

  /**
   * The backoff, given up the moment the caller aborts.
   *
   * A plain wait is not abortable, and the cap is thirty seconds: quitting
   * during one made the app hang for up to half a minute with nothing on
   * screen, because shutdown waits for the writes each follow still owes. The
   * timer is still allowed to finish — it holds nothing — but nobody waits for
   * it.
   */
  private waitForRetry(ms: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const onAbort = (): void => resolve()
      signal.addEventListener('abort', onAbort, { once: true })
      void this.wait(ms).then(() => {
        signal.removeEventListener('abort', onAbort)
        resolve()
      })
    })
  }

  /**
   * Reads one open stream to its end.
   *
   * Returns the last sequence it saw, so the reconnect resumes from there
   * rather than from where the stream began, and how many envelopes it handed
   * on, which is what says whether this attempt was a stream at all.
   *
   * `envelopes` counts only what the handler ACCEPTED. An envelope the handler
   * threw on — the record refusing a write — has not been kept, and counting it
   * would hand a dead disk a budget that never runs out.
   */
  private async readStream(
    response: Response,
    sessionId: string,
    fromSeq: number,
    handlers: StreamHandlers,
  ): Promise<{ lastSeq: number; envelopes: number }> {
    const body = response.body
    if (!body) return { lastSeq: fromSeq, envelopes: 0 }
    const reader = body.getReader()
    const decoder = new TextDecoder()
    const parser = createSseParser()
    let lastSeq = fromSeq
    let envelopes = 0

    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) return { lastSeq, envelopes }
        // One read delivers a batch: a daemon replay writes its frames back to
        // back and they arrive coalesced.
        for (const frame of parser.feed(
          decoder.decode(value, { stream: true }),
        )) {
          const reading = readEnvelopeFrame(frame.data, sessionId)
          if (!reading.ok) {
            handlers.onDroppedFrame(reading.reason)
            continue
          }
          // A replay can re-deliver what this conversation already holds; the
          // record is append-only, so anything at or below the high-water mark
          // is dropped here rather than written twice. It still counts: the
          // host answered with this session's own events.
          if (reading.envelope.seq <= lastSeq) {
            envelopes += 1
            continue
          }
          await handlers.onEnvelope(reading.envelope)
          envelopes += 1
          lastSeq = reading.envelope.seq
        }
      }
    } catch {
      // A read error — an abort, or a handler that refused an envelope — ends
      // this stream and is handled by the reconnect loop above. `lastSeq` is
      // the last sequence actually kept, so a refused envelope is re-requested
      // rather than skipped over.
      return { lastSeq, envelopes }
    } finally {
      reader.releaseLock()
    }
  }

  private async probeMeta(): Promise<MetaProbeOutcome> {
    try {
      const response = await this.fetchFn(
        daemonUrl(this.deps.baseUrl, '/v0/meta'),
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${this.deps.token}` },
          signal: AbortSignal.timeout(this.healthProbeTimeoutMs),
        },
      )
      return response.ok
        ? { kind: 'ok' }
        : { kind: 'http', httpStatus: response.status }
    } catch (error) {
      return { kind: 'network-error', message: describeDaemonFailure(error) }
    }
  }

  private async postCommand(
    envelope: ReturnType<typeof buildSendMessageEnvelope>,
  ): Promise<void> {
    await this.requestJson(
      `/v0/execution/sessions/${encodeURIComponent(envelope.sessionId)}/commands`,
      { method: 'POST', body: encodeExecutionCommandEnvelope(envelope) },
    )
  }

  private async requestJson(
    path: string,
    options: { method: 'GET' | 'POST'; body?: string },
  ): Promise<unknown> {
    let response: Response
    try {
      response = await this.fetchFn(daemonUrl(this.deps.baseUrl, path), {
        method: options.method,
        headers: {
          Authorization: `Bearer ${this.deps.token}`,
          ...(options.body !== undefined
            ? { 'Content-Type': 'application/json' }
            : {}),
        },
        ...(options.body !== undefined ? { body: options.body } : {}),
      })
    } catch (error) {
      throw new RemoteExecutionHostError(
        `The daemon is unreachable: ${describeDaemonFailure(error)}`,
        'network',
        undefined,
        error,
      )
    }

    const text = await response.text()
    if (!response.ok) {
      throw new RemoteExecutionHostError(
        // The daemon's own sentence wherever it gave one: "Unknown provider:
        // claude-code" is the half that says how to fix it.
        extractErrorMessage(text) ??
          `The daemon refused the request with HTTP ${response.status}.`,
        response.status === 401 || response.status === 403 ? 'auth' : 'http',
        response.status,
      )
    }
    if (!text.trim()) return {}
    try {
      return JSON.parse(text) as unknown
    } catch (error) {
      throw new RemoteExecutionHostError(
        'The daemon returned malformed JSON.',
        'malformed',
        response.status,
        error,
      )
    }
  }

  private async openEventStream(
    sessionId: string,
    lastSeq: number,
    signal: AbortSignal,
  ): Promise<Response> {
    let response: Response
    try {
      response = await this.fetchFn(
        daemonUrl(
          this.deps.baseUrl,
          `/v0/execution/sessions/${encodeURIComponent(sessionId)}/events`,
        ),
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.deps.token}`,
            Accept: 'text/event-stream',
            ...(lastSeq > 0 ? { 'Last-Event-ID': String(lastSeq) } : {}),
          },
          signal,
        },
      )
    } catch (error) {
      throw new RemoteExecutionHostError(
        `The conversation stream is unreachable: ${describeDaemonFailure(error)}`,
        'network',
        undefined,
        error,
      )
    }
    if (!response.ok || !response.body) {
      throw new RemoteExecutionHostError(
        `The conversation stream failed with HTTP ${response.status}.`,
        response.status === 401 || response.status === 403 ? 'auth' : 'http',
        response.status,
      )
    }
    return response
  }
}

function extractErrorMessage(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as { error?: unknown }
    return typeof parsed.error === 'string' && parsed.error.trim() !== ''
      ? parsed.error.trim()
      : null
  } catch {
    return text.trim() === '' ? null : text.trim()
  }
}
