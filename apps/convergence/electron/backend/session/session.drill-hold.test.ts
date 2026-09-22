import { mkdtempSync, readFileSync, rmSync } from 'fs'
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
import { AutoDrillService } from '../context-drill/auto-drill.service'

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
let capture: TurnCaptureService
let dir: string
/**
 * The `CODEX_HOME` of every host this fixture actually spawned (MAR-3285).
 *
 * The artifact for "which account ran this turn": Codex fixes a turn's
 * credential by the config directory its process is given, so a beat that
 * named no account shows up here as `ambient` no matter what the app's own
 * bookkeeping says.
 */
let spawnedHomes: string[]
/**
 * The server's options, read on every request rather than at construction --
 * so a test can decide mid-file that the next turn stays open, which is the
 * only way to hold a conversation in the state a question is asked from.
 */
let serverOptions: { autoCompleteTurns?: boolean }
let settles: SessionSettledEvent[]
let cleanup: (() => Promise<void>) | undefined

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'drill-hold-'))
  const db = getDatabase()
  queue = new SessionQueuedInputService(db)
  settles = []
  spawnedHomes = []
  serverOptions = {}
  server = new FakeCodexServer(serverOptions)
  const hosts = new CodexServerHostRegistry({
    cwd: dir,
    spawnProcess: (_binary, _args, options) => {
      spawnedHomes.push(options.env?.CODEX_HOME ?? 'ambient')
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
  // The account fixture from `session.account-handoff.test.ts`: without it no
  // session here can have a last-turn account, and a handoff is invisible --
  // which is how MAR-3285 passed review on MAR-3255.
  providers.register(
    new CodexProvider(hosts, null, undefined, (accountId) =>
      accountId
        ? {
            configDir: join(dir, accountId),
            executionHostId: 'local',
            label: accountId,
          }
        : null,
    ),
  )
  service = new SessionService(db, new LocalExecutionHost(providers), dir)
  service.onSessionSettled((event) => settles.push(event))
  capture = new TurnCaptureService(new GitService(), db, {
    debounceMs: 0,
  })
  service.setTurnCaptureService(capture)
  db.prepare(
    "INSERT INTO projects(id,name,repository_path) VALUES ('p','fixture',?)",
  ).run(dir)
  // Deliberately none of the defaults (MAR-3285 R5): a beat that reset one of
  // these to what the column would hold anyway is invisible against a session
  // created with the defaults.
  sessionId = service.create({
    projectId: 'p',
    workspaceId: null,
    providerId: 'codex',
    name: 'the drill',
    model: 'gpt-5.4',
    effort: 'high',
    serviceTier: 'priority',
    permissionConfig: {
      preset: 'custom',
      codex: { approvalPolicy: 'untrusted', sandbox: 'read-only' },
    },
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

async function startConversation(
  providerAccountId: string | null = null,
): Promise<void> {
  await service.start(sessionId, { text: 'first', providerAccountId })
  await vi.waitFor(() =>
    expect(service.getById(sessionId)?.status).toBe('completed'),
  )
}

/** The account each spawned Codex process was actually given credentials for. */
function accountsCodexRanUnder(): string[] {
  return spawnedHomes.map((home) => home.split('/').at(-1) ?? home)
}

/** The account stamped on each turn this conversation actually recorded. */
function accountsOnRecordedTurns(): Array<string | null> {
  return capture.listTurns(sessionId).map((turn) => turn.providerAccountId)
}

/** The parameters of the last turn the provider was asked to run. */
function lastRequestParams(
  method: string,
): Record<string, unknown> | undefined {
  return server.requests.filter((request) => request.method === method).at(-1)
    ?.params
}

/** Everything the conversation says out loud that is not a message. */
function noteTexts(): string[] {
  return service
    .getConversation(sessionId)
    .flatMap((item) => (item.kind === 'note' ? [item.text] : []))
}

/** The JSON-RPC id the fake server asks its question under. */
const PENDING_QUESTION_ID = 4100

/**
 * Makes the provider actually ask the user something (MAR-3255 R7).
 *
 * The real shape, not a row edited into `needs-input`: Codex raises
 * `item/tool/requestUserInput` on the connection, the adapter records the
 * request and flips attention, and the answer is only deliverable while that
 * request is still pending -- which is the state the door is supposed to
 * read.
 */
async function askTheUserAQuestion(): Promise<void> {
  // The connection first: `pushRaw` goes to the newest one and drops the
  // line when there is none, so pushing before the turn has reached the
  // server is a question nobody is ever asked, silently.
  await vi.waitFor(() =>
    expect(
      server.requests.some((request) => request.method === 'turn/start'),
    ).toBe(true),
  )
  server.pushRaw(
    JSON.stringify({
      jsonrpc: '2.0',
      id: PENDING_QUESTION_ID,
      method: 'item/tool/requestUserInput',
      params: {
        questions: [
          {
            id: 'working_dir',
            question: 'Where should scripts run?',
            header: 'Working dir',
            multiSelect: false,
            options: [
              { label: 'Project root only', description: 'the main repo' },
              { label: 'Active workspace', description: 'the worktree' },
            ],
          },
        ],
      },
    }) + '\n',
  )
  await vi.waitFor(() =>
    expect(service.getById(sessionId)?.attention).toBe('needs-input'),
  )
}

/** Long enough for an unguarded path to reach the provider, and measured. */
async function letAnUnguardedDrainRun(): Promise<void> {
  for (let tick = 0; tick < 50; tick += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe('a held queue (MAR-3255 R2)', () => {
  it.each([true, false])(
    'consults the synchronous guard before any row dispatches (hold=%s)',
    async (takeHold) => {
      serverOptions.autoCompleteTurns = false
      await service.start(sessionId, { text: 'first', providerAccountId: null })
      await vi.waitFor(() => expect(turnsSentToProvider()).toHaveLength(1))
      queue.enqueue(
        sessionId,
        { text: 'waiting', providerAccountId: null, dispatchId: 'waiting' },
        'follow-up',
      )
      const guard = vi.fn(() => {
        if (takeHold) service.holdQueue(sessionId)
        return true
      })
      const unsubscribe = service.onBeforeQueueDrain(guard)
      server.pushRaw(
        JSON.stringify({
          method: 'turn/completed',
          params: { turn: { id: 'turn-1', status: 'completed' } },
        }),
      )
      await vi.waitFor(() => expect(guard).toHaveBeenCalledWith(sessionId))
      expect(
        service.getQueuedInputs(sessionId).map((row) => row.state),
      ).toEqual(['queued'])
      expect(service.isQueueHeld(sessionId)).toBe(takeHold)
      expect(turnsSentToProvider()).toHaveLength(1)
      unsubscribe()
    },
  )

  it('the real completion seam leaves three rows queued when automatic run starts', async () => {
    serverOptions.autoCompleteTurns = false
    await service.start(sessionId, { text: 'first', providerAccountId: null })
    await vi.waitFor(() => expect(turnsSentToProvider()).toHaveLength(1))
    for (let i = 0; i < 3; i++)
      queue.enqueue(
        sessionId,
        {
          text: `waiting-${i}`,
          providerAccountId: null,
          dispatchId: `waiting-${i}`,
        },
        'follow-up',
      )
    let witnessed: { held: boolean; rows: string[] } | undefined
    const run = vi.fn(async () => {
      witnessed = {
        held: service.isQueueHeld(sessionId),
        rows: service.getQueuedInputs(sessionId).map((row) => row.state),
      }
      service.releaseQueue(sessionId)
      return { ok: true as const }
    })
    const auto = new AutoDrillService(
      {
        onBeforeQueueDrain: (guard) => service.onBeforeQueueDrain(guard),
        onSessionSettled: (listener) => service.onSessionSettled(listener),
        read: () => ({
          attention: 'finished',
          contextWindow: {
            availability: 'available',
            source: 'provider',
            usedPercentage: 90,
            remainingPercentage: 10,
            usedTokens: 90000,
            windowTokens: 100000,
          },
        }),
        enabled: () => true,
        parallelWork: () => ({ running: 0, unknown: 0 }),
        alert: () => ({ enabled: true, percent: 75, tokens: null }),
        holdQueue: (id) => service.holdQueue(id),
        releaseQueue: (id) => service.releaseQueue(id),
        note: vi.fn(),
        changed: vi.fn(),
      },
      {
        run,
        describe: () => ({
          seat: 'mastermind',
          eligible: true,
          offered: true,
          beat: null,
          reason: null,
        }),
        onDrillChanged: () => () => {},
      },
    )
    server.pushRaw(
      JSON.stringify({
        method: 'turn/completed',
        params: { turn: { id: 'turn-1', status: 'completed' } },
      }),
    )
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    expect(witnessed).toEqual({
      held: true,
      rows: ['queued', 'queued', 'queued'],
    })
    await vi.waitFor(() => expect(turnsSentToProvider()).toHaveLength(2))
    expect(turnsSentToProvider()[1]).toContain('waiting-0')
    auto.dispose()
  })

  it('a failed lifecycle never consults the guard and leaves its row queued (MAR-2971)', async () => {
    serverOptions.autoCompleteTurns = false
    await service.start(sessionId, { text: 'first', providerAccountId: null })
    await vi.waitFor(() => expect(turnsSentToProvider()).toHaveLength(1))
    queue.enqueue(
      sessionId,
      { text: 'waiting', providerAccountId: null, dispatchId: 'waiting' },
      'follow-up',
    )
    const guard = vi.fn(() => true)
    const unsubscribe = service.onBeforeQueueDrain(guard)
    server.pushRaw(
      JSON.stringify({
        method: 'turn/completed',
        params: {
          turn: {
            id: 'turn-1',
            status: 'failed',
            error: { message: 'fixture failure' },
          },
        },
      }),
    )
    await vi.waitFor(() =>
      expect(service.getById(sessionId)?.status).toBe('failed'),
    )
    await letAnUnguardedDrainRun()
    expect(guard).not.toHaveBeenCalled()
    expect(service.getQueuedInputs(sessionId).map((row) => row.state)).toEqual([
      'queued',
    ])
    expect(turnsSentToProvider()).toHaveLength(1)
    unsubscribe()
  })

  it('records the automatic note as an info context-drill event through the main note door', () => {
    // Pin the composition callback too: changing only main back to the dispatch
    // door must fail even while the dedicated service method remains correct.
    const main = readFileSync(
      new URL('../../main/index.ts', import.meta.url),
      'utf8',
    )
    expect(main).toMatch(
      /note: \(id, text\) => sessionService\.addContextDrillInfoNote\(id, text\)/,
    )
    const text = 'Context compacted automatically at 90% → 20%'
    service.addContextDrillInfoNote(sessionId, text)
    expect(service.getConversation(sessionId)).toEqual([
      expect.objectContaining({
        kind: 'note',
        text,
        level: 'info',
        providerMeta: expect.objectContaining({
          providerEventType: 'context-drill',
        }),
      }),
    ])
    expect(turnsSentToProvider()).toHaveLength(0)
  })

  it('never asks the automatic guard on a failed turn', async () => {
    serverOptions.autoCompleteTurns = false
    await service.start(sessionId, { text: 'first', providerAccountId: null })
    await vi.waitFor(() => expect(turnsSentToProvider()).toHaveLength(1))
    const guard = vi.fn(() => true)
    const unsubscribe = service.onBeforeQueueDrain(guard)
    server.pushRaw(
      JSON.stringify({
        method: 'turn/completed',
        params: {
          turn: {
            id: 'turn-1',
            status: 'failed',
            error: { message: 'fixture failure' },
          },
        },
      }),
    )
    await vi.waitFor(() =>
      expect(service.getById(sessionId)?.status).toBe('failed'),
    )
    expect(guard).not.toHaveBeenCalled()
    unsubscribe()
  })
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

  it("lets the answer to a provider's question through a hold", async () => {
    // The hold's sharpest edge, ruled in lap 2 (MAR-3255 R7).
    //
    // `approve` and `deny` go straight to the handle and never meet this
    // door. A free-text ANSWER does: it travels as an ordinary `sendMessage`
    // carrying an `interactionResponse`. Refused, a beat that parks on
    // `needs-input` has no settle coming and no way for the person to
    // produce one -- the routine would wait with the queue held until the
    // app restarts, locking out the only party who could have freed it.
    // A turn that stays open, because that is the only state this question
    // is ever asked from: Codex raises it mid-turn and the turn ends when
    // somebody answers. It is also exactly the shape the drill's sealing
    // beat is in when it parks.
    serverOptions.autoCompleteTurns = false
    await service.start(sessionId, {
      text: 'You know the drill.',
      providerAccountId: null,
    })
    await askTheUserAQuestion()
    service.holdQueue(sessionId)

    const answeredAt = server.responses.length
    await service.sendMessage(sessionId, {
      text: 'Active workspace',
      deliveryMode: 'answer',
      interactionResponse: {
        kind: 'choice',
        answers: [{ questionId: 'working_dir', values: ['Active workspace'] }],
      },
      providerAccountId: null,
    })

    // The artifact, on the far side: the provider's own question got its
    // answer back. Not "the door did not throw" -- a send that returned and
    // went nowhere is the failure this test is about.
    await vi.waitFor(() =>
      expect(server.responses.slice(answeredAt)).toContainEqual(
        expect.objectContaining({ id: PENDING_QUESTION_ID }),
      ),
    )
    // And it is a door, not a lift: the hold is still on afterwards, so the
    // next ordinary message still waits.
    expect(service.isQueueHeld(sessionId)).toBe(true)
    service.releaseQueue(sessionId)
  })

  it('still refuses an interactionResponse when nothing is asked', async () => {
    // Both halves of R7, and the second one is why the first is not a key
    // any caller can cut for itself: `interactionResponse` is a property on
    // an ordinary send, so without this the hold would be open to anybody
    // who set it. Nothing else in `SessionService` refuses an answer to a
    // question nobody asked -- the provider silently turns it into an
    // ordinary turn -- so this door is the only one that reads the pair.
    await startConversation()
    expect(service.getById(sessionId)?.attention).not.toBe('needs-input')
    service.holdQueue(sessionId)

    const refusal = await service
      .sendMessage(sessionId, {
        text: 'let me in',
        interactionResponse: {
          kind: 'choice',
          answers: [{ questionId: 'working_dir', values: ['anything'] }],
        },
        providerAccountId: null,
      })
      .then(
        () => null,
        (error: unknown) => error as Error,
      )
    expect(refusal?.message).toMatch(/compacting/)
    expect(isProviderBusyError(refusal)).toBe(true)
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

describe('the drill beat rides the conversation (MAR-3285)', () => {
  /**
   * The claim layer for "no handoff happened".
   *
   * Not `pendingAccountHandoffs`, which is private and empty again by the time
   * anything can read it: the observable consequences of a handoff are that a
   * host comes up on somebody else's credentials, that the conversation says
   * the account changed, and that the record stamps the new account on the
   * turn. All three are read here.
   */
  function expectEveryTurnRanOn(account: string | null): void {
    const home = account ?? 'ambient'
    // A handoff ENDS the resident connection and brings another host up on the
    // other credential, so one distinct home means no handoff ever happened --
    // and the length guard keeps that from passing on nothing at all.
    expect(accountsCodexRanUnder().length).toBeGreaterThanOrEqual(1)
    expect([...new Set(accountsCodexRanUnder())]).toEqual([home])
    expect(accountsOnRecordedTurns().length).toBeGreaterThan(1)
    expect([...new Set(accountsOnRecordedTurns())]).toEqual([account])
    expect(noteTexts().join('\n')).not.toMatch(/account/i)
    // One thread, start to finish: a handoff re-opens the conversation on the
    // other account rather than starting a second one, so this is the pin that
    // the beat did not quietly become a new conversation either.
    expect(
      server.methodsCalled().filter((method) => method === 'thread/start'),
    ).toHaveLength(1)
  }

  /**
   * A beat, waited out at the provider rather than at the session row.
   *
   * `sendDrillBeat` returns its receipt long before the turn runs, and the row
   * still reads `completed` from the turn before -- so waiting on the status
   * alone asserts the account of a turn that has not happened yet.
   */
  async function sendBeatAndWait(text: string): Promise<string> {
    const sentBefore = turnsSentToProvider().length
    const recordedBefore = capture.listTurns(sessionId).length
    const dispatchId = await service.sendDrillBeat(sessionId, text)
    await vi.waitFor(() =>
      expect(turnsSentToProvider()).toHaveLength(sentBefore + 1),
    )
    await vi.waitFor(() =>
      expect(capture.listTurns(sessionId)).toHaveLength(recordedBefore + 1),
    )
    await vi.waitFor(() =>
      expect(service.getById(sessionId)?.status).toBe('completed'),
    )
    return dispatchId
  }

  it('a drill beat rides on the account of the last turn', async () => {
    await startConversation('account-a')
    expect(accountsCodexRanUnder()).toEqual(['account-a'])
    service.holdQueue(sessionId)

    const dispatchId = await sendBeatAndWait('You know the drill.')

    expect(dispatchId).toBeTruthy()
    expectEveryTurnRanOn('account-a')
    // One host, reused: the beat did not even reach for a second process.
    expect(accountsCodexRanUnder()).toEqual(['account-a'])
    service.releaseQueue(sessionId)
  })

  it('a drill beat on a conversation with no account stays on none', async () => {
    // Absent is a third value: the fix must pass the `null` it read, not fall
    // back to anything, or every conversation on the ambient login becomes a
    // handoff in the other direction.
    await startConversation(null)
    expect(accountsCodexRanUnder()).toEqual(['ambient'])
    service.holdQueue(sessionId)

    await sendBeatAndWait('You know the drill.')

    expectEveryTurnRanOn(null)
    expect(accountsCodexRanUnder()).toEqual(['ambient'])
    service.releaseQueue(sessionId)
  })

  it('the after-beat rides the same account across the compaction', async () => {
    // R4. Both beats go through the one method, but the routine's shape is
    // send / compact / send and the compaction RELEASES the handle -- so the
    // after-message is a cold start, the exact beat that had nothing left to
    // inherit from and the one his live run died on.
    await startConversation('account-a')
    service.holdQueue(sessionId)

    await sendBeatAndWait('You know the drill.')
    await service.compactContext(sessionId)
    await sendBeatAndWait('The memory was rewritten.')

    expectEveryTurnRanOn('account-a')
    expect(accountsOnRecordedTurns()).toHaveLength(3)
    service.releaseQueue(sessionId)
  })

  it('a drill beat changes nothing else about the conversation', async () => {
    // R5, his word: "the same account, the same everything". The other four
    // per-turn facts are columns on the session row, so this asserts both
    // halves -- the row is untouched, AND the turn the provider was asked to
    // run used those values rather than the provider's defaults.
    await startConversation('account-a')
    const before = service.getById(sessionId)!
    const settings = {
      model: before.model,
      effort: before.effort,
      serviceTier: before.serviceTier,
      permissionConfig: before.permissionConfig,
    }
    expect(settings).toEqual({
      model: 'gpt-5.4',
      effort: 'high',
      serviceTier: 'priority',
      permissionConfig: {
        preset: 'custom',
        codex: { approvalPolicy: 'untrusted', sandbox: 'read-only' },
      },
    })
    service.holdQueue(sessionId)

    await sendBeatAndWait('You know the drill.')

    const after = service.getById(sessionId)!
    expect({
      model: after.model,
      effort: after.effort,
      serviceTier: after.serviceTier,
      permissionConfig: after.permissionConfig,
    }).toEqual(settings)
    expect(lastRequestParams('turn/start')).toMatchObject({
      model: 'gpt-5.4',
      effort: 'high',
      serviceTier: 'priority',
    })
    // The permission config travels when the thread is opened or resumed
    // rather than per turn, and the beat resumed the live thread -- so this
    // `thread/resume` is the beat's own, and it re-stated this conversation's
    // permissions rather than the provider's defaults.
    expect(lastRequestParams('thread/resume')).toMatchObject({
      approvalPolicy: 'untrusted',
      sandbox: 'read-only',
      serviceTier: 'priority',
    })
    service.releaseQueue(sessionId)
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

  it('agrees with the refusal while a plain compaction is already running', async () => {
    // R9. The shared guards do not ask this question -- it is
    // `compactContext`'s own first line and stays there -- so a reader that
    // skipped it answered "yes, compactable" during a person's own Compact,
    // and a drill started on that answer would hold the queue, send a beat
    // into a context being rewritten, and be refused by the very door that
    // was already busy.
    await startConversation()
    const compaction = service.compactContext(sessionId).catch(() => null)

    const readiness = service.describeCompactionReadiness(sessionId)
    expect(readiness).toEqual({
      ready: false,
      reason:
        'This conversation is compacting. Wait for it to finish before sending another message.',
    })
    const error = await service.compactContext(sessionId).then(
      () => null,
      (thrown: unknown) => thrown as Error,
    )
    expect(error?.message).toBe((readiness as { reason: string }).reason)
    await compaction
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
