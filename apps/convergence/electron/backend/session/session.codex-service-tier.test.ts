import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { CodexProvider } from '../provider/codex/codex-provider'
import { CodexServerHostRegistry } from '../provider/codex/codex-server-host'
import {
  FakeCodexChildProcess,
  FakeCodexServer,
} from '../provider/codex/codex-server-host.fixture'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { ProviderRegistry } from '../provider/provider-registry'
import {
  CODEX_HOME_RESTORED_TEST,
  isolateAmbientCodexHome,
  isolatedCodexHomeTestsFinished,
} from './isolate-ambient-codex-home'
import { MODEL_CHANGED_EVENT_TYPE } from './session-model-change.pure'
import { SessionService } from './session.service'

const runnerCodexHome = process.env.CODEX_HOME
isolateAmbientCodexHome()

let service: SessionService
let server: FakeCodexServer
let cleanup: (() => Promise<void>) | undefined

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-service-tier-'))
  const db = getDatabase()
  server = new FakeCodexServer()
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
  hosts.setBinary('/fixture/codex', '0.159.2')
  const providers = new ProviderRegistry()
  providers.register(new CodexProvider(hosts, null))
  service = new SessionService(db, new LocalExecutionHost(providers), dir)
  db.prepare(
    "INSERT INTO projects(id,name,repository_path) VALUES ('p','fixture',?)",
  ).run(dir)
  cleanup = async () => {
    await service.disposeAll()
    await hosts.stopAll()
    rmSync(dir, { recursive: true, force: true })
  }
})

afterEach(async () => {
  await cleanup?.()
  closeDatabase()
  resetDatabase()
})

function createCodexSession(serviceTier: string | null): string {
  return service.create({
    projectId: 'p',
    workspaceId: null,
    providerId: 'codex',
    name: 'speed',
    model: 'gpt-6.1-sol',
    effort: 'low',
    serviceTier,
  }).id
}

/** The tier on the last request of `method` the fake server received. */
function lastTier(method: 'turn/start' | 'thread/start' | 'thread/resume') {
  const request = server.requests.filter((r) => r.method === method).at(-1)
  expect(request, `no ${method} request was sent`).toBeDefined()
  return request?.params?.serviceTier
}

async function runTurn(id: string, text: string, first = false) {
  const turnsBefore = server.requests.filter(
    (r) => r.method === 'turn/start',
  ).length
  if (first) await service.start(id, { text })
  else await service.sendMessage(id, { text })
  await vi.waitFor(() => {
    expect(
      server.requests.filter((r) => r.method === 'turn/start').length,
    ).toBe(turnsBefore + 1)
    expect(service.getById(id)?.status).toBe('completed')
  })
}

function storedTier(id: string): string | null {
  const row = getDatabase()
    .prepare('SELECT service_tier FROM sessions WHERE id = ?')
    .get(id) as { service_tier: string | null }
  return row.service_tier
}

it('R1: a tier change on an open conversation is stored, and the next turn starts with it', async () => {
  const id = createCodexSession('default')
  await runTurn(id, 'first', true)
  expect(lastTier('turn/start')).toBe('default')

  const updated = service.setServiceTier(id, { serviceTier: 'fast' })
  expect(updated.serviceTier).toBe('fast')
  expect(storedTier(id)).toBe('fast')

  await runTurn(id, 'second')
  expect(lastTier('turn/start')).toBe('fast')

  service.setServiceTier(id, { serviceTier: 'default' })
  await runTurn(id, 'third')
  expect(lastTier('turn/start')).toBe('default')
})

it('R3: a tier-only change is not a model change', async () => {
  const id = createCodexSession('default')
  await runTurn(id, 'first', true)
  const before = service.getConversation(id).length

  service.setServiceTier(id, { serviceTier: 'fast' })

  const conversation = service.getConversation(id)
  expect(conversation).toHaveLength(before)
  expect(
    conversation.some(
      (item) =>
        item.providerMeta?.providerEventType === MODEL_CHANGED_EVENT_TYPE,
    ),
  ).toBe(false)
  expect(service.getById(id)).toMatchObject({
    model: 'gpt-6.1-sol',
    effort: 'low',
  })
})

it('R4: the tier cannot be changed where it cannot reach', () => {
  const remote = createCodexSession('default')
  getDatabase()
    .prepare('UPDATE sessions SET execution_host = ? WHERE id = ?')
    .run('9281802b-e7d8-43ac-b6a3-f0062a7d809d', remote)
  expect(() => service.setServiceTier(remote, { serviceTier: 'fast' })).toThrow(
    "A remote conversation's speed can't be changed from this app.",
  )
  expect(storedTier(remote)).toBe('default')

  const claude = service.create({
    projectId: 'p',
    workspaceId: null,
    providerId: 'claude-code',
    name: 'not codex',
    model: 'sonnet',
    effort: null,
  }).id
  expect(() => service.setServiceTier(claude, { serviceTier: 'fast' })).toThrow(
    'Only Codex conversations have a speed setting.',
  )
  expect(storedTier(claude)).toBeNull()

  const local = createCodexSession('default')
  expect(() => service.setServiceTier(local, { serviceTier: 'Fast!' })).toThrow(
    /Unknown speed tier/,
  )
  expect(storedTier(local)).toBe('default')
})

it('R5: a local Codex conversation that never stored a tier runs Standard, stated explicitly', async () => {
  const id = createCodexSession(null)
  expect(storedTier(id)).toBeNull()
  await runTurn(id, 'first', true)
  expect(lastTier('thread/start')).toBe('default')
  expect(lastTier('turn/start')).toBe('default')
})

it('R5: compaction states the tier too, so no local Codex start inherits the account default', async () => {
  const id = createCodexSession(null)
  await runTurn(id, 'first', true)
  const resumesBefore = server.requests.filter(
    (r) => r.method === 'thread/resume',
  ).length
  await service.compactContext(id)
  expect(
    server.requests.filter((r) => r.method === 'thread/resume').length,
  ).toBeGreaterThan(resumesBefore)
  expect(lastTier('thread/resume')).toBe('default')
})

it(CODEX_HOME_RESTORED_TEST, () => {
  expect(isolatedCodexHomeTestsFinished()).toBeGreaterThan(0)
  expect(process.env.CODEX_HOME).toBe(runnerCodexHome)
})
