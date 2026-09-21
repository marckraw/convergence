/**
 * A person's message sent mid-drill waits for the WHOLE routine (MAR-3288 R3).
 *
 * The real `SessionService` behind the real `ContextDrillService`, over a
 * fake Codex server: the claim is about the order the PROVIDER heard things
 * in, so the gateway is not substituted -- only the crew question is.
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
import { SessionService } from '../session/session.service'
import { TurnCaptureService } from '../session/turn/turn-capture.service'
import { DRILL_AFTER_MESSAGE, DRILL_BEFORE_MESSAGE } from './context-drill.pure'
import { ContextDrillService } from './context-drill.service'

let service: SessionService
let drill: ContextDrillService
let sessionId: string
let server: FakeCodexServer
let completeSeal: (() => void) | undefined
let cleanup: (() => Promise<void>) | undefined

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'drill-person-queue-'))
  const db = getDatabase()
  completeSeal = undefined
  server = new FakeCodexServer({
    onRequest: (message, connection) => {
      if (message.method !== 'turn/start') return undefined
      if (!JSON.stringify(message.params?.input).includes(DRILL_BEFORE_MESSAGE))
        return undefined
      // The seal turn is held OPEN, so the person can send during `sealing`,
      // and answers with a seal only when the test says so.
      const threadId = String(message.params?.threadId)
      connection.respond(message.id!, {
        turn: { id: 'seal-turn', status: 'inProgress' },
      })
      connection.notify('turn/started', { threadId, turn: { id: 'seal-turn' } })
      completeSeal = () => {
        server.loadedThreads.set(threadId, { type: 'idle' })
        connection.notify('item/agentMessage/delta', {
          threadId,
          delta: 'Sealed.\nSEALED: #1 abc1234',
        })
        connection.notify('turn/completed', {
          threadId,
          turn: { id: 'seal-turn', status: 'completed' },
        })
      }
      return FAKE_CODEX_NO_RESPONSE
    },
  })
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
    name: 'mastermind',
    model: 'gpt-5.4',
    effort: null,
  }).id
  drill = new ContextDrillService({
    sessions: {
      isMastermindSeat: () => true,
      describeCompactionReadiness: (id) =>
        service.describeCompactionReadiness(id),
      onSessionSettled: (listener) => service.onSessionSettled(listener),
      holdQueue: (id) => service.holdQueue(id),
      releaseQueue: (id) => service.releaseQueue(id),
      sendDrillBeat: (id, text) => service.sendDrillBeat(id, text),
      getLastAssistantMessageText: (id) =>
        service.getLastAssistantMessageText(id),
      compactContext: (id) => service.compactContext(id),
      addContextDrillNote: (id, text) => service.addContextDrillNote(id, text),
    },
  })
  cleanup = async () => {
    completeSeal?.()
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

/** Which of the known texts each turn the provider ran carried, in order. */
function turnsHeard(): string[] {
  const known = [
    'opening words',
    DRILL_BEFORE_MESSAGE,
    DRILL_AFTER_MESSAGE,
    'test two',
  ]
  return server.requests
    .filter((request) => request.method === 'turn/start')
    .map((request) => JSON.stringify(request.params?.input ?? null))
    .map((input) => known.find((text) => input.includes(text)) ?? input)
}

it('queues a person’s message sent while sealing LAST, and the drill still completes (R3)', async () => {
  await service.start(sessionId, { text: 'opening words' })
  await vi.waitFor(() =>
    expect(service.getById(sessionId)?.status).toBe('completed'),
  )

  const run = drill.run(sessionId)
  await vi.waitFor(() => expect(completeSeal).toBeTypeOf('function'))
  expect(drill.describe(sessionId).beat).toBe('sealing')

  const receipt = await service.sendPersonMessage(sessionId, {
    text: 'test two',
  })
  expect(receipt.queued).toBe(true)
  expect(service.getQueuedInputs(sessionId).map((row) => row.state)).toEqual([
    'queued',
  ])

  completeSeal!()
  expect(await run).toEqual({ ok: true })

  await vi.waitFor(() => expect(turnsHeard()).toHaveLength(4))
  await vi.waitFor(() =>
    expect(service.getById(sessionId)?.status).toBe('completed'),
  )
  expect(turnsHeard()).toEqual([
    'opening words',
    DRILL_BEFORE_MESSAGE,
    DRILL_AFTER_MESSAGE,
    'test two',
  ])
  expect(service.getQueuedInputs(sessionId)).toEqual([])
})
