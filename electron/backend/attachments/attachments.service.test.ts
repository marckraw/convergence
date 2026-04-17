import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { AttachmentsService } from './attachments.service'
import type Database from 'better-sqlite3'

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
])

const PDF_BYTES = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a,
])

function textBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

function seedSession(db: Database.Database, sessionId: string): void {
  db.prepare(
    "INSERT INTO projects (id, name, repository_path) VALUES ('p1', 'test', '/tmp/session-test')",
  ).run()
  db.prepare(
    `INSERT INTO sessions (id, project_id, provider_id, name, working_directory)
     VALUES (?, 'p1', 'test-provider', 'test', '/tmp/session-test')`,
  ).run(sessionId)
}

describe('AttachmentsService', () => {
  let rootDir: string
  let db: Database.Database
  let service: AttachmentsService
  const sessionId = 'session-1'

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'convergence-attachments-'))
    db = getDatabase()
    seedSession(db, sessionId)
    service = new AttachmentsService(db, rootDir)
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
    rmSync(rootDir, { recursive: true, force: true })
  })

  it('ingests a PNG and writes bytes to disk', async () => {
    const { attachments, rejections } = await service.ingestFiles(sessionId, [
      { name: 'photo.png', bytes: PNG_BYTES },
    ])

    expect(rejections).toEqual([])
    expect(attachments).toHaveLength(1)
    const [att] = attachments
    expect(att.kind).toBe('image')
    expect(att.mimeType).toBe('image/png')
    expect(att.sessionId).toBe(sessionId)
    expect(att.filename).toBe('photo.png')
    expect(att.sizeBytes).toBe(PNG_BYTES.length)
    expect(existsSync(att.storagePath)).toBe(true)
    expect(readFileSync(att.storagePath)).toEqual(Buffer.from(PNG_BYTES))
  })

  it('ingests a PDF', async () => {
    const { attachments } = await service.ingestFiles(sessionId, [
      { name: 'doc.pdf', bytes: PDF_BYTES },
    ])
    expect(attachments[0].kind).toBe('pdf')
    expect(attachments[0].mimeType).toBe('application/pdf')
  })

  it('ingests a text file and stores a preview', async () => {
    const body = textBytes('export const x = 1\n')
    const { attachments } = await service.ingestFiles(sessionId, [
      { name: 'foo.ts', bytes: body },
    ])
    expect(attachments[0].kind).toBe('text')
    expect(attachments[0].mimeType).toBe('text/x-typescript')
    expect(attachments[0].textPreview).toBe('export const x = 1\n')
  })

  it('rejects oversize image', async () => {
    const oversize = new Uint8Array(11 * 1024 * 1024)
    oversize.set(PNG_BYTES, 0)
    const { attachments, rejections } = await service.ingestFiles(sessionId, [
      { name: 'big.png', bytes: oversize },
    ])
    expect(attachments).toEqual([])
    expect(rejections).toHaveLength(1)
    expect(rejections[0].reason).toMatch(/Image too large/)
  })

  it('rejects empty files', async () => {
    const { rejections } = await service.ingestFiles(sessionId, [
      { name: 'empty.txt', bytes: new Uint8Array(0) },
    ])
    expect(rejections[0].reason).toMatch(/Empty/)
  })

  it('rejects unrecognized binary', async () => {
    const garbage = new Uint8Array([0xff, 0xfe, 0xfd, 0x80, 0x81])
    const { rejections } = await service.ingestFiles(sessionId, [
      { name: 'mystery.bin', bytes: garbage },
    ])
    expect(rejections[0].reason).toMatch(/Unsupported/)
  })

  it('sanitizes filenames (path traversal, whitespace)', async () => {
    const { attachments } = await service.ingestFiles(sessionId, [
      { name: '../../etc/sec ret.txt', bytes: textBytes('hello') },
    ])
    expect(attachments[0].filename).not.toContain('/')
    expect(attachments[0].filename).not.toContain('..')
    expect(attachments[0].filename).not.toContain(' ')
  })

  it('enforces 50 MB per-message total', async () => {
    const big = new Uint8Array(9 * 1024 * 1024)
    big.set(PNG_BYTES, 0)
    const files = Array.from({ length: 6 }, (_, i) => ({
      name: `img${i}.png`,
      bytes: big,
    }))
    const { attachments, rejections } = await service.ingestFiles(
      sessionId,
      files,
    )
    expect(attachments.length).toBeLessThan(files.length)
    expect(rejections.some((r) => /50 MB/.test(r.reason))).toBe(true)
  })

  it('persists and reads back by id and by session', async () => {
    const { attachments } = await service.ingestFiles(sessionId, [
      { name: 'a.png', bytes: PNG_BYTES },
      { name: 'b.txt', bytes: textBytes('ok') },
    ])
    const fetched = service.getById(attachments[0].id)
    expect(fetched?.filename).toBe('a.png')
    const forSession = service.getForSession(sessionId)
    expect(forSession).toHaveLength(2)
  })

  it('readBytes returns the stored bytes', async () => {
    const { attachments } = await service.ingestFiles(sessionId, [
      { name: 'a.png', bytes: PNG_BYTES },
    ])
    const got = await service.readBytes(attachments[0].id)
    expect(got).toEqual(PNG_BYTES)
  })

  it('delete removes row and file', async () => {
    const { attachments } = await service.ingestFiles(sessionId, [
      { name: 'a.png', bytes: PNG_BYTES },
    ])
    const att = attachments[0]
    await service.delete(att.id)
    expect(service.getById(att.id)).toBeNull()
    expect(existsSync(att.storagePath)).toBe(false)
  })

  it('deleteForSession removes all rows and the directory', async () => {
    await service.ingestFiles(sessionId, [
      { name: 'a.png', bytes: PNG_BYTES },
      { name: 'b.txt', bytes: textBytes('ok') },
    ])
    await service.deleteForSession(sessionId)
    expect(service.getForSession(sessionId)).toEqual([])
    expect(existsSync(join(rootDir, sessionId))).toBe(false)
  })

  it('sweepOrphans removes directories for sessions no longer live', async () => {
    await service.ingestFiles(sessionId, [{ name: 'a.png', bytes: PNG_BYTES }])
    const removed = await service.sweepOrphans([])
    expect(removed).toBe(1)
    expect(existsSync(join(rootDir, sessionId))).toBe(false)
  })

  it('sweepOrphans keeps directories for live sessions', async () => {
    await service.ingestFiles(sessionId, [{ name: 'a.png', bytes: PNG_BYTES }])
    const removed = await service.sweepOrphans([sessionId])
    expect(removed).toBe(0)
    expect(existsSync(join(rootDir, sessionId))).toBe(true)
  })

  it('getMany preserves id order', async () => {
    const { attachments } = await service.ingestFiles(sessionId, [
      { name: 'a.png', bytes: PNG_BYTES },
      { name: 'b.txt', bytes: textBytes('ok') },
    ])
    const ordered = service.getMany([attachments[1].id, attachments[0].id])
    expect(ordered.map((a) => a.filename)).toEqual(['b.txt', 'a.png'])
  })
})
