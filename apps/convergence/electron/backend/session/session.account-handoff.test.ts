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
let accept: (() => void) | undefined
let completeTurns: boolean
let failInterrupt: boolean
let loseAck: boolean
let unreadableTurns: boolean
let rejectAck: (() => void) | undefined
let settled: Array<{ dispatchIds: string[] }>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'account-handoff-'))
  const db = getDatabase()
  hosts = []
  missing = null
  layoutReady = true
  holdAcceptance = false
  accept = undefined
  settled = []
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
      (accountId) =>
        accountId
          ? {
              configDir: join(dir, accountId),
              executionHostId: 'local',
              label: accountId,
            }
          : null,
      {
        inspect: async () => ({
          ready: layoutReady,
          warnings: layoutReady ? [] : ['History layout needs reconnect.'],
        }),
      },
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
  await expect(send()).rejects.toThrow(/History layout/)
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
