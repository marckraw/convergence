import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { ProviderRegistry } from '../provider/provider-registry'
import { FakeProvider } from '../provider/fake-provider'
import { SessionService } from './session.service'

describe('SessionService', () => {
  let service: SessionService
  let tempDir: string
  let projectId: string

  beforeEach(() => {
    vi.useFakeTimers()
    const db = getDatabase()
    const registry = new ProviderRegistry()
    registry.register(new FakeProvider())

    service = new SessionService(db, registry)

    tempDir = mkdtempSync(join(tmpdir(), 'convergence-session-test-'))
    const repoPath = join(tempDir, 'repo')
    mkdirSync(repoPath)
    mkdirSync(join(repoPath, '.git'))

    projectId = 'test-project'
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES (?, 'test', ?)",
    ).run(projectId, repoPath)
  })

  afterEach(() => {
    vi.useRealTimers()
    closeDatabase()
    resetDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('creates a session', () => {
    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'fake',
      name: 'test session',
    })

    expect(session.id).toBeDefined()
    expect(session.name).toBe('test session')
    expect(session.status).toBe('idle')
    expect(session.attention).toBe('none')
    expect(session.transcript).toEqual([])
  })

  it('lists sessions by project', () => {
    service.create({
      projectId,
      workspaceId: null,
      providerId: 'fake',
      name: 'session 1',
    })
    service.create({
      projectId,
      workspaceId: null,
      providerId: 'fake',
      name: 'session 2',
    })

    const sessions = service.getByProjectId(projectId)
    expect(sessions).toHaveLength(2)
  })

  it('starts a session and receives transcript entries', async () => {
    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'fake',
      name: 'streaming test',
    })

    service.start(session.id, 'Fix the bug')
    await vi.advanceTimersByTimeAsync(1200)

    const updated = service.getById(session.id)!
    expect(updated.status).toBe('running')
    expect(updated.transcript.length).toBeGreaterThanOrEqual(2)
    expect(updated.transcript[0]).toMatchObject({
      type: 'user',
      text: 'Fix the bug',
    })
  })

  it('transitions through approval flow', async () => {
    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'fake',
      name: 'approval test',
    })

    service.start(session.id, 'Do something')
    await vi.advanceTimersByTimeAsync(2000)

    let updated = service.getById(session.id)!
    expect(updated.attention).toBe('needs-approval')

    service.approve(session.id)
    await vi.advanceTimersByTimeAsync(2000)

    updated = service.getById(session.id)!
    expect(updated.status).toBe('completed')
    expect(updated.attention).toBe('finished')
  })

  it('stops a running session', async () => {
    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'fake',
      name: 'stop test',
    })

    service.start(session.id, 'Do something')
    await vi.advanceTimersByTimeAsync(500)

    service.stop(session.id)

    const updated = service.getById(session.id)!
    expect(updated.status).toBe('failed')
    expect(updated.attention).toBe('failed')
  })

  it('deletes a session', () => {
    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'fake',
      name: 'delete test',
    })

    service.delete(session.id)
    expect(service.getById(session.id)).toBeNull()
  })

  it('persists transcript to database', async () => {
    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'fake',
      name: 'persist test',
    })

    service.start(session.id, 'Hello')
    await vi.advanceTimersByTimeAsync(2000)
    service.approve(session.id)
    await vi.advanceTimersByTimeAsync(2000)

    const loaded = service.getById(session.id)!
    expect(loaded.transcript.length).toBeGreaterThan(3)
    expect(loaded.transcript.some((e) => e.type === 'tool-use')).toBe(true)
    expect(loaded.transcript.some((e) => e.type === 'tool-result')).toBe(true)
  })

  it('notifies update listener on changes', async () => {
    const updates: string[] = []
    service.setUpdateListener((session) => updates.push(session.id))

    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'fake',
      name: 'notify test',
    })

    service.start(session.id, 'Go')
    await vi.advanceTimersByTimeAsync(2000)

    expect(updates.length).toBeGreaterThan(0)
    expect(updates.every((id) => id === session.id)).toBe(true)
  })
})
