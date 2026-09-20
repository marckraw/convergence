import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { GitService } from '../git/git.service'
import { CodexProvider } from '../provider/codex/codex-provider'
import { CodexServerHostRegistry } from '../provider/codex/codex-server-host'
import {
  FakeCodexChildProcess,
  FakeCodexServer,
  FAKE_CODEX_NO_RESPONSE,
} from '../provider/codex/codex-server-host.fixture'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { isProviderBusyError } from '../provider/provider.types'
import { ProviderRegistry } from '../provider/provider-registry'
import { SessionQueuedInputService } from './session-queued-input.service'
import { SessionService } from './session.service'
import { TurnCaptureService } from './turn/turn-capture.service'

let service: SessionService
let sessionId: string
let homes: Array<string | undefined>
let holdCompaction: boolean
let disconnectedAccount: boolean
let releaseCompaction: ((fail?: boolean) => void) | undefined
let cleanup: (() => Promise<void>) | undefined
let server: FakeCodexServer
let queue: SessionQueuedInputService

beforeEach(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'compaction-account-'))
  const db = getDatabase()
  queue = new SessionQueuedInputService(db)
  homes = []
  holdCompaction = false
  disconnectedAccount = false
  releaseCompaction = undefined
  server = new FakeCodexServer({
    onRequest: (message, connection) => {
      if (message.method === 'thread/compact/start' && holdCompaction) {
        releaseCompaction = (fail = false) => {
          if (fail)
            connection.respondError(message.id!, 'Fixture compaction failed')
          else {
            connection.respond(message.id!, {})
            connection.notify('thread/compacted', {
              threadId: message.params?.threadId,
            })
          }
        }
        return FAKE_CODEX_NO_RESPONSE
      }
    },
  })
  const hosts = new CodexServerHostRegistry({
    cwd: dir,
    spawnProcess: (_binary, _args, options) => {
      homes.push(options.env?.CODEX_HOME)
      const child = new FakeCodexChildProcess()
      setTimeout(() => child.announceListening('ws://127.0.0.1:5150'), 0)
      return child.asChildProcess()
    },
    connectTransport: async () => server.connect(),
    probeReady: async () => true,
    listProcesses: () => [],
  })
  hosts.setBinary('/fixture/codex', '0.154.0')
  const providers = new ProviderRegistry()
  providers.register(
    new CodexProvider(hosts, null, undefined, (id) => {
      if (disconnectedAccount && id === 'account-b')
        throw new Error(
          'Account B is disconnected. Reconnect it before continuing.',
        )
      return id === 'account-b' ? { configDir: join(dir, 'account-b') } : null
    }),
  )
  service = new SessionService(db, new LocalExecutionHost(providers), dir)
  const capture = new TurnCaptureService(new GitService(), db, {
    debounceMs: 0,
  })
  service.setTurnCaptureService(capture)
  db.prepare(
    "INSERT INTO projects(id,name,repository_path) VALUES ('p','fixture',?)",
  ).run(dir)
  sessionId = service.create({
    projectId: 'p',
    workspaceId: null,
    providerId: 'codex',
    name: 'compact account',
    model: 'gpt-5.4',
    effort: null,
  }).id
  cleanup = async () => {
    releaseCompaction?.()
    await service.disposeAll()
    await capture.flushPendingEnd(sessionId)
    await hosts.stopAll()
    rmSync(dir, { recursive: true, force: true })
  }
})

async function startConversation(
  providerAccountId: string | null = 'account-b',
) {
  await service.start(sessionId, { text: 'first', providerAccountId })
  await vi.waitFor(() =>
    expect(service.getById(sessionId)?.status).toBe('completed'),
  )
  expect(service.getLastTurnProviderAccountId(sessionId)).toBe(
    providerAccountId,
  )
}

afterEach(async () => {
  await cleanup?.()
  closeDatabase()
  resetDatabase()
})

it('compacts through the server that served the last turn', async () => {
  await startConversation()
  const originalHome = homes[0]
  expect(originalHome).toMatch(/account-b$/)
  await service.compactContext(sessionId)
  expect(homes).toEqual([originalHome])
})

it.each([false, true])(
  'blocks a send and duplicate compaction until compaction settles (failure=%s)',
  async (fail) => {
    await startConversation()
    holdCompaction = true
    const compact = service.compactContext(sessionId)
    const result = compact.then(
      () => 'completed',
      () => 'failed',
    )
    await vi.waitFor(() => expect(releaseCompaction).toBeTypeOf('function'))
    const before = service.getConversation(sessionId)
    // The USER's door stays loud, and says the same words (MAR-3020 R3).
    // What changed underneath is the TYPE: it is a busy refusal now, which
    // is what lets the relay's door queue instead of losing the hop. The
    // person still gets told no, now.
    const refusal = await service
      .sendMessage(sessionId, {
        text: 'too early',
        providerAccountId: 'account-b',
      })
      .then(
        () => null,
        (error: unknown) => error,
      )
    expect(refusal).toBeInstanceOf(Error)
    expect((refusal as Error).message).toMatch(/compacting/)
    expect(isProviderBusyError(refusal)).toBe(true)
    await expect(service.compactContext(sessionId)).rejects.toThrow(
      /compacting/,
    )
    // The OPENER door waits instead of throwing (MAR-3020 R3). It used to
    // reject here and queue nothing, which threw a whole hail away -- opener
    // and payload -- for a wait that ends on its own in a minute.
    const opened = await service.sendMessageWithOpener(sessionId, {
      text: 'payload',
      opener: '/clear',
      providerAccountId: 'account-b',
    })
    expect(opened).toMatchObject({
      openerQueued: true,
      waitingOn: 'compaction',
    })
    // Both beats, in order: an opener is never sent as its own turn here, so
    // the payload must be behind it and not merely present.
    expect(
      service.getQueuedInputs(sessionId).map((item) => ({
        text: item.text,
        relaysMuted: item.relaysMuted,
        skipContextInjection: item.skipContextInjection,
        state: item.state,
      })),
    ).toEqual([
      {
        text: '/clear',
        relaysMuted: true,
        skipContextInjection: true,
        state: 'queued',
      },
      {
        text: 'payload',
        relaysMuted: false,
        skipContextInjection: false,
        state: 'queued',
      },
    ])
    // Queued, not sent: nothing reached the provider while it compacted.
    expect(service.getConversation(sessionId)).toEqual(before)
    releaseCompaction!(fail)
    expect(await result).toBe(fail ? 'failed' : 'completed')
    expect(service.getById(sessionId)?.activity).toBeNull()
    // The end of compaction drains what waited, on BOTH exits (R4).
    await vi.waitFor(() =>
      expect(service.getQueuedInputs(sessionId)).toEqual([]),
    )
    await vi.waitFor(() =>
      expect(service.getById(sessionId)?.status).toBe('completed'),
    )
    await service.sendMessage(sessionId, {
      text: 'after compaction',
      providerAccountId: 'account-b',
    })
    await vi.waitFor(() =>
      expect(service.getById(sessionId)?.status).toBe('completed'),
    )
  },
)

it('refuses compaction while a send is still being prepared', async () => {
  await startConversation()
  const send = service.sendMessage(sessionId, {
    text: 'next',
    providerAccountId: 'account-b',
  })
  await expect(service.compactContext(sessionId)).rejects.toThrow(
    /pending send/,
  )
  await send
  await vi.waitFor(() =>
    expect(service.getById(sessionId)?.status).toBe('completed'),
  )
})

it('refuses a disconnected recorded account without falling back to ambient', async () => {
  await startConversation()
  const originalHomes = [...homes]
  disconnectedAccount = true
  await expect(service.compactContext(sessionId)).rejects.toThrow(
    /Account B is disconnected/,
  )
  expect(homes).toEqual(originalHomes)
  expect(service.getById(sessionId)?.activity).toBeNull()
  disconnectedAccount = false
  await service.sendMessage(sessionId, {
    text: 'after reconnect',
    providerAccountId: 'account-b',
  })
  await vi.waitFor(() =>
    expect(service.getById(sessionId)?.status).toBe('completed'),
  )
  expect(homes).toEqual(originalHomes)
})

it('keeps an unassigned conversation on the ambient host during compaction', async () => {
  await startConversation(null)
  expect(homes).toEqual([undefined])
  await service.compactContext(sessionId)
  expect(homes).toEqual([undefined])
})

/**
 * Everything the Codex server was actually asked to run a turn on.
 *
 * The artifact, not the intent (MAR-3020): the claim these tests make is
 * "the provider received it exactly once", and the queue's own bookkeeping
 * is the layer being tested -- reading it back to prove itself would pass
 * for a row that never left the app.
 */
function turnsSentToProvider(server: FakeCodexServer): string[] {
  return server.requests
    .filter((request) => request.method === 'turn/start')
    .map((request) => JSON.stringify(request.params?.input ?? null))
}

async function heldCompaction() {
  await startConversation()
  holdCompaction = true
  const compact = service.compactContext(sessionId)
  const settled = compact.then(
    () => 'completed',
    () => 'failed',
  )
  await vi.waitFor(() => expect(releaseCompaction).toBeTypeOf('function'))
  // Wrapped, never returned bare: an async function that returns a promise
  // flattens it, so `await heldCompaction()` would wait for the compaction
  // this helper exists to hold open.
  return { settled }
}

it('queues a relay delivery that arrives during compaction (R2, MAR-3020)', async () => {
  // The shape that ate a horse's return: the mastermind's conversation is
  // compacting, the horse finishes, and the hop used to be recorded as an
  // `error` with a hail and no retry. Compaction is a wait, not a failure.
  const { settled } = await heldCompaction()
  const before = service.getConversation(sessionId)

  const delivery = await service.deliverRelayMessage(sessionId, {
    text: 'the horse is done',
    providerAccountId: 'account-b',
    muteRelays: true,
    skipContextInjection: true,
  })

  expect(delivery).toMatchObject({ queued: true, waitingOn: 'compaction' })
  expect(delivery.dispatchId).toBeTruthy()
  // ONE row, carrying the WHOLE input. The three fields beyond the text are
  // named because a hand-copied enqueue here once dropped exactly them, and
  // a row that loses its mute is a row that fires wires it was told not to.
  expect(
    service.getQueuedInputs(sessionId).map((item) => ({
      text: item.text,
      providerAccountId: item.providerAccountId,
      relaysMuted: item.relaysMuted,
      skipContextInjection: item.skipContextInjection,
      state: item.state,
      dispatchId: item.dispatchId,
    })),
  ).toEqual([
    {
      text: 'the horse is done',
      providerAccountId: 'account-b',
      relaysMuted: true,
      skipContextInjection: true,
      state: 'queued',
      dispatchId: delivery.dispatchId,
    },
  ])
  // Waiting, not sent: the provider heard nothing while it compacted.
  expect(service.getConversation(sessionId)).toEqual(before)

  releaseCompaction!(false)
  await settled
})

it.each([false, true])(
  'delivers the waiting relay row exactly once when compaction ends (failure=%s) (R4, MAR-3020)',
  async (fail) => {
    // Queuing a row that nothing drains is a slower way to lose it. The end
    // of compaction is the drain, and a compaction that FAILED still ends
    // the wait -- the row behind it is owed its delivery either way.
    const { settled } = await heldCompaction()
    const sentBefore = turnsSentToProvider(server).length

    const delivery = await service.deliverRelayMessage(sessionId, {
      text: 'the horse is done',
      providerAccountId: 'account-b',
    })
    expect(delivery.queued).toBe(true)

    releaseCompaction!(fail)
    expect(await settled).toBe(fail ? 'failed' : 'completed')

    // Waited for at the PROVIDER, not in the queue: the row is stamped
    // `sent` when the dispatch is handed over, which is before the RPC
    // reaches Codex -- asserting on the queue's own bookkeeping here passed
    // while nothing had actually been delivered.
    await vi.waitFor(() =>
      expect(turnsSentToProvider(server).length).toBe(sentBefore + 1),
    )
    await vi.waitFor(() =>
      expect(service.getById(sessionId)?.status).toBe('completed'),
    )
    expect(service.getQueuedInputs(sessionId)).toEqual([])
    // EXACTLY once, read after the session settled: a drain that fired twice
    // -- once per exit, or once per queue re-entry -- would show a second
    // turn here, and duplicating a baton is the failure this rule guards.
    const delivered = turnsSentToProvider(server).slice(sentBefore)
    expect(delivered).toHaveLength(1)
    expect(delivered[0]).toContain('the horse is done')
  },
)

it('a drain fired during compaction delivers nothing until compaction ends (R1, MAR-3253)', async () => {
  // The door, not the caller. `dispatchNextQueuedInput` never asked whether
  // the conversation was compacting on its plain path -- it met
  // `assertNotCompacting` only through `assertAccountHandoffEligible`, i.e.
  // only when the row's account differed from the last turn's. So the row is
  // on `account-b`, the SAME account the last turn used: that is the path
  // with no guard on it, and the path a horse's return actually takes.
  const { settled } = await heldCompaction()
  const sentBefore = turnsSentToProvider(server).length

  // "Deliver now" is the reachable public trigger, and it only exists on a
  // FAILED row (`redeliver` refuses any other state), so the predecessor is
  // staged through the sibling queue service exactly as
  // `session.account-handoff.test.ts` stages one -- the shape a restart
  // leaves behind (`recoverDispatching`) or a turn that died mid-dispatch.
  // Only ONE row is in play on purpose: a second, separately queued row
  // would make "exactly once" a claim about the pair rather than about the
  // row the drain tried to take.
  const failedRow = queue.enqueue(
    sessionId,
    {
      text: 'the horse is done',
      providerAccountId: 'account-b',
      dispatchId: 'first-attempt',
    },
    'follow-up',
  )
  queue.patch(failedRow.id, 'failed')

  const fresh = service.redeliverQueuedInput(failedRow.id)
  const rows = () =>
    service
      .getQueuedInputs(sessionId)
      .map((item) => ({ id: item.id, state: item.state }))

  // The artifact, not the queue's own bookkeeping: the claim is that the
  // PROVIDER heard nothing while its context was being rewritten.
  //
  // Flushed, not merely awaited, and the count is measured rather than
  // guessed. `redeliverQueuedInput` fires its drain without awaiting it, and
  // the unguarded path is several hops long -- compaction released the
  // handle, so the drain has to spawn a host, connect, and open a thread
  // before `turn/start`. Removing the guard reaches the provider in 8 of
  // these ticks; 50 is the margin that makes this assertion refute the
  // mutation instead of merely outrunning it.
  for (let tick = 0; tick < 50; tick += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  expect(turnsSentToProvider(server).length).toBe(sentBefore)
  expect(service.getById(sessionId)?.status).not.toBe('running')

  // Nothing taken and nothing changed: the refusal happens before
  // `nextQueued` is read, so the fresh row is still `queued` -- not
  // `dispatching`, not `failed`, not put back by the busy class. The
  // predecessor stays beside it as the record of the first attempt, which is
  // what "Deliver now" leaves behind by design.
  expect(rows()).toEqual([
    { id: failedRow.id, state: 'failed' },
    { id: fresh.id, state: 'queued' },
  ])

  // Waiting, never lost: the drain in `compactContext`'s `finally` runs after
  // the compacting mark is deleted, and it is what delivers the row.
  releaseCompaction!(false)
  expect(await settled).toBe('completed')

  await vi.waitFor(() =>
    expect(turnsSentToProvider(server).length).toBe(sentBefore + 1),
  )
  await vi.waitFor(() =>
    expect(service.getById(sessionId)?.status).toBe('completed'),
  )
  // The fresh row left; only the first attempt's card remains.
  expect(rows()).toEqual([{ id: failedRow.id, state: 'failed' }])
  const delivered = turnsSentToProvider(server).slice(sentBefore)
  expect(delivered).toHaveLength(1)
  expect(delivered[0]).toContain('the horse is done')
})
