import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, expect, it, vi } from 'vitest'
import {
  getDatabase,
  closeDatabase,
  resetDatabase,
} from '../../database/database'
import { SessionService } from '../../session/session.service'
import { SessionQueuedInputService } from '../../session/session-queued-input.service'
import { mapCodexSkillCatalog } from '../../skills/codex-skills.mapper.pure'
import { selectionFromCatalogEntry } from '../../skills/skill-invocation.pure'
import { LocalExecutionHost } from '../execution-host/local-execution-host'
import { ProviderRegistry } from '../provider-registry'
import { CodexProvider } from './codex-provider'
import { CodexServerHostRegistry } from './codex-server-host'
import {
  FAKE_CODEX_NO_RESPONSE,
  FakeCodexChildProcess,
  FakeCodexServer,
  type FakeCodexConnection,
  type FakeCodexServerOptions,
} from './codex-server-host.fixture'

const BUSY = 'This Codex account is running a turn. Try again when it finishes.'
const cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
  vi.restoreAllMocks()
  closeDatabase()
  resetDatabase()
})

async function bed(options: FakeCodexServerOptions = {}, useService = false) {
  const dir = mkdtempSync(join(tmpdir(), 'mar-3184-'))
  const db = getDatabase()
  const server = new FakeCodexServer({ autoCompleteTurns: false, ...options })
  const children: FakeCodexChildProcess[] = []
  const hosts = new CodexServerHostRegistry({
    cwd: dir,
    spawnProcess: () => {
      const child = new FakeCodexChildProcess()
      children.push(child)
      setTimeout(() => child.announceListening('ws://127.0.0.1:5150'), 0)
      return child.asChildProcess()
    },
    connectTransport: async () => server.connect(),
    probeReady: async () => true,
    listProcesses: () => [],
  })
  hosts.setBinary('/fixture/codex', '0.154.0')
  const host = hosts.get({ account: null })
  const providers = new ProviderRegistry()
  const provider = new CodexProvider(hosts)
  providers.register(provider)
  const service = new SessionService(db, new LocalExecutionHost(providers), dir)
  cleanup.push(async () => {
    await service.disposeAll()
    await hosts.stopAll()
    rmSync(dir, { recursive: true, force: true })
  })
  db.prepare(
    "INSERT INTO projects(id,name,repository_path) VALUES ('p','fixture',?)",
  ).run(dir)
  const session = service.create({
    projectId: 'p',
    workspaceId: null,
    providerId: 'codex',
    name: 'maintenance',
    model: 'gpt-6',
    effort: 'high',
  })
  let status = 'running'
  const collected: string[] = []
  const handle = useService
    ? null
    : provider.start({
        sessionId: session.id,
        workingDirectory: dir,
        initialMessage: 'first',
        model: 'gpt-6',
        effort: 'high',
        continuationToken: null,
      })
  handle?.onStatusChange((value) => {
    status = value
  })
  handle?.onDelta((delta) => {
    if (delta.kind === 'conversation.item.add' && delta.item.kind === 'note')
      collected.push(delta.item.text)
  })
  cleanup.push(async () => {
    await handle?.dispose?.()
  })
  if (useService) await service.start(session.id, { text: 'first' })
  const turns = () => server.requests.filter((r) => r.method === 'turn/start')
  await vi.waitFor(() => expect(turns()).toHaveLength(1))
  const threadId = String(turns()[0].params?.threadId)
  const finish = async () => {
    server.loadedThreads.set(threadId, { type: 'idle' })
    turns()
      .at(-1)!
      .connection.notify('turn/completed', {
        turn: { id: 'turn-1', status: 'completed' },
      })
    await vi.waitFor(() =>
      expect(useService ? service.getById(session.id)?.status : status).toBe(
        'completed',
      ),
    )
  }
  const notes = () =>
    useService
      ? service
          .getConversation(session.id)
          .flatMap((item) => (item.kind === 'note' ? [item.text] : []))
      : collected
  const send = (text: string) =>
    handle
      ? handle.sendMessage(text)
      : service.sendMessage(session.id, { text })
  return {
    db,
    host,
    hosts,
    service,
    session,
    server,
    children,
    turns,
    threadId,
    finish,
    notes,
    send,
  }
}

it('R1/R3: evicts a completed conversation and resumes the same thread quietly', async () => {
  const b = await bed()
  await b.finish()
  const original = b.turns()[0].connection
  const work = vi.fn(async () => 'authorized')
  await expect(b.host.withStoppedServer(work)).resolves.toBe('authorized')
  expect(original.closed).toBe(true)
  expect(work).toHaveBeenCalledOnce()
  await b.send('after maintenance')
  await vi.waitFor(() => expect(b.turns()).toHaveLength(2))
  expect(b.turns()[1].params).toMatchObject({
    threadId: b.threadId,
    input: [{ type: 'text', text: 'after maintenance' }],
  })
  expect(
    b.server.requests.find((r) => r.method === 'thread/resume')?.params
      ?.threadId,
  ).toBe(b.threadId)
  // Includes the obituary grace, so a delayed lost-connection note fails too.
  await new Promise((resolve) => setTimeout(resolve, 150))
  expect(b.notes().some((note) => note.includes('Lost the connection'))).toBe(
    false,
  )
})

it('R2: refuses a running turn word for word and closes nothing', async () => {
  const b = await bed()
  const work = vi.fn(async () => {})
  await expect(b.host.withStoppedServer(work)).rejects.toThrow(BUSY)
  expect(work).not.toHaveBeenCalled()
  expect(b.turns()[0].connection.closed).toBe(false)
})

it('R1: refuses a busy server even when the conversation owner is idle', async () => {
  const b = await bed()
  await b.finish()
  b.server.loadedThreads.set('another-thread', { type: 'active' })
  await expect(b.host.withStoppedServer(async () => {})).rejects.toThrow(BUSY)
  expect(b.turns()[0].connection.closed).toBe(false)
})

it('R2: a pending approval protects a locally completed conversation', async () => {
  const b = await bed()
  await b.finish()
  b.turns()[0].connection.push({
    jsonrpc: '2.0',
    id: 700,
    method: 'item/commandExecution/requestApproval',
    params: {
      threadId: b.threadId,
      itemId: 'command-1',
      command: 'echo fixture',
    },
  })
  await expect(b.host.withStoppedServer(async () => {})).rejects.toThrow(BUSY)
  expect(b.turns()[0].connection.closed).toBe(false)
})

it('R5: MAR-3184-eviction-probe refuses while skills/list holds a claimed queued payload', async () => {
  const skillPayload = {
    skills: [
      {
        name: 'review',
        path: '/fixture/review/SKILL.md',
        scope: 'repo',
        enabled: true,
      },
    ],
  }
  let pending:
    | { id: string | number; connection: FakeCodexConnection }
    | undefined
  const b = await bed(
    {
      onRequest(message, connection) {
        if (message.method === 'skills/list') {
          pending = { id: message.id!, connection }
          return FAKE_CODEX_NO_RESPONSE
        }
      },
    },
    true,
  )
  const queue = new SessionQueuedInputService(b.db)
  const queued = queue.enqueue(
    b.session.id,
    {
      text: 'queued payload',
      providerAccountId: null,
      skillSelections: [
        selectionFromCatalogEntry(
          mapCodexSkillCatalog(skillPayload).skills[0],
          'selected',
        ),
      ],
    },
    'follow-up',
  )
  await b.finish()
  await vi.waitFor(() => expect(pending).toBeDefined())
  expect(
    b.db
      .prepare(
        'SELECT text, state, error FROM session_queued_inputs WHERE id = ?',
      )
      .all(queued.id),
  ).toEqual([{ text: 'queued payload', state: 'sent', error: null }])
  expect(b.server.loadedThreads.get(b.threadId)).toEqual({ type: 'idle' })
  const work = vi.fn(async () => {})
  await expect(b.host.withStoppedServer(work)).rejects.toThrow(BUSY)
  expect(work).not.toHaveBeenCalled()
  expect(pending!.connection.closed).toBe(false)
  pending!.connection.respond(pending!.id, skillPayload)
  await vi.waitFor(() => expect(b.turns()).toHaveLength(2))
  expect(b.turns()[1].params?.input).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'text',
        text: '$review\n\nqueued payload',
      }),
    ]),
  )
})

it('R6: a message during maintenance waits, then resumes quietly and delivers', async () => {
  const b = await bed()
  await b.finish()
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const entered = vi.fn()
  const maintenance = b.host.withStoppedServer(async () => {
    entered()
    await held
  })
  try {
    await vi.waitFor(() => expect(entered).toHaveBeenCalledOnce())
    const connectionCount = b.server.connections.length
    await b.send('during maintenance')
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(b.server.connections).toHaveLength(connectionCount)
    expect(b.turns()).toHaveLength(1)
  } finally {
    release()
    await maintenance
  }
  await vi.waitFor(() => expect(b.turns()).toHaveLength(2))
  expect(b.turns()[1].params).toMatchObject({
    threadId: b.threadId,
    input: [{ type: 'text', text: 'during maintenance' }],
  })
  await new Promise((resolve) => setTimeout(resolve, 150))
  expect(b.notes().some((note) => note.includes('Lost the connection'))).toBe(
    false,
  )
})

it('R1/R5: rechecks an owner that accepts a send while the idle witness is held', async () => {
  let witness:
    | { id: string | number; connection: FakeCodexConnection }
    | undefined
  const b = await bed({
    onRequest(message, connection) {
      if (message.method === 'thread/loaded/list') {
        witness = { id: message.id!, connection }
        return FAKE_CODEX_NO_RESPONSE
      }
    },
  })
  await b.finish()
  const work = vi.fn(async () => {})
  const maintenance = b.host.withStoppedServer(work)
  const refused = expect(maintenance).rejects.toThrow(BUSY)
  await vi.waitFor(() => expect(witness).toBeDefined())
  // Acceptance is synchronous even though the preparation yields immediately.
  await b.send('accepted during witness')
  witness!.connection.respond(witness!.id, { data: [], nextCursor: null })
  await refused
  expect(work).not.toHaveBeenCalled()
  expect(b.turns()[0].connection.closed).toBe(false)
  await vi.waitFor(() => expect(b.turns()).toHaveLength(2))
})
