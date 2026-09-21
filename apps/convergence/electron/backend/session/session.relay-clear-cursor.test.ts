import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { buildFallbackCursorDescriptor } from '../provider/provider-descriptor.pure'
import { ProviderRegistry } from '../provider/provider-registry'
import {
  createMockCursorAcp,
  MockCursorAcpChild,
  type MockCursorAcpServer,
} from '../provider/cursor/cursor-acp-server.fixture'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))

vi.mock('child_process', async (importOriginal) => ({
  ...((await importOriginal()) as object),
  spawn: spawnMock,
}))

import { CursorProvider } from '../provider/cursor/cursor-provider'
import { SessionService } from './session.service'

function waitFor(assertion: () => void, timeoutMs = 2500): Promise<void> {
  const startedAt = Date.now()
  return new Promise((resolve, reject) => {
    const attempt = () => {
      try {
        assertion()
        resolve()
      } catch (error) {
        if (Date.now() - startedAt >= timeoutMs) reject(error)
        else setTimeout(attempt, 10)
      }
    }
    attempt()
  })
}

function prompts(server: MockCursorAcpServer) {
  return server.requests.filter((r) => r.method === 'session/prompt')
}

function textOf(request: { params?: Record<string, unknown> }): string {
  const parts =
    (request.params?.prompt as Array<{ text?: string }> | undefined) ?? []
  return parts.map((part) => part.text ?? '').join('')
}

/**
 * The layer the bug was seen at (MAR-3245): a relay sends the opener as a turn
 * of its own and queues the payload behind it; the service drains that queue
 * on the target handle's `completed`. The real Cursor provider runs here — a
 * stub handle would only prove the stub.
 */
describe('A relay that clears a Cursor conversation before delivering (MAR-3245)', () => {
  let service: SessionService
  let directory: string
  let sessionId: string
  let server: MockCursorAcpServer

  beforeEach(() => {
    const db = getDatabase()
    directory = mkdtempSync(join(tmpdir(), 'cursor-relay-clear-'))
    mkdirSync(join(directory, '.git'))
    db.prepare(
      'INSERT INTO projects (id, name, repository_path) VALUES (?, ?, ?)',
    ).run('relay-project', 'Relay', directory)

    const child = new MockCursorAcpChild()
    server = createMockCursorAcp(child)
    spawnMock.mockImplementation(() => child)

    const cursor = new CursorProvider('cursor-agent')
    const registry = new ProviderRegistry()
    registry.register({
      id: 'cursor',
      name: 'Cursor',
      supportsContinuation: true,
      // The descriptor probe spawns its own process; the handle is what this
      // test is about.
      describe: async () => buildFallbackCursorDescriptor(),
      start: (config) => cursor.start(config),
    })
    service = new SessionService(db, new LocalExecutionHost(registry))
    sessionId = service.create({
      projectId: 'relay-project',
      workspaceId: null,
      providerId: 'cursor',
      name: 'relay target',
      model: null,
      effort: null,
    }).id
  })

  afterEach(async () => {
    await service.disposeAll()
    closeDatabase()
    resetDatabase()
    spawnMock.mockReset()
    rmSync(directory, { recursive: true, force: true })
  })

  it('delivers the payload queued behind /clear, on the new session, with nobody’s hand', async () => {
    await service.start(sessionId, { text: 'first turn' })
    await waitFor(() =>
      expect(service.getById(sessionId)?.status).toBe('completed'),
    )

    await service.sendMessageWithOpener(sessionId, {
      opener: '/clear',
      text: 'the dispatched message',
    })

    await waitFor(() =>
      expect(
        prompts(server).filter(
          (request) => textOf(request) === 'the dispatched message',
        ),
      ).toHaveLength(1),
    )
    const delivered = prompts(server).filter(
      (request) => textOf(request) === 'the dispatched message',
    )[0]
    expect(delivered?.params?.sessionId).toBe('cursor-session-2')
    expect(service.getQueuedInputs(sessionId)).toEqual([])
  })
})
