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
import { TurnCaptureService } from './turn/turn-capture.service'

let service: SessionService
let sessionId: string
let homes: Array<string | undefined>
let holdCompaction: boolean
let releaseCompaction: ((fail?: boolean) => void) | undefined
let cleanup: (() => Promise<void>) | undefined

beforeEach(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'compaction-account-'))
  const db = getDatabase()
  homes = []
  holdCompaction = false
  releaseCompaction = undefined
  const server = new FakeCodexServer({
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
    new CodexProvider(hosts, null, undefined, (id) =>
      id === 'account-b' ? { configDir: join(dir, 'account-b') } : null,
    ),
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
  await service.start(sessionId, {
    text: 'first',
    providerAccountId: 'account-b',
  })
  await vi.waitFor(() =>
    expect(service.getById(sessionId)?.status).toBe('completed'),
  )
  expect(service.getLastTurnProviderAccountId(sessionId)).toBe('account-b')
})

afterEach(async () => {
  await cleanup?.()
  closeDatabase()
  resetDatabase()
})

it('compacts through the server that served the last turn', async () => {
  const originalHome = homes[0]
  expect(originalHome).toMatch(/account-b$/)
  await service.compactContext(sessionId)
  expect(homes).toEqual([originalHome])
})

it.each([false, true])(
  'blocks a send and duplicate compaction until compaction settles (failure=%s)',
  async (fail) => {
    holdCompaction = true
    const compact = service.compactContext(sessionId)
    const result = compact.then(
      () => 'completed',
      () => 'failed',
    )
    await vi.waitFor(() => expect(releaseCompaction).toBeTypeOf('function'))
    const before = service.getConversation(sessionId)
    await expect(
      service.sendMessage(sessionId, {
        text: 'too early',
        providerAccountId: 'account-b',
      }),
    ).rejects.toThrow(/compacting/)
    await expect(service.compactContext(sessionId)).rejects.toThrow(
      /compacting/,
    )
    await expect(
      service.sendMessageWithOpener(sessionId, {
        text: 'payload',
        opener: '/clear',
        providerAccountId: 'account-b',
      }),
    ).rejects.toThrow(/compacting/)
    expect(service.getQueuedInputs(sessionId)).toEqual([])
    expect(service.getConversation(sessionId)).toEqual(before)
    releaseCompaction!(fail)
    expect(await result).toBe(fail ? 'failed' : 'completed')
    expect(service.getById(sessionId)?.activity).toBeNull()
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
