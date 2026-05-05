import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { ReviewNotesService } from './review-notes.service'

describe('ReviewNotesService', () => {
  let service: ReviewNotesService

  beforeEach(() => {
    const db = getDatabase()
    service = new ReviewNotesService(db)
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('p1', 'p1', '/tmp/p1')",
    ).run()
    db.prepare(
      "INSERT INTO workspaces (id, project_id, branch_name, path) VALUES ('w1', 'p1', 'feature', '/tmp/p1')",
    ).run()
    db.prepare(
      "INSERT INTO sessions (id, project_id, workspace_id, provider_id, name, working_directory) VALUES ('s1', 'p1', 'w1', 'codex', 's1', '/tmp/p1')",
    ).run()
    db.prepare(
      "INSERT INTO sessions (id, project_id, workspace_id, provider_id, name, working_directory) VALUES ('s2', 'p1', 'w1', 'codex', 's2', '/tmp/p1')",
    ).run()
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  it('creates and lists notes scoped to a session', () => {
    const first = service.create({
      sessionId: 's1',
      workspaceId: 'w1',
      filePath: 'src/app.ts',
      mode: 'base-branch',
      oldStartLine: 1,
      oldEndLine: 2,
      newStartLine: 1,
      newEndLine: 3,
      hunkHeader: '@@ -1,2 +1,3 @@',
      selectedDiff: '-old\n+new',
      body: 'Why this change?',
    })
    const second = service.create({
      sessionId: 's1',
      filePath: 'src/other.ts',
      mode: 'working-tree',
      selectedDiff: '+line',
      body: 'Follow-up',
    })
    service.create({
      sessionId: 's2',
      filePath: 'src/app.ts',
      mode: 'working-tree',
      selectedDiff: '+other',
      body: 'Other session',
    })

    const notes = service.listBySession('s1')
    expect(notes.map((note) => note.id)).toEqual([first.id, second.id])
    expect(notes[0]).toMatchObject({
      workspaceId: 'w1',
      filePath: 'src/app.ts',
      mode: 'base-branch',
      oldStartLine: 1,
      oldEndLine: 2,
      newStartLine: 1,
      newEndLine: 3,
      hunkHeader: '@@ -1,2 +1,3 @@',
      selectedDiff: '-old\n+new',
      body: 'Why this change?',
      state: 'draft',
      sentAt: null,
    })
  })

  it('trims text fields and rejects empty body, path, and diff', () => {
    const note = service.create({
      sessionId: 's1',
      filePath: ' src/app.ts ',
      mode: 'working-tree',
      selectedDiff: ' +line ',
      body: ' question ',
    })

    expect(note.filePath).toBe('src/app.ts')
    expect(note.selectedDiff).toBe('+line')
    expect(note.body).toBe('question')

    expect(() =>
      service.create({
        sessionId: 's1',
        filePath: ' ',
        mode: 'working-tree',
        selectedDiff: '+line',
        body: 'question',
      }),
    ).toThrow(/file cannot be empty/i)
    expect(() =>
      service.create({
        sessionId: 's1',
        filePath: 'src/app.ts',
        mode: 'working-tree',
        selectedDiff: ' ',
        body: 'question',
      }),
    ).toThrow(/selection cannot be empty/i)
    expect(() =>
      service.create({
        sessionId: 's1',
        filePath: 'src/app.ts',
        mode: 'working-tree',
        selectedDiff: '+line',
        body: ' ',
      }),
    ).toThrow(/body cannot be empty/i)
  })

  it('updates body and state while preserving range metadata', () => {
    const note = service.create({
      sessionId: 's1',
      filePath: 'src/app.ts',
      mode: 'base-branch',
      oldStartLine: 4,
      selectedDiff: '-old',
      body: 'Before',
    })

    const updated = service.update(note.id, {
      body: 'After',
      state: 'resolved',
    })

    expect(updated.body).toBe('After')
    expect(updated.state).toBe('resolved')
    expect(updated.oldStartLine).toBe(4)
    expect(updated.selectedDiff).toBe('-old')
  })

  it('sets sentAt the first time a note is marked sent', () => {
    const note = service.create({
      sessionId: 's1',
      filePath: 'src/app.ts',
      mode: 'working-tree',
      selectedDiff: '+line',
      body: 'Send this',
    })

    const sent = service.update(note.id, { state: 'sent' })

    expect(sent.state).toBe('sent')
    expect(sent.sentAt).not.toBeNull()
  })

  it('throws when related records or update targets are missing', () => {
    expect(() =>
      service.create({
        sessionId: 'missing',
        filePath: 'src/app.ts',
        mode: 'working-tree',
        selectedDiff: '+line',
        body: 'question',
      }),
    ).toThrow(/Session not found/)
    expect(() =>
      service.create({
        sessionId: 's1',
        workspaceId: 'missing',
        filePath: 'src/app.ts',
        mode: 'working-tree',
        selectedDiff: '+line',
        body: 'question',
      }),
    ).toThrow(/Workspace not found/)
    expect(() => service.update('missing', { body: 'x' })).toThrow(/not found/)
  })

  it('deletes notes and cascades when a session is deleted', () => {
    const note = service.create({
      sessionId: 's1',
      filePath: 'src/app.ts',
      mode: 'working-tree',
      selectedDiff: '+line',
      body: 'Delete me',
    })

    service.delete(note.id)
    expect(service.getById(note.id)).toBeNull()

    const cascading = service.create({
      sessionId: 's1',
      filePath: 'src/app.ts',
      mode: 'working-tree',
      selectedDiff: '+line',
      body: 'Cascade',
    })
    getDatabase().prepare('DELETE FROM sessions WHERE id = ?').run('s1')
    expect(service.getById(cascading.id)).toBeNull()
  })
})
