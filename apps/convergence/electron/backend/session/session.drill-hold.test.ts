import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { GitService } from '../git/git.service'
import { CodexProvider } from '../provider/codex/codex-provider'
import { CodexServerHostRegistry } from '../provider/codex/codex-server-host'
import {
  FakeCodexChildProcess,
  FakeCodexServer,
} from '../provider/codex/codex-server-host.fixture'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { isProviderBusyError } from '../provider/provider.types'
import { ProviderRegistry } from '../provider/provider-registry'
import { SessionQueuedInputService } from './session-queued-input.service'
import { SessionService } from './session.service'
import type { SessionSettledEvent } from './session.types'
import { TurnCaptureService } from './turn/turn-capture.service'

/**
 * The queue hold, against the real `SessionService` (MAR-3255 R2).
 *
 * The same harness the compaction tests use, and for the same reason: the
 * hold's whole job is to change what a REAL door does to a real queued row,
 * and a fake session service would be marking its own homework.
 */
let service: SessionService
let sessionId: string
let queue: SessionQueuedInputService
let server: FakeCodexServer
let settles: SessionSettledEvent[]
let cleanup: (() => Promise<void>) | undefined

beforeEach(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'drill-hold-'))
  const db = getDatabase()
  queue = new SessionQueuedInputService(db)
  settles = []
  server = new FakeCodexServer({})
  const hosts = new CodexServerHostRegistry({
    cwd: dir,
    spawnProcess: () => {
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
  providers.register(new CodexProvider(hosts, null, undefined, () => null))
  service = new SessionService(db, new LocalExecutionHost(providers), dir)
  service.onSessionSettled((event) => settles.push(event))
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
    name: 'the drill',
    model: 'gpt-5.4',
    effort: null,
  }).id
  cleanup = async () => {
    await service.disposeAll()
    await capture.flushPendingEnd(sessionId)
    await hosts.stopAll()
    rmSync(dir, { recursive: true, force: true })
  }
})

afterEach(async () => {
  await cleanup?.()
  closeDatabase()
  resetDatabase()
})

/**
 * Everything the Codex server was actually asked to run a turn on.
 *
 * The artifact, not the queue's own bookkeeping (MAR-3020): every claim here
 * is "the provider heard it / did not hear it", and a row stamped `sent`
 * proves nothing about what left the app.
 */
function turnsSentToProvider(): string[] {
  return server.requests
    .filter((request) => request.method === 'turn/start')
    .map((request) => JSON.stringify(request.params?.input ?? null))
}

async function startConversation(): Promise<void> {
  await service.start(sessionId, { text: 'first', providerAccountId: null })
  await vi.waitFor(() =>
    expect(service.getById(sessionId)?.status).toBe('completed'),
  )
}

/** Long enough for an unguarded path to reach the provider, and measured. */
async function letAnUnguardedDrainRun(): Promise<void> {
  for (let tick = 0; tick < 50; tick += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe('a held queue (MAR-3255 R2)', () => {
  it('queues a relay delivery and delivers it on release', async () => {
    await startConversation()
    const sentBefore = turnsSentToProvider().length
    service.holdQueue(sessionId)
    expect(service.isQueueHeld(sessionId)).toBe(true)

    const delivery = await service.deliverRelayMessage(sessionId, {
      text: 'the horse is done',
      providerAccountId: null,
      muteRelays: true,
      skipContextInjection: true,
    })

    // The same wait a compaction asks for, and told in the same word: the
    // drill IS a compaction with two turns strapped to it, so a horse's
    // return must land in the queue rather than in an `error` row with a
    // hail and no retry.
    expect(delivery).toMatchObject({ queued: true, waitingOn: 'compaction' })
    expect(
      service.getQueuedInputs(sessionId).map((item) => ({
        text: item.text,
        relaysMuted: item.relaysMuted,
        skipContextInjection: item.skipContextInjection,
        state: item.state,
      })),
    ).toEqual([
      {
        text: 'the horse is done',
        relaysMuted: true,
        skipContextInjection: true,
        state: 'queued',
      },
    ])
    await letAnUnguardedDrainRun()
    expect(turnsSentToProvider()).toHaveLength(sentBefore)

    service.releaseQueue(sessionId)
    expect(service.isQueueHeld(sessionId)).toBe(false)
    await vi.waitFor(() =>
      expect(turnsSentToProvider()).toHaveLength(sentBefore + 1),
    )
    await vi.waitFor(() =>
      expect(service.getById(sessionId)?.status).toBe('completed'),
    )
    expect(service.getQueuedInputs(sessionId)).toEqual([])
    const delivered = turnsSentToProvider().slice(sentBefore)
    expect(delivered).toHaveLength(1)
    expect(delivered[0]).toContain('the horse is done')
  })

  it("refuses a person's send with the compacting sentence", async () => {
    await startConversation()
    service.holdQueue(sessionId)
    const refusal = await service
      .sendMessage(sessionId, { text: 'too early', providerAccountId: null })
      .then(
        () => null,
        (error: unknown) => error,
      )
    expect(refusal).toBeInstanceOf(Error)
    expect((refusal as Error).message).toMatch(/compacting/)
    // The TYPE is what lets the relay door queue instead of losing a hop.
    expect(isProviderBusyError(refusal)).toBe(true)
    service.releaseQueue(sessionId)
  })

  it('queues an opener delivery instead of throwing it away', async () => {
    await startConversation()
    service.holdQueue(sessionId)
    const opened = await service.sendMessageWithOpener(sessionId, {
      text: 'payload',
      opener: '/clear',
      providerAccountId: null,
    })
    expect(opened).toMatchObject({
      openerQueued: true,
      waitingOn: 'compaction',
    })
    // Both beats, in order: an opener thrown away takes its payload with it.
    expect(service.getQueuedInputs(sessionId).map((item) => item.text)).toEqual(
      ['/clear', 'payload'],
    )
    service.releaseQueue(sessionId)
    await vi.waitFor(() =>
      expect(service.getQueuedInputs(sessionId)).toEqual([]),
    )
  })

  it('delivers nothing when a drain is fired while it is held', async () => {
    await startConversation()
    const sentBefore = turnsSentToProvider().length
    service.holdQueue(sessionId)

    // "Deliver now" is the reachable public trigger and it only exists on a
    // FAILED row, so the predecessor is staged through the sibling queue
    // service -- the shape a restart leaves behind.
    const failedRow = queue.enqueue(
      sessionId,
      {
        text: 'the horse is done',
        providerAccountId: null,
        dispatchId: 'first-attempt',
      },
      'follow-up',
    )
    queue.patch(failedRow.id, 'failed')
    const fresh = service.redeliverQueuedInput(failedRow.id)

    await letAnUnguardedDrainRun()
    expect(turnsSentToProvider()).toHaveLength(sentBefore)
    expect(service.getById(sessionId)?.status).not.toBe('running')
    // Nothing taken and nothing changed: the refusal happens before
    // `nextQueued` is read, so the fresh row is still `queued`.
    expect(
      service.getQueuedInputs(sessionId).map((item) => item.state),
    ).toEqual(['failed', 'queued'])

    service.releaseQueue(sessionId)
    await vi.waitFor(() =>
      expect(turnsSentToProvider()).toHaveLength(sentBefore + 1),
    )
    expect(fresh.id).toBeTruthy()
  })

  it('delivers the rows that waited once, and in order', async () => {
    await startConversation()
    const sentBefore = turnsSentToProvider().length
    service.holdQueue(sessionId)
    for (const text of ['first return', 'second return']) {
      const delivery = await service.deliverRelayMessage(sessionId, {
        text,
        providerAccountId: null,
      })
      expect(delivery.queued).toBe(true)
    }

    service.releaseQueue(sessionId)
    await vi.waitFor(
      () => expect(turnsSentToProvider()).toHaveLength(sentBefore + 2),
      { timeout: 5000 },
    )
    await vi.waitFor(() =>
      expect(service.getById(sessionId)?.status).toBe('completed'),
    )
    const delivered = turnsSentToProvider().slice(sentBefore)
    expect(delivered).toHaveLength(2)
    expect(delivered[0]).toContain('first return')
    expect(delivered[1]).toContain('second return')
    expect(service.getQueuedInputs(sessionId)).toEqual([])
  })

  it("refuses the answer to a provider's question, which approvals do not need", async () => {
    // Today's behaviour, pinned because it is the hold's sharpest edge and
    // the reason S2b owes a ruling before there is a button (MAR-3255).
    //
    // `approve` and `deny` go straight to the handle and never meet this
    // door, so a permission prompt raised mid-drill can still be answered.
    // A free-text ANSWER cannot: it travels as an ordinary `sendMessage`
    // with an `interactionResponse`, so the hold refuses it -- and a beat
    // that parks on `needs-input` therefore has no settle coming and no way
    // for the person to produce one.
    //
    // The routine holds nothing forever by ITSELF: every other ending
    // releases. This is the one shape where the release waits on a turn only
    // the user can end, and the user is the party the hold is shutting out.
    await startConversation()
    service.holdQueue(sessionId)
    const refusal = await service
      .sendMessage(sessionId, {
        text: 'the second one',
        deliveryMode: 'answer',
        providerAccountId: null,
      })
      .then(
        () => null,
        (error: unknown) => error as Error,
      )
    expect(refusal?.message).toMatch(/compacting/)
    service.releaseQueue(sessionId)
  })

  it('is a no-op to release a queue nobody held', async () => {
    await startConversation()
    const sentBefore = turnsSentToProvider().length
    queue.enqueue(
      sessionId,
      { text: 'waiting', providerAccountId: null, dispatchId: 'd1' },
      'follow-up',
    )
    service.releaseQueue(sessionId)
    await letAnUnguardedDrainRun()
    // Not "nothing happens to the row" -- an unheld queue drains on its own
    // schedule -- but the release itself must not be the thing that moved it.
    expect(service.isQueueHeld(sessionId)).toBe(false)
    expect(turnsSentToProvider().length).toBeGreaterThanOrEqual(sentBefore)
  })
})

describe('the drill beat passes the hold (MAR-3255 R2)', () => {
  it('reaches the provider while everything else waits, and is quiet', async () => {
    await startConversation()
    const sentBefore = turnsSentToProvider().length
    service.holdQueue(sessionId)
    settles.length = 0

    const dispatchId = await service.sendDrillBeat(
      sessionId,
      'You know the drill.',
    )
    expect(dispatchId).toBeTruthy()

    // The artifact: the provider was actually asked to run this turn, and it
    // never entered the queue the hold is holding shut.
    await vi.waitFor(() =>
      expect(turnsSentToProvider()).toHaveLength(sentBefore + 1),
    )
    expect(turnsSentToProvider().at(-1)).toContain('You know the drill.')
    expect(service.getQueuedInputs(sessionId)).toEqual([])

    await vi.waitFor(() => expect(settles).toHaveLength(1))
    // QUIET, and this is the guard that makes the routine safe: a sealing
    // reply ends in a `BATON:` line, and an unmuted settle would fire every
    // armed wire leaving this conversation -- a lap nobody asked for, in the
    // middle of a memory rewrite.
    expect(settles[0]).toMatchObject({
      sessionId,
      relaysMuted: true,
      dispatchIds: [dispatchId],
    })
    service.releaseQueue(sessionId)
  })

  it('still refuses to send into a conversation that is compacting', async () => {
    // The hold is the only thing a beat passes. A beat sent into a context
    // being rewritten is the failure the compaction door exists for.
    await startConversation()
    const compacting = service.compactContext(sessionId)
    const refusal = await service
      .sendDrillBeat(sessionId, 'You know the drill.')
      .then(
        () => null,
        (error: unknown) => error,
      )
    expect((refusal as Error | null)?.message).toMatch(/compacting/)
    await compacting
  })
})

describe('compaction and the hold (MAR-3255 R2)', () => {
  it('runs with a waiting row while held, and still refuses one while not held', async () => {
    await startConversation()
    service.holdQueue(sessionId)
    const delivery = await service.deliverRelayMessage(sessionId, {
      text: 'the horse is done',
      providerAccountId: null,
    })
    expect(delivery.queued).toBe(true)

    // Waiting rows are exactly what the hold is FOR: the routine holds the
    // queue so the returns pile up, and then compacts. A `queued` row
    // refusing the compaction would make the drill refuse itself.
    await expect(service.compactContext(sessionId)).resolves.toBeTruthy()

    service.releaseQueue(sessionId)
    await vi.waitFor(() =>
      expect(service.getQueuedInputs(sessionId)).toEqual([]),
    )
    await vi.waitFor(() =>
      expect(service.getById(sessionId)?.status).toBe('completed'),
    )

    // Unheld, the refusal stands untouched.
    queue.enqueue(
      sessionId,
      { text: 'waiting', providerAccountId: null, dispatchId: 'd-unheld' },
      'follow-up',
    )
    await expect(service.compactContext(sessionId)).rejects.toThrow(
      'Send or cancel queued input before compacting context',
    )
  })

  it('refuses a row mid-flight to the provider even while held', async () => {
    // `dispatching` is a turn ARRIVING, not a message waiting, and the hold
    // says nothing about it.
    await startConversation()
    service.holdQueue(sessionId)
    const row = queue.enqueue(
      sessionId,
      { text: 'in flight', providerAccountId: null, dispatchId: 'd-flight' },
      'follow-up',
    )
    queue.patch(row.id, 'dispatching')
    await expect(service.compactContext(sessionId)).rejects.toThrow(
      'Send or cancel queued input before compacting context',
    )
    service.releaseQueue(sessionId)
  })
})

describe('the readiness answer is the refusal (MAR-3255 R3)', () => {
  it('says yes on an idle conversation that just settled', async () => {
    await startConversation()
    expect(service.describeCompactionReadiness(sessionId)).toEqual({
      ready: true,
    })
  })

  it.each([
    [
      'a conversation that does not exist',
      async () => 'no-such-session',
      async () => {},
    ],
    ['a conversation that never ran', async () => sessionId, async () => {}],
  ])('agrees with the refusal for %s', async (_label, resolveId, arrange) => {
    await arrange()
    const id = await resolveId()
    const readiness = service.describeCompactionReadiness(id)
    expect(readiness.ready).toBe(false)
    const error = await service.compactContext(id).then(
      () => null,
      (thrown: unknown) => thrown as Error,
    )
    // Byte-identical, not merely similar: the routine shows this sentence to
    // the user in place of the one they would have got from the door.
    expect(error?.message).toBe((readiness as { reason: string }).reason)
  })

  it('agrees with the refusal while a send is still being prepared', async () => {
    await startConversation()
    const send = service.sendMessage(sessionId, {
      text: 'next',
      providerAccountId: null,
    })
    const readiness = service.describeCompactionReadiness(sessionId)
    expect(readiness).toEqual({
      ready: false,
      reason: 'Wait for the pending send before compacting context',
    })
    const error = await service.compactContext(sessionId).then(
      () => null,
      (thrown: unknown) => thrown as Error,
    )
    expect(error?.message).toBe((readiness as { reason: string }).reason)
    await send
    await vi.waitFor(() =>
      expect(service.getById(sessionId)?.status).toBe('completed'),
    )
  })

  it('agrees with the refusal when a row is waiting and nothing is held', async () => {
    await startConversation()
    queue.enqueue(
      sessionId,
      { text: 'waiting', providerAccountId: null, dispatchId: 'd-ready' },
      'follow-up',
    )
    const readiness = service.describeCompactionReadiness(sessionId)
    expect(readiness).toEqual({
      ready: false,
      reason: 'Send or cancel queued input before compacting context',
    })
    const error = await service.compactContext(sessionId).then(
      () => null,
      (thrown: unknown) => thrown as Error,
    )
    expect(error?.message).toBe((readiness as { reason: string }).reason)
  })
})
