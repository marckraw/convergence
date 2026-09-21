/**
 * The PERSON's send door (MAR-3288): a message sent into a compacting or
 * drill-held conversation waits in the queue instead of being refused.
 */
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
import {
  AttachmentsService,
  DRAFT_SESSION_ID,
} from '../attachments/attachments.service'
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
let attachments: AttachmentsService

beforeEach(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'person-door-'))
  const db = getDatabase()
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
  attachments = new AttachmentsService(db, join(dir, 'attachments'))
  service.setAttachmentsService(attachments)
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

/** Everything the Codex server was actually asked to run a turn on. */
function turnsSentToProvider(server: FakeCodexServer): string[] {
  return server.requests
    .filter((request) => request.method === 'turn/start')
    .map((request) => JSON.stringify(request.params?.input ?? null))
}

function queueRows() {
  return service.getQueuedInputs(sessionId).map((item) => ({
    text: item.text,
    attachmentIds: item.attachmentIds,
    providerAccountId: item.providerAccountId,
    relaysMuted: item.relaysMuted,
    skipContextInjection: item.skipContextInjection,
    deliveryMode: item.deliveryMode,
    state: item.state,
    dispatchId: item.dispatchId,
  }))
}

it('queues a person’s message sent during compaction and delivers it after, on its account (R1)', async () => {
  await startConversation()
  holdCompaction = true
  const compact = service.compactContext(sessionId)
  const settled = compact.then(
    () => 'completed',
    () => 'failed',
  )
  await vi.waitFor(() => expect(releaseCompaction).toBeTypeOf('function'))
  const ingested = await attachments.ingestFiles(DRAFT_SESSION_ID, [
    { name: 'note.txt', bytes: new TextEncoder().encode('hello') },
  ])
  const attachmentId = ingested.attachments[0].id
  const homesBefore = [...homes]
  const sentBefore = turnsSentToProvider(server).length

  const receipt = await service.sendPersonMessage(sessionId, {
    text: 'test one',
    attachmentIds: [attachmentId],
    providerAccountId: 'account-b',
  })

  expect(receipt.queued).toBe(true)
  expect(queueRows()).toEqual([
    {
      text: 'test one',
      attachmentIds: [attachmentId],
      providerAccountId: 'account-b',
      relaysMuted: false,
      skipContextInjection: false,
      deliveryMode: 'follow-up',
      state: 'queued',
      dispatchId: receipt.dispatchId,
    },
  ])
  expect(turnsSentToProvider(server).length).toBe(sentBefore)

  releaseCompaction!(false)
  expect(await settled).toBe('completed')

  await vi.waitFor(() =>
    expect(turnsSentToProvider(server).length).toBe(sentBefore + 1),
  )
  await vi.waitFor(() =>
    expect(service.getById(sessionId)?.status).toBe('completed'),
  )
  expect(service.getQueuedInputs(sessionId)).toEqual([])
  expect(turnsSentToProvider(server).slice(sentBefore)[0]).toContain('test one')
  // On ITS account: a row that lost the account would read as a handoff to
  // the ambient login and spawn a second server with no CODEX_HOME.
  expect(homes).toEqual(homesBefore)
  expect(service.getLastTurnProviderAccountId(sessionId)).toBe('account-b')
})

it('queues a person’s message under a drill’s hold with no compaction running, and releaseQueue delivers it (R2)', async () => {
  await startConversation()
  service.holdQueue(sessionId)
  const sentBefore = turnsSentToProvider(server).length

  const receipt = await service.sendPersonMessage(sessionId, {
    text: 'test two',
    providerAccountId: 'account-b',
  })

  expect(receipt.queued).toBe(true)
  expect(queueRows()).toEqual([
    {
      text: 'test two',
      attachmentIds: [],
      providerAccountId: 'account-b',
      relaysMuted: false,
      skipContextInjection: false,
      deliveryMode: 'follow-up',
      state: 'queued',
      dispatchId: receipt.dispatchId,
    },
  ])
  for (let tick = 0; tick < 20; tick += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  expect(turnsSentToProvider(server).length).toBe(sentBefore)

  service.releaseQueue(sessionId)

  await vi.waitFor(() =>
    expect(turnsSentToProvider(server).length).toBe(sentBefore + 1),
  )
  await vi.waitFor(() =>
    expect(service.getById(sessionId)?.status).toBe('completed'),
  )
  expect(service.getQueuedInputs(sessionId)).toEqual([])
  expect(turnsSentToProvider(server).slice(sentBefore)[0]).toContain('test two')
})

it('leaves every other refusal exactly as it was (R1)', async () => {
  await expect(
    service.sendPersonMessage('no-such-session', { text: 'hi' }),
  ).rejects.toThrow(/Session not found/)
  expect(service.getQueuedInputs('no-such-session')).toEqual([])
})
