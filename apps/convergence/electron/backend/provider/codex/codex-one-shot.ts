import type { OneShotInput, OneShotResult } from '../provider.types'
import { createTaskProgressEmitter } from '../../task-progress/task-progress.emitter'
import type { TaskProgressService } from '../../task-progress/task-progress.service'
import type {
  CodexServerConnection,
  CodexServerHost,
} from './codex-server-host'
import {
  buildCodexOneShotThreadParams,
  buildCodexOneShotTurnParams,
  isCodexNotificationForThread,
  readCodexOneShotDelta,
  readCodexOneShotMessage,
  readCodexOneShotThreadId,
  readCodexTurnOutcome,
} from './codex-one-shot.pure'

/** Same budget the `codex exec` child was given, whole-call as it was there. */
const CODEX_ONE_SHOT_TIMEOUT_MS = 20_000

/**
 * What a caller sees when the helper lost its socket before the answer landed.
 *
 * Named because the recovery rule depends on it: an ephemeral thread leaves no
 * rollout, so there is nothing to resume and nothing to reconcile — the only
 * honest recovery is running the whole call again (MAR-2824 R4).
 */
export const CODEX_ONE_SHOT_CONNECTION_LOST =
  'codex oneShot lost its connection to the Codex server before the answer arrived; the call can be retried'

/**
 * One helper turn at a time per resident server (R3).
 *
 * Keyed by the host object because the host *is* the account: the registry
 * hands out one instance per (execution host, `CODEX_HOME`), so two naming
 * calls on one account queue while two accounts run side by side. A host that
 * has been replaced — a new binary, an app quit — brings its own empty queue,
 * which is right: it is a different server.
 */
const helperTurns = new WeakMap<CodexServerHost, Promise<unknown>>()

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: Error) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  // Nothing awaits the answer until the turn is under way, so a rejection that
  // lands earlier — a socket that dies during `thread/start` — would otherwise
  // surface as an unhandled rejection before anyone is listening.
  void promise.catch(() => undefined)
  return { promise, resolve, reject }
}

/**
 * Naming and extraction, as an ephemeral thread on the account's resident
 * `codex app-server` (MAR-2824).
 *
 * Adapter helper, deliberately smaller than a session in every dimension: one
 * thread that leaves no rollout, a read-only sandbox with approvals refused,
 * exactly one turn, and a connection closed the moment the answer is in hand.
 * It replaces a `codex exec` child per call — measured on codex-cli 0.153.4, a
 * process start became a 101ms `thread/start` on the warm host.
 */
export function runCodexOneShotOnServer(
  host: CodexServerHost,
  input: OneShotInput,
  taskProgress?: TaskProgressService | null,
): Promise<OneShotResult> {
  if (!('providerAccountId' in input)) {
    // R5: an absent account is a caller that never thought about which
    // subscription it spends; an explicit `null` is one that means the ambient
    // login. Only the first is a mistake, and it is refused rather than served.
    return Promise.reject(
      new Error(
        'codex oneShot requires providerAccountId (pass null for the ambient login)',
      ),
    )
  }

  const run = () => executeCodexOneShot(host, input, taskProgress)
  // Both arms run the next call: the queue orders helpers, it does not make one
  // helper's failure cancel the next caller's work.
  const queued = (helperTurns.get(host) ?? Promise.resolve()).then(run, run)
  helperTurns.set(
    host,
    queued.catch(() => undefined),
  )
  return queued
}

async function executeCodexOneShot(
  host: CodexServerHost,
  input: OneShotInput,
  taskProgress?: TaskProgressService | null,
): Promise<OneShotResult> {
  const progress = createTaskProgressEmitter(input.requestId, taskProgress)
  progress?.started()

  const answer = createDeferred<string>()
  let threadId: string | null = null
  let connection: CodexServerConnection | null = null
  let timedOut = false

  const timer = setTimeout(() => {
    timedOut = true
    answer.reject(new Error('codex oneShot timed out'))
  }, input.timeoutMs ?? CODEX_ONE_SHOT_TIMEOUT_MS)
  timer.unref?.()

  try {
    connection = await host.connect({
      // A helper's only progress is its own thread's traffic. Counting another
      // session's broadcast would keep a genuinely stuck naming call looking
      // alive for as long as the machine stays busy (constitution A5).
      isProgressNotification: (_method, params) =>
        threadId !== null && isCodexNotificationForThread(params, threadId),
      onTransportFailure: (error) =>
        answer.reject(
          new Error(`${CODEX_ONE_SHOT_CONNECTION_LOST}: ${error.message}`),
        ),
    })
    const rpc = connection.rpc

    // A read-only helper has nothing to approve and no user to ask; leaving a
    // server request unanswered would hang the turn instead.
    rpc.onServerRequest((id) =>
      rpc.respondError(
        id,
        -32601,
        'Codex one-shot helpers run read-only and answer no interactions',
      ),
    )

    let streamed = ''
    let completedMessage: string | null = null

    rpc.onNotification((method, params) => {
      if (!threadId || !isCodexNotificationForThread(params, threadId)) return

      if (method === 'item/agentMessage/delta') {
        const delta = readCodexOneShotDelta(params)
        if (delta) {
          streamed += delta
          progress?.stdoutChunk(Buffer.byteLength(delta))
        }
        return
      }

      if (method === 'item/completed') {
        const message = readCodexOneShotMessage(params)
        if (message !== null) {
          completedMessage = message
          // The completed item repeats what the deltas already carried, so it
          // only counts as fresh output when nothing streamed.
          if (!streamed) progress?.stdoutChunk(Buffer.byteLength(message))
        }
        return
      }

      if (method === 'turn/completed') {
        const outcome = readCodexTurnOutcome(params)
        if (!outcome) return
        if (outcome.completed) answer.resolve(completedMessage ?? streamed)
        else answer.reject(new Error(`codex oneShot turn ${outcome.reason}`))
      }
    })

    const started = await rpc.request(
      'thread/start',
      buildCodexOneShotThreadParams(input),
    )
    threadId = readCodexOneShotThreadId(started)
    if (!threadId) {
      throw new Error('codex oneShot thread/start returned no thread id')
    }

    const acknowledgement = await rpc.request(
      'turn/start',
      buildCodexOneShotTurnParams(threadId, input),
    )
    const turnId = readCodexOneShotTurnId(acknowledgement)

    try {
      const text = await answer.promise
      progress?.settled('ok')
      return { text: text.trim() }
    } catch (error) {
      if (turnId) {
        // The turn outlives this call unless it is told to stop, and the server
        // it runs on belongs to every other session too.
        await rpc
          .request('turn/interrupt', { threadId, turnId })
          .catch(() => undefined)
      }
      throw error
    }
  } catch (error) {
    progress?.settled(timedOut ? 'timeout' : 'error')
    throw error
  } finally {
    clearTimeout(timer)
    if (connection) {
      const releasing = connection
      if (threadId) {
        await releasing.rpc
          .request('thread/unsubscribe', { threadId })
          .catch(() => undefined)
      }
      releasing.close()
    }
  }
}

function readCodexOneShotTurnId(result: unknown): string | null {
  const record =
    typeof result === 'object' && result !== null
      ? (result as { turn?: { id?: unknown } })
      : null
  return typeof record?.turn?.id === 'string' ? record.turn.id : null
}
