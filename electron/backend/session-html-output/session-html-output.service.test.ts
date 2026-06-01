import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type Database from 'better-sqlite3'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { SessionHtmlOutputService } from './session-html-output.service'

function seedSession(db: Database.Database, sessionId: string): void {
  db.prepare(
    "INSERT INTO projects (id, name, repository_path) VALUES ('p1', 'test', '/tmp/session-html-test')",
  ).run()
  db.prepare(
    `INSERT INTO sessions (id, project_id, provider_id, name, working_directory)
     VALUES (?, 'p1', 'test-provider', 'test', '/tmp/session-html-test')`,
  ).run(sessionId)
}

describe('SessionHtmlOutputService', () => {
  let rootDir: string
  let db: Database.Database
  let service: SessionHtmlOutputService
  const sessionId = 'session-1'

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'convergence-session-html-'))
    db = getDatabase()
    seedSession(db, sessionId)
    service = new SessionHtmlOutputService(db, rootDir)
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
    rmSync(rootDir, { recursive: true, force: true })
  })

  it('stores living HTML under the session html output root', async () => {
    const output = await service.saveHtml({
      sessionId,
      kind: 'living',
      html: '<!doctype html><h1>Hello</h1>',
    })

    expect(output).toMatchObject({
      sessionId,
      kind: 'living',
      status: 'ready',
      relativePath: 'index.html',
      error: null,
    })
    expect(output.sizeBytes).toBeGreaterThan(0)
    expect(existsSync(join(rootDir, sessionId, 'html', 'index.html'))).toBe(
      true,
    )
    expect(await service.readHtml(output.id)).toContain('<h1>Hello</h1>')
  })

  it('updates the existing living output instead of creating duplicates', async () => {
    const first = await service.saveHtml({
      sessionId,
      kind: 'living',
      html: '<!doctype html><p>First</p>',
    })
    const second = await service.saveHtml({
      sessionId,
      kind: 'living',
      html: '<!doctype html><p>Second</p>',
    })

    expect(second.id).toBe(first.id)
    expect(service.listForSession(sessionId)).toHaveLength(1)
    expect(
      readFileSync(join(rootDir, sessionId, 'html', 'index.html'), 'utf8'),
    ).toContain('Second')
  })

  it('stores snapshot HTML at a validated relative path', async () => {
    const output = await service.saveHtml({
      sessionId,
      kind: 'snapshot',
      relativePath: 'snapshots/turn-1.html',
      html: '<!doctype html><p>Snapshot</p>',
    })

    expect(output.relativePath).toBe('snapshots/turn-1.html')
    expect(
      existsSync(join(rootDir, sessionId, 'html', 'snapshots', 'turn-1.html')),
    ).toBe(true)
  })

  it('rejects paths that escape the session html root', async () => {
    await expect(
      service.saveHtml({
        sessionId,
        kind: 'snapshot',
        relativePath: '../escape.html',
        html: '<!doctype html>',
      }),
    ).rejects.toThrow(/stay within the session/)

    await expect(
      service.saveHtml({
        sessionId,
        kind: 'snapshot',
        relativePath: '/tmp/escape.html',
        html: '<!doctype html>',
      }),
    ).rejects.toThrow(/must not be absolute/)
  })

  it('records failed outputs without a readable file', async () => {
    const failure = service.recordFailure({
      sessionId,
      kind: 'living',
      error: 'Provider does not support oneShot',
    })

    expect(failure).toMatchObject({
      sessionId,
      kind: 'living',
      status: 'failed',
      relativePath: null,
      sizeBytes: 0,
      error: 'Provider does not support oneShot',
    })
    await expect(service.readHtml(failure.id)).rejects.toThrow(/not ready/)
  })

  it('deletes rows and files for a session', async () => {
    await service.saveHtml({
      sessionId,
      kind: 'living',
      html: '<!doctype html><p>Remove me</p>',
    })

    await service.deleteForSession(sessionId)

    expect(service.listForSession(sessionId)).toEqual([])
    expect(existsSync(join(rootDir, sessionId, 'html'))).toBe(false)
  })

  it('sweeps orphaned session output directories', async () => {
    await service.saveHtml({
      sessionId,
      kind: 'living',
      html: '<!doctype html><p>Orphan</p>',
    })

    const removed = await service.sweepOrphans([])

    expect(removed).toBe(1)
    expect(service.listForSession(sessionId)).toEqual([])
    expect(existsSync(join(rootDir, sessionId))).toBe(false)
  })
})
