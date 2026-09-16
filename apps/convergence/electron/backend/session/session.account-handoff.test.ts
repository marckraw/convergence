import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { ProjectContextService } from '../project-context/project-context.service'
import { SessionContextInjectionService } from './context-injection/session-context-injection.service'
import { GitService } from '../git/git.service'
import { CodexProvider } from '../provider/codex/codex-provider'
import { CodexServerHostRegistry } from '../provider/codex/codex-server-host'
import {
  FakeCodexChildProcess,
  FakeCodexServer,
  FAKE_CODEX_NO_RESPONSE,
} from '../provider/codex/codex-server-host.fixture'
import { buildSkillCatalogId } from '../skills/skill-catalog.pure'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { ProviderRegistry } from '../provider/provider-registry'
import { SessionService } from './session.service'
import { SessionQueuedInputService } from './session-queued-input.service'
import { TurnCaptureService } from './turn/turn-capture.service'

let service: SessionService
let capture: TurnCaptureService
let queue: SessionQueuedInputService
let id: string
let dir: string
let registry: CodexServerHostRegistry
let hosts: Array<{
  home: string
  server: FakeCodexServer
  child: FakeCodexChildProcess
}>
let missing: 'thread/resume' | 'turn/start' | null
let layoutReady: boolean
let holdAcceptance: boolean
/** The daemon's skills/list answer, so a test can arm a selected skill. */
let skillsCatalog: unknown
let accept: (() => void) | undefined
let completeTurns: boolean
let failInterrupt: boolean
let loseAck: boolean
let unreadableTurns: boolean
let rejectAck: (() => void) | undefined
let sourceState: 'connected' | 'unavailable' | 'removed'
let settled: Array<{ dispatchIds: string[] }>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'account-handoff-'))
  const db = getDatabase()
  hosts = []
  missing = null
  layoutReady = true
  holdAcceptance = false
  skillsCatalog = undefined
  accept = undefined
  settled = []
  sourceState = 'connected'
  completeTurns = true
  failInterrupt = false
  loseAck = false
  unreadableTurns = false
  rejectAck = undefined
  const urls = new Map<string, FakeCodexServer>()
  registry = new CodexServerHostRegistry({
    cwd: dir,
    spawnProcess: (_binary, _args, options) => {
      const home = options.env?.CODEX_HOME ?? 'ambient'
      let clientId: unknown
      const server = new FakeCodexServer({
        autoCompleteTurns: completeTurns,
        skillsResponse: skillsCatalog,
        onRequest: (message, connection) => {
          if (message.method === 'turn/interrupt' && failInterrupt)
            throw new Error('Interrupt transport failed')
          if (message.method === 'thread/turns/list' && loseAck) {
            if (unreadableTurns) throw new Error('Cannot read the turn')
            return {
              data: [
                {
                  id: 'owned-lost-turn',
                  status: 'inProgress',
                  items: [{ type: 'userMessage', clientId }],
                },
              ],
              nextCursor: null,
            }
          }
          if (message.method === 'turn/start' && loseAck) {
            clientId = message.params?.clientUserMessageId
            server.loadedThreads.set(String(message.params?.threadId), {
              type: 'active',
            })
            rejectAck = () =>
              connection.respondError(
                message.id!,
                'The acknowledgement was lost',
              )
            return FAKE_CODEX_NO_RESPONSE
          }
          if (home.endsWith('account-b') && message.method === missing)
            throw new Error(`thread not found: ${message.params?.threadId}`)
          if (
            home.endsWith('account-b') &&
            message.method === 'turn/start' &&
            holdAcceptance
          ) {
            accept = () => {
              server.loadedThreads.set(String(message.params?.threadId), {
                type: 'idle',
              })
              connection.respond(message.id!, {
                turn: { id: 'held-turn', status: 'inProgress' },
              })
              connection.notify('turn/started', { turn: { id: 'held-turn' } })
              connection.notify('turn/completed', {
                turn: { id: 'held-turn', status: 'completed' },
              })
            }
            return FAKE_CODEX_NO_RESPONSE
          }
        },
      })
      const child = new FakeCodexChildProcess()
      hosts.push({ home, server, child })
      const url = `ws://127.0.0.1:${5200 + hosts.length}`
      urls.set(url, server)
      setTimeout(() => child.announceListening(url), 0)
      return child.asChildProcess()
    },
    connectTransport: async (url) => urls.get(url)!.connect(),
    probeReady: async () => true,
    listProcesses: () => [],
  })
  registry.setBinary('/fixture/codex', '0.154.0')
  const providers = new ProviderRegistry()
  providers.register(
    new CodexProvider(
      registry,
      null,
      undefined,
      (accountId) => {
        if (accountId === 'account-a' && sourceState !== 'connected')
          throw new Error('The source cannot serve turns')
        return accountId
          ? {
              configDir: join(dir, accountId),
              executionHostId: 'local',
              label: accountId,
            }
          : null
      },
      {
        inspect: async () => ({
          ready: layoutReady,
          warnings: layoutReady ? [] : ['History layout needs reconnect.'],
        }),
      },
      (accountId) => ({
        account: {
          configDir: join(dir, accountId),
          executionHostId: 'local',
          label: accountId,
        },
        removed: sourceState === 'removed',
      }),
    ),
  )
  service = new SessionService(db, new LocalExecutionHost(providers), dir)
  capture = new TurnCaptureService(new GitService(), db, { debounceMs: 0 })
  service.setTurnCaptureService(capture)
  queue = new SessionQueuedInputService(db)
  service.onSessionSettled((event) => settled.push(event))
  db.prepare(
    "INSERT INTO projects(id,name,repository_path) VALUES ('p','fixture',?)",
  ).run(dir)
  id = service.create({
    projectId: 'p',
    workspaceId: null,
    providerId: 'codex',
    model: 'gpt-5.4',
    effort: null,
    name: 'handoff',
  }).id
})

afterEach(async () => {
  accept?.()
  await service.disposeAll()
  await capture.flushPendingEnd(id)
  await registry.stopAll()
  closeDatabase()
  resetDatabase()
  rmSync(dir, { recursive: true, force: true })
})

const messages = () =>
  service
    .getConversation(id)
    .flatMap((item) =>
      item.kind === 'message' && item.actor === 'user' ? [item.text] : [],
    )
const accounts = () =>
  capture.listTurns(id).map((turn) => turn.providerAccountId)
async function first(account: string | null = 'account-a') {
  await service.start(id, { text: 'first', providerAccountId: account })
  await vi.waitFor(() => expect(service.getById(id)?.status).toBe('completed'))
  await vi.waitFor(() =>
    expect(hosts[0]!.server.connections.every((c) => c.closed)).toBe(true),
  )
}
async function send(account = 'account-b', text = 'second') {
  return service.sendMessage(id, { text, providerAccountId: account })
}

it('hands A to B to A through the same native thread and releases each source writer', async () => {
  await first()
  const nativeId = service.getById(id)!.continuationToken
  const dispatchB = await send()
  expect(accounts()).toEqual(['account-a', 'account-b'])
  expect(settled.at(-1)?.dispatchIds).toEqual([dispatchB])
  await vi.waitFor(() =>
    expect(hosts[1]!.server.connections.every((c) => c.closed)).toBe(true),
  )
  await send('account-a', 'third')
  expect(service.getById(id)!.continuationToken).toBe(nativeId)
  expect(accounts()).toEqual(['account-a', 'account-b', 'account-a'])
  expect(hosts.map((h) => h.home.split('/').at(-1))).toEqual([
    'account-a',
    'account-b',
    'account-a',
  ])
  expect(
    hosts
      .flatMap((h) => h.server.requests)
      .filter((r) => r.method === 'thread/start'),
  ).toHaveLength(1)
  expect(messages()).toEqual(['first', 'second', 'third'])
})

it.each(['thread/resume', 'turn/start'] as const)(
  'refuses missing native history at %s without user publication or fresh recovery',
  async (method) => {
    await first()
    missing = method
    const before = service.getConversation(id)
    await expect(send()).rejects.toThrow(/not sent/)
    expect(service.getConversation(id)).toEqual(before)
    expect(accounts()).toEqual(['account-a'])
    expect(hosts[1]!.server.methodsCalled()).not.toContain('thread/start')
    expect(service.getById(id)?.status).toBe('completed')
    missing = null
    await send()
    expect(accounts()).toEqual(['account-a', 'account-b'])
  },
)

it('refuses loaded runtime work with no socket lease and leaves the conversation unsent', async () => {
  await first()
  await send()
  await vi.waitFor(() =>
    expect(hosts[1]!.server.connections.every((c) => c.closed)).toBe(true),
  )
  hosts[1]!.server.loadedThreads.set('orphan-work', { type: 'active' })
  await expect(send('account-a', 'too early')).rejects.toMatchObject({
    stage: 'source-busy',
  })
  expect(messages()).toEqual(['first', 'second'])
  expect(hosts).toHaveLength(2)
})

it('holds publication and refuses a second send and opener until acceptance, without losing either receipt', async () => {
  await first()
  holdAcceptance = true
  const pending = send()
  await vi.waitFor(() => expect(accept).toBeTypeOf('function'))
  expect(messages()).toEqual(['first'])
  await expect(send('account-a', 'racing')).rejects.toThrow(/handoff/)
  await expect(
    service.sendMessageWithOpener(id, {
      opener: '/clear',
      text: 'payload',
      providerAccountId: 'account-a',
    }),
  ).rejects.toThrow(/handoff/)
  expect(service.getQueuedInputs(id)).toEqual([])
  accept!()
  const dispatch = await pending
  expect(messages()).toEqual(['first', 'second'])
  expect(settled.at(-1)?.dispatchIds).toEqual([dispatch])
  holdAcceptance = false
  await send('account-a', 'after')
  expect(settled.at(-1)?.dispatchIds).not.toContain(dispatch)
})

it('uses a queued input’s captured account and drains another handoff after an immediate completion', async () => {
  await first()
  const row = queue.enqueue(
    id,
    {
      text: 'queued B',
      providerAccountId: 'account-b',
      dispatchId: 'queued-b',
    },
    'follow-up',
  )
  queue.patch(row.id, 'failed')
  queue.enqueue(
    id,
    {
      text: 'queued A',
      providerAccountId: 'account-a',
      dispatchId: 'queued-a',
    },
    'follow-up',
  )
  service.redeliverQueuedInput(row.id)
  await vi.waitFor(() =>
    expect(accounts()).toEqual(['account-a', 'account-b', 'account-a']),
  )
  expect(messages()).toEqual(['first', 'queued B', 'queued A'])
  expect(
    service
      .getQueuedInputs(id)
      .filter((item) => item.state === 'failed' && !item.redeliveredBy),
  ).toEqual([])
  expect(settled.at(-1)?.dispatchIds).toContain('queued-a')
})

it('refuses a malformed layout before spawning a destination and can retry after repair', async () => {
  await first()
  layoutReady = false
  await expect(send()).rejects.toMatchObject({
    stage: 'layout',
    message: expect.stringMatching(/History layout/),
  })
  expect(hosts).toHaveLength(1)
  expect(messages()).toEqual(['first'])
  layoutReady = true
  await send()
  expect(accounts()).toEqual(['account-a', 'account-b'])
})

it('accepts ambient as a source but refuses ambient as the destination', async () => {
  await first(null)
  await send()
  expect(accounts()).toEqual([null, 'account-b'])
  await expect(
    service.sendMessage(id, {
      text: 'ambient destination',
      providerAccountId: null,
    }),
  ).rejects.toThrow(/default account/)
  expect(accounts()).toEqual([null, 'account-b'])
})

it.each(['thread/resume', 'turn/start'] as const)(
  'preserves same-account missing-thread recovery at %s',
  async (method) => {
    await first('account-b')
    const prior = service.getById(id)!.continuationToken
    missing = method
    // Only the old native id is missing; a fresh thread must be accepted.
    const server = hosts[0]!.server
    const originalRequests = server.requests.length
    const sendPromise = send('account-b', 'same account retry')
    await sendPromise
    await vi.waitFor(() =>
      expect(service.getById(id)?.continuationToken).not.toBe(prior),
    )
    expect(
      server.requests.slice(originalRequests).map((r) => r.method),
    ).toContain('thread/start')
    expect(messages()).toContain('same account retry')
  },
)

it('stops a pending handoff without publishing its user item', async () => {
  await first()
  holdAcceptance = true
  const pending = send()
  const outcome = pending.catch((error) => error)
  await vi.waitFor(() => expect(accept).toBeTypeOf('function'))
  service.stop(id)
  expect(await outcome).toMatchObject({ name: 'HandoffRefusedError' })
  accept!()
  expect(messages()).toEqual(['first'])
  expect(accounts()).toEqual(['account-a'])
})

async function running() {
  completeTurns = false
  await service.start(id, { text: 'running A', providerAccountId: 'account-a' })
  await vi.waitFor(() =>
    expect(hosts[0]?.server.methodsCalled()).toContain('turn/start'),
  )
  expect(service.getById(id)?.status).toBe('running')
}

it('remembers a failed connection without interrupting its live source turn; a later idle read permits handoff', async () => {
  await running()
  const server = hosts[0]!.server
  server.connections.at(-1)!.fail('socket gone')
  await vi.waitFor(() => expect(service.getById(id)?.status).toBe('failed'))
  expect(server.methodsCalled()).not.toContain('turn/interrupt')
  await expect(send()).rejects.toMatchObject({ stage: 'not-eligible' })
  expect(hosts).toHaveLength(1)
  server.loadedThreads.set(service.getById(id)!.continuationToken!, {
    type: 'idle',
  })
  completeTurns = true
  await send()
  expect(accounts()).toEqual(['account-a', 'account-b'])
})

it('interrupts a fatal notification before releasing its subscription', async () => {
  await running()
  const server = hosts[0]!.server
  server.connections
    .at(-1)!
    .notify('error', { error: { message: 'fatal failure' }, willRetry: false })
  await vi.waitFor(() =>
    expect(server.methodsCalled()).toContain('thread/unsubscribe'),
  )
  const methods = server.methodsCalled()
  expect(methods.indexOf('turn/interrupt')).toBeLessThan(
    methods.indexOf('thread/unsubscribe'),
  )
  expect(
    server.requests.find((r) => r.method === 'turn/interrupt')?.params?.turnId,
  ).toBe('turn-1')
})

it('retains a failed-interrupt marker instead of allowing a handoff on a false stopped state', async () => {
  await running()
  failInterrupt = true
  service.stop(id)
  await vi.waitFor(() =>
    expect(hosts[0]!.server.methodsCalled()).toContain('thread/unsubscribe'),
  )
  await expect(send()).rejects.toMatchObject({ stage: 'not-eligible' })
  expect(hosts).toHaveLength(1)
})

it.each([false, true])(
  'reconciles an explicitly stopped lost acknowledgement (unknown=%s)',
  async (unknown) => {
    loseAck = true
    unreadableTurns = unknown
    await running()
    await vi.waitFor(() => expect(rejectAck).toBeTypeOf('function'))
    service.stop(id)
    rejectAck!()
    const server = hosts[0]!.server
    await vi.waitFor(() =>
      expect(server.methodsCalled()).toContain('thread/turns/list'),
    )
    if (unknown) {
      await expect(send()).rejects.toMatchObject({ stage: 'not-eligible' })
      expect(server.methodsCalled()).not.toContain('turn/interrupt')
    } else {
      await vi.waitFor(() =>
        expect(server.methodsCalled()).toContain('turn/interrupt'),
      )
      expect(
        server.requests.find((r) => r.method === 'turn/interrupt')?.params
          ?.turnId,
      ).toBe('owned-lost-turn')
    }
    expect(
      server.requests.filter((r) => r.method === 'turn/start'),
    ).toHaveLength(1)
  },
)

it('clears the known-live marker when the owning server generation dies', async () => {
  await running()
  hosts[0]!.server.connections.at(-1)!.fail('socket gone')
  await vi.waitFor(() => expect(service.getById(id)?.status).toBe('failed'))
  hosts[0]!.child.exit(1)
  completeTurns = true
  await send()
  expect(accounts()).toEqual(['account-a', 'account-b'])
})

it.each(['unavailable', 'removed'] as const)(
  'switches away from a %s source while witnessing its retained host',
  async (state) => {
    await first()
    sourceState = state
    hosts[0].server.loadedThreads.set('sibling', { type: 'active' })
    await expect(send()).rejects.toMatchObject({ stage: 'source-busy' })
    expect(hosts).toHaveLength(1)
    hosts[0].server.loadedThreads.set('sibling', { type: 'idle' })
    await send()
    expect(accounts()).toEqual(['account-a', 'account-b'])
    expect(hosts[0].child.signalCode).not.toBeNull()
  },
)

it('a removed source with no resident key is not recreated or treated as ambient', async () => {
  await first()
  await registry.withStoppedServer(
    {
      account: { configDir: join(dir, 'account-a') },
      executionHostId: 'local',
    },
    async () => {},
    { retire: true },
  )
  sourceState = 'removed'
  await send()
  expect(accounts()).toEqual(['account-a', 'account-b'])
  expect(hosts.map((host) => host.home)).toEqual([
    join(dir, 'account-a'),
    join(dir, 'account-b'),
  ])
})

it('queues a follow-up on B while A runs and hands off its captured account at drain', async () => {
  await running()
  const receipt = await service.sendMessage(id, {
    text: 'queued B from send',
    providerAccountId: 'account-b',
    deliveryMode: 'follow-up',
  })
  expect(service.getQueuedInputs(id)).toEqual([
    expect.objectContaining({
      text: 'queued B from send',
      providerAccountId: 'account-b',
      state: 'queued',
    }),
  ])
  expect(hosts).toHaveLength(1)
  completeTurns = true
  const server = hosts[0].server
  server.loadedThreads.set(service.getById(id)!.continuationToken!, {
    type: 'idle',
  })
  server.connections
    .at(-1)!
    .notify('turn/completed', { turn: { id: 'turn-1', status: 'completed' } })
  await vi.waitFor(() => expect(accounts()).toEqual(['account-a', 'account-b']))
  await vi.waitFor(() => expect(settled.at(-1)?.dispatchIds).toContain(receipt))
  expect(messages()).toEqual(['running A', 'queued B from send'])
})

it('a refused archived start leaves archive and transcript unchanged', async () => {
  await first()
  service.archive(id)
  const archivedAt = service.getById(id)!.archivedAt
  const before = service.getConversation(id)
  const context = new ProjectContextService(getDatabase())
  service.setSessionContextInjectionService(
    new SessionContextInjectionService(getDatabase(), context),
  )
  const item = context.create({
    projectId: 'p',
    label: 'boot fixture',
    body: 'Context for the accepted turn',
    reinjectMode: 'boot',
  })
  hosts[0].server.loadedThreads.set('sibling', { type: 'active' })
  await expect(
    service.start(id, {
      text: 'retry from opener',
      providerAccountId: 'account-b',
      contextItemIds: [item.id],
    }),
  ).rejects.toMatchObject({ stage: 'source-busy' })
  expect(context.listForSession(id)).toEqual([])
  expect(service.getById(id)!.archivedAt).toBe(archivedAt)
  expect(service.getConversation(id)).toEqual(before)
  hosts[0].server.loadedThreads.set('sibling', { type: 'idle' })
  await service.start(id, {
    text: 'accepted with context',
    providerAccountId: 'account-b',
    contextItemIds: [item.id],
  })
  expect(service.getById(id)!.archivedAt).toBeNull()
  expect(context.listForSession(id).map((item) => item.id)).toEqual([item.id])
  expect(
    service
      .getConversation(id)
      .some(
        (item) => item.kind === 'note' && item.text.includes('boot fixture'),
      ),
  ).toBe(true)
})

it('normal completion releases without interrupting or marking a known-live turn', async () => {
  await first()
  const marker = vi.spyOn(
    registry.get({ account: { configDir: join(dir, 'account-a') } }),
    'rememberPossiblyLiveThread',
  )
  await send('account-a', 'ordinary next turn')
  await vi.waitFor(() => expect(service.getById(id)?.status).toBe('completed'))
  expect(marker).not.toHaveBeenCalled()
  expect(hosts[0].server.methodsCalled()).not.toContain('turn/interrupt')
})

it('still publishes an accepted handoff if a selected context item disappears while pending', async () => {
  await first()
  const context = new ProjectContextService(getDatabase())
  service.setSessionContextInjectionService(
    new SessionContextInjectionService(getDatabase(), context),
  )
  const item = context.create({
    projectId: 'p',
    label: 'pending context',
    body: 'Included before deletion',
    reinjectMode: 'boot',
  })
  holdAcceptance = true
  const pending = service.start(id, {
    text: 'accepted with disappearing context',
    providerAccountId: 'account-b',
    contextItemIds: [item.id],
  })
  await vi.waitFor(() => expect(accept).toBeTypeOf('function'))
  context.delete(item.id)
  accept!()
  await expect(pending).resolves.toBeTypeOf('string')
  expect(accounts()).toEqual(['account-a', 'account-b'])
  expect(
    service
      .getConversation(id)
      .some(
        (item) =>
          item.kind === 'note' &&
          item.text.includes('was accepted, but its project context selection'),
      ),
  ).toBe(true)
  expect(messages().at(-1)).toContain('accepted with disappearing context')
})

it.each(['archive', 'boot-note', 'warning-note'] as const)(
  'keeps acceptance and publishes the turn when post-accept %s persistence fails',
  async (failure) => {
    await first()
    service.archive(id)
    const context = new ProjectContextService(getDatabase())
    service.setSessionContextInjectionService(
      new SessionContextInjectionService(getDatabase(), context),
    )
    const item = context.create({
      projectId: 'p',
      label: 'accepted context',
      body: 'Included in the accepted message',
      reinjectMode: 'boot',
    })
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    holdAcceptance = true
    const pending = service.start(id, {
      text: 'accepted despite metadata failure',
      providerAccountId: 'account-b',
      contextItemIds: [item.id],
    })
    await vi.waitFor(() => expect(accept).toBeTypeOf('function'))
    if (failure === 'archive') {
      getDatabase().exec(`CREATE TEMP TRIGGER refuse_unarchive
        BEFORE UPDATE OF archived_at ON sessions
        WHEN NEW.archived_at IS NULL
        BEGIN SELECT RAISE(ABORT, 'fixture archive write failed'); END`)
    } else {
      getDatabase().exec(`CREATE TEMP TRIGGER refuse_boot_note
        BEFORE INSERT ON session_conversation_items
        WHEN NEW.provider_event_type IN (${failure === 'warning-note' ? "'context.boot', 'session.start.persistence-failed'" : "'context.boot'"})
        BEGIN SELECT RAISE(ABORT, 'fixture note write failed'); END`)
    }
    accept!()
    await expect(pending).resolves.toBeTypeOf('string')
    expect(accounts()).toEqual(['account-a', 'account-b'])
    expect(messages().at(-1)).toContain('accepted despite metadata failure')
    expect(errors).toHaveBeenCalled()
    if (failure !== 'warning-note') {
      expect(
        service
          .getConversation(id)
          .some(
            (entry) =>
              entry.kind === 'note' &&
              entry.level === 'warning' &&
              entry.text.includes('was accepted'),
          ),
      ).toBe(true)
    }
    errors.mockRestore()
  },
)

// -- MAR-3023: an accepted turn is never a failed send when its recording fails --

const recordingFailedNotes = () =>
  service
    .getConversation(id)
    .filter(
      (item) =>
        item.kind === 'note' &&
        item.providerMeta.providerEventType === 'recording-failed',
    )

it('MAR-3023 door (1): an accepted handoff send resolves when the turn publication cannot be recorded', async () => {
  await first()
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  const failures: import('./session.types').AcceptedRecordingFailureEvent[] = []
  service.onAcceptedRecordingFailure((event) => failures.push(event))
  // The buffered handoff deltas replay at receipt publication; refusing the
  // item inserts makes exactly that publication fail — after turn/start.
  getDatabase().exec(`CREATE TEMP TRIGGER refuse_publication
    BEFORE INSERT ON session_conversation_items
    BEGIN SELECT RAISE(ABORT, 'fixture publication refused'); END`)

  const dispatchId = await send('account-b', 'accepted turn, refused record')

  // The door resolves with its receipt: the composer sees accepted, not failed.
  expect(dispatchId).toBeTypeOf('string')
  expect(service.getById(id)?.status).not.toBe('failed')
  // The loss is the turn's own outcome: one fact for the one dispatch...
  expect(failures.map((failure) => failure.dispatchId)).toEqual([dispatchId])
  expect(failures[0]).toMatchObject({
    sessionId: id,
    label: 'the conversation item',
    providerRunning: true,
  })
  // ...and the provider took exactly one turn — nothing re-sent the message.
  // The count is taken after a short grace, so a silent retry that reuses
  // the receipt cannot slip under the assertion. (The turn's own settle is
  // part of the lost recording here — the buffered settle never replays
  // past the first refused write — which is exactly what the note names.)
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(
    hosts[1]!.server.requests.filter((r) => r.method === 'turn/start'),
  ).toHaveLength(1)
  errors.mockRestore()
})

it('MAR-3023 R2: a codex turn stays honest when only its local recording fails after turn/start', async () => {
  // The daemon's catalog has to be armed before the first turn: the second
  // send reuses its app-server, and the fixture captures `skillsResponse` at
  // spawn time.
  const skillPath = '/catalog/skills/planning/SKILL.md'
  skillsCatalog = {
    skills: [
      {
        name: 'planning',
        path: skillPath,
        scope: 'global',
        description: 'Plan implementation work.',
        enabled: true,
      },
    ],
  }
  await first()
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  const failures: import('./session.types').AcceptedRecordingFailureEvent[] = []
  service.onAcceptedRecordingFailure((event) => failures.push(event))
  // A selected skill is the one post-ack write on this path: after turn/start
  // acknowledged, the user message's skill chips are patched to `sent` —
  // an item UPDATE. Refusing only that UPDATE makes the failure land after
  // acceptance — the exact case the post-ack catch must not conclude `failed`
  // for. (The pre-ack writes are an item INSERT and session UPDATEs, both
  // still allowed.)
  getDatabase().exec(`CREATE TEMP TRIGGER refuse_item_update
    BEFORE UPDATE ON session_conversation_items
    BEGIN SELECT RAISE(ABORT, 'fixture item update refused'); END`)

  const dispatchId = await service.sendMessage(id, {
    text: 'accepted, record would not take it',
    providerAccountId: 'account-a',
    skillSelections: [
      {
        id: buildSkillCatalogId({
          providerId: 'codex',
          name: 'planning',
          path: skillPath,
          scope: 'global',
          rawScope: 'global',
        }),
        providerId: 'codex',
        providerName: 'Codex',
        name: 'planning',
        displayName: 'Planning',
        path: '/renderer/stale/SKILL.md',
        scope: 'global',
        rawScope: 'global',
        sourceLabel: 'Global',
        status: 'selected',
      },
    ],
  })

  expect(dispatchId).toBeTypeOf('string')
  // The continuation send is fire-and-forget: wait for the turn the daemon
  // took, then for its post-ack recording failure to land.
  await vi.waitFor(() =>
    expect(
      hosts
        .flatMap((h) => h.server.requests)
        .filter((r) => r.method === 'turn/start'),
    ).toHaveLength(2),
  )
  await vi.waitFor(() => expect(failures).toHaveLength(1))
  expect(service.getById(id)?.status).not.toBe('failed')
  expect(service.getById(id)?.attention).not.toBe('failed')
  // One recording-failed note (an INSERT, still allowed by the trigger) and
  // one fact for the dispatch.
  expect(recordingFailedNotes()).toHaveLength(1)
  expect(failures.map((failure) => failure.dispatchId)).toEqual([dispatchId])
  errors.mockRestore()
})

it('MAR-3023 R5: a broad refusal still resolves the door and logs both failures', async () => {
  await first()
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  const failures: import('./session.types').AcceptedRecordingFailureEvent[] = []
  service.onAcceptedRecordingFailure((event) => failures.push(event))
  // Refuse EVERY item insert: the turn publication and the recording-failure
  // note both fail — the note's failure must be logged, never thrown.
  getDatabase().exec(`CREATE TEMP TRIGGER refuse_every_insert
    BEFORE INSERT ON session_conversation_items
    BEGIN SELECT RAISE(ABORT, 'fixture record closed'); END`)

  const dispatchId = await send('account-b', 'accepted turn, closed record')

  expect(dispatchId).toBeTypeOf('string')
  expect(service.getById(id)?.status).not.toBe('failed')
  expect(failures.map((failure) => failure.dispatchId)).toEqual([dispatchId])
  expect(recordingFailedNotes()).toHaveLength(0)
  // Both failures are in the log: the lost write and the lost note.
  const logged = errors.mock.calls.map((call) => JSON.stringify(call))
  expect(
    logged.filter((entry) =>
      entry.includes('could not record the conversation item'),
    ),
  ).toHaveLength(1)
  expect(
    logged.filter((entry) => entry.includes('recording-failure note')),
  ).toHaveLength(1)
  errors.mockRestore()
})
