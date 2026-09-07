import type { OneShotInput, OneShotResult } from '../provider.types'
import { createTaskProgressEmitter } from '../../task-progress/task-progress.emitter'
import type { TaskProgressService } from '../../task-progress/task-progress.service'
import type {
  CodexServerConnection,
  CodexServerHost,
} from './codex-server-host'
import {
  CODEX_ONE_SHOT_ACCOUNT_REQUIRED,
  buildCodexOneShotThreadParams,
  buildCodexOneShotTurnParams,
  isCodexNotificationForThread,
  readCodexOneShotDelta,
  readCodexOneShotMessage,
  readCodexOneShotThreadId,
  readCodexOneShotTurnId,
  readCodexTurnOutcome,
  statesProviderAccount,
} from './codex-one-shot.pure'

/**
 * Same budget the `codex exec` child was given, whole-call as it was there.
 *
 * Whole-call is the load-bearing word, and `runStep` is what makes it true:
 * killing the child at 20s stopped everything it might still do, so every
 * await before the answer — the connect, the thread, the turn — has to be able
 * to lose to this deadline too. A budget that only covered the wait for the
 * answer would let a host that had been silent for 20s still send `turn/start`
 * and spend the user's quota after the call was already lost.
 *
 * What the budget does NOT cover is the cleanup it triggers: `turn/interrupt`
 * and `thread/unsubscribe` are each bounded only by their rpc silence budget
 * (30s, `CODEX_RPC_BUDGETS_MS`), and a deadline that fell between writing
 * `turn/start` and reading its acknowledgement waits for that acknowledgement
 * under its own budget (120s) so it has an id to interrupt. Bounded is enough
 * — cleanup runs after the caller already has its answer, and a helper that
 * gave up without releasing its turn would leave it running on the server
 * every session shares.
 *
 * One late arrival is left alone on purpose (ruled, MAR-2824 round 3): a
 * deadline that falls between writing `thread/start` and reading its answer
 * leaves a thread this call never learned of. It is ephemeral and idle — no
 * turn, no quota, no rollout — and closing the socket ends its subscription,
 * so there is nothing to interrupt and no fourth site to guard.
 */
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
  if (!statesProviderAccount(input)) {
    // R5, for anyone who reaches the helper without going through the provider.
    return Promise.reject(new Error(CODEX_ONE_SHOT_ACCOUNT_REQUIRED))
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
  let gaveUp = false
  let connectionLost: Error | null = null
  let turnStarting: Promise<unknown> | null = null

  const timer = setTimeout(() => {
    timedOut = true
    answer.reject(new Error('codex oneShot timed out'))
  }, input.timeoutMs ?? CODEX_ONE_SHOT_TIMEOUT_MS)
  timer.unref?.()

  /**
   * One step of the call, run against the deadline instead of beside it.
   *
   * The relabel is not decoration: `JsonRpcClient` rejects its pending
   * requests *before* it calls `onTransportFailure` (see
   * `reportTransportFailure` in `jsonrpc.ts`), so a socket that dies during
   * `thread/start` wins this race by one microtask carrying a raw transport
   * message. The named failure is the true one — it is what tells the caller
   * this can simply be run again (R4).
   *
   * It also relabels one non-transport case, correctly: an rpc silence budget
   * that expires routes through `reportTransportFailure` too, so a caller who
   * grants the helper more than 60s sees a `thread/start` that never answered
   * reported as a lost connection that can be retried — which is the client's
   * own definition of a server that has produced nothing for a minute.
   */
  const runStep = async <T>(step: Promise<T>): Promise<T> => {
    try {
      return await Promise.race([step, answer.promise as Promise<never>])
    } catch (error) {
      throw connectionLost ?? error
    }
  }

  try {
    const connecting = host.connect({
      // A helper's only progress is its own thread's traffic. Counting another
      // session's broadcast would keep a genuinely stuck naming call looking
      // alive for as long as the machine stays busy (constitution A5).
      isProgressNotification: (_method, params) =>
        threadId !== null && isCodexNotificationForThread(params, threadId),
      onTransportFailure: (error) => {
        connectionLost = new Error(
          `${CODEX_ONE_SHOT_CONNECTION_LOST}: ${error.message}`,
        )
        answer.reject(connectionLost)
      },
    })
    // A host that finishes connecting after the budget expired still hands
    // back a live socket on the resident server, and this call is the only
    // thing that ever holds it.
    void connecting.then(
      (opened) => {
        if (gaveUp) opened.close()
      },
      () => undefined,
    )
    connection = await runStep(connecting)
    const rpc = connection.rpc

    // A read-only helper has nothing to approve and no user to ask; leaving a
    // server request unanswered would hang the turn instead. The id is the
    // handler's THIRD argument — answering with the method name writes a
    // response the server can match to no request, which is the same hang.
    rpc.onServerRequest((_method, _params, id) =>
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

    const started = await runStep(
      rpc.request('thread/start', buildCodexOneShotThreadParams(input)),
    )
    threadId = readCodexOneShotThreadId(started)
    if (!threadId) {
      throw new Error('codex oneShot thread/start returned no thread id')
    }

    // Held, not just awaited: the deadline can fall between writing this and
    // reading its acknowledgement, and by then the turn is already running.
    // Non-null in `finally` means exactly that — written, never acknowledged.
    turnStarting = rpc.request(
      'turn/start',
      buildCodexOneShotTurnParams(threadId, input),
    )
    const acknowledgement = await runStep(turnStarting)
    turnStarting = null
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
    gaveUp = true
    if (connection) {
      const releasing = connection
      if (turnStarting && threadId) {
        // The turn is running on the server every session shares and this call
        // never learned its id, so unsubscribing and closing would stop the
        // events and not the turn. Waiting for the id it was denied is what
        // keeps the budget whole-call; the wait is bounded by `turn/start`'s
        // own rpc silence budget, the same kind of bound the release below has.
        const lateTurnId = readCodexOneShotTurnId(
          await turnStarting.catch(() => null),
        )
        if (lateTurnId) {
          await releasing.rpc
            .request('turn/interrupt', { threadId, turnId: lateTurnId })
            .catch(() => undefined)
        }
      }
      if (threadId) {
        await releasing.rpc
          .request('thread/unsubscribe', { threadId })
          .catch(() => undefined)
      }
      releasing.close()
    }
  }
}
