import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'
import { randomUUID } from 'crypto'
import Database from 'better-sqlite3'
import {
  closeDatabase,
  getDatabase,
  resetDatabase,
} from '../../database/database'
import { GitService } from '../../git/git.service'
import { TurnCaptureService, type TurnDelta } from './turn-capture.service'

function gitInit(dir: string): void {
  execFileSync('git', ['init', '-q', dir])
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir })
  execFileSync('git', ['commit', '--allow-empty', '-q', '-m', 'init'], {
    cwd: dir,
  })
}

function gitCommitAll(dir: string, message: string): void {
  execFileSync('git', ['add', '-A'], { cwd: dir })
  execFileSync('git', ['commit', '-q', '-m', message], { cwd: dir })
}

function seedSessionRow(
  db: Database.Database,
  sessionId: string,
  workingDirectory: string,
): void {
  db.prepare(
    "INSERT OR IGNORE INTO projects (id, name, repository_path) VALUES ('p1', 'p', ?)",
  ).run(workingDirectory)
  db.prepare(
    `INSERT INTO sessions (id, project_id, provider_id, name, working_directory)
     VALUES (?, 'p1', 'codex', 's', ?)`,
  ).run(sessionId, workingDirectory)
}

describe('TurnCaptureService', () => {
  let tempDir: string
  let repoPath: string
  let git: GitService
  let db: Database.Database
  let service: TurnCaptureService

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'turn-capture-test-'))
    repoPath = join(tempDir, 'repo')
    gitInit(repoPath)
    git = new GitService()
    db = getDatabase()
    service = new TurnCaptureService(git, db, { debounceMs: 0 })
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('inserts a running turn row on start', async () => {
    const sessionId = randomUUID()
    const turnId = randomUUID()
    seedSessionRow(db, sessionId, repoPath)

    await service.startTurn({ sessionId, turnId, workingDirectory: repoPath })

    const turns = service.listTurns(sessionId)
    expect(turns).toHaveLength(1)
    expect(turns[0]).toMatchObject({
      id: turnId,
      sessionId,
      sequence: 1,
      status: 'running',
      endedAt: null,
      summary: null,
    })
  })

  it('assigns monotonically increasing sequence numbers per session', async () => {
    const sessionId = randomUUID()
    seedSessionRow(db, sessionId, repoPath)

    for (let i = 0; i < 3; i++) {
      await service.startTurn({
        sessionId,
        turnId: randomUUID(),
        workingDirectory: repoPath,
      })
    }

    expect(service.listTurns(sessionId).map((t) => t.sequence)).toEqual([
      1, 2, 3,
    ])
  })

  it('records zero file changes when nothing was edited during the turn', async () => {
    const sessionId = randomUUID()
    const turnId = randomUUID()
    seedSessionRow(db, sessionId, repoPath)

    await service.startTurn({ sessionId, turnId, workingDirectory: repoPath })
    service.endTurn({
      sessionId,
      turnId,
      status: 'completed',
      summarySource: 'Investigated, no changes needed',
    })
    await service.flushPendingEnd(sessionId)

    expect(service.listFileChanges(turnId)).toEqual([])
    expect(service.listTurns(sessionId)[0]).toMatchObject({
      status: 'completed',
      summary: 'Investigated, no changes needed',
    })
    expect(service.listTurns(sessionId)[0].endedAt).not.toBeNull()
  })

  it('records added, modified and deleted files within a turn', async () => {
    const sessionId = randomUUID()
    const turnId = randomUUID()
    seedSessionRow(db, sessionId, repoPath)

    writeFileSync(join(repoPath, 'keep.ts'), 'one\ntwo\nthree\n')
    writeFileSync(join(repoPath, 'gone.ts'), 'delete me\n')
    gitCommitAll(repoPath, 'seed')

    await service.startTurn({ sessionId, turnId, workingDirectory: repoPath })

    writeFileSync(join(repoPath, 'keep.ts'), 'one\ntwo changed\nthree\n')
    writeFileSync(join(repoPath, 'fresh.ts'), 'brand new\n')
    unlinkSync(join(repoPath, 'gone.ts'))

    service.endTurn({
      sessionId,
      turnId,
      status: 'completed',
      summarySource: 'Did some edits',
    })
    await service.flushPendingEnd(sessionId)

    const changes = service.listFileChanges(turnId)
    const byPath = new Map(changes.map((c) => [c.filePath, c]))
    expect([...byPath.keys()].sort()).toEqual(
      ['fresh.ts', 'gone.ts', 'keep.ts'].sort(),
    )
    expect(byPath.get('keep.ts')!.status).toBe('modified')
    expect(byPath.get('fresh.ts')!.status).toBe('added')
    expect(byPath.get('gone.ts')!.status).toBe('deleted')
    expect(byPath.get('keep.ts')!.additions).toBeGreaterThan(0)
    expect(byPath.get('keep.ts')!.deletions).toBeGreaterThan(0)
  })

  it('marks binary file changes with the sentinel marker and zero counts', async () => {
    const sessionId = randomUUID()
    const turnId = randomUUID()
    seedSessionRow(db, sessionId, repoPath)

    await service.startTurn({ sessionId, turnId, workingDirectory: repoPath })

    const binaryBuf = Buffer.from([0, 1, 2, 0, 3, 4, 0])
    writeFileSync(join(repoPath, 'logo.bin'), binaryBuf)

    service.endTurn({
      sessionId,
      turnId,
      status: 'completed',
      summarySource: null,
    })
    await service.flushPendingEnd(sessionId)

    const changes = service.listFileChanges(turnId)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({
      filePath: 'logo.bin',
      status: 'added',
      additions: 0,
      deletions: 0,
    })
    expect(changes[0].diff).toBe('[binary file change]')
  })

  it('truncates very large diffs', async () => {
    const sessionId = randomUUID()
    const turnId = randomUUID()
    seedSessionRow(db, sessionId, repoPath)

    const big = Array.from({ length: 30000 }, (_, i) => `line ${i}`).join('\n')
    writeFileSync(join(repoPath, 'huge.txt'), big + '\n')
    gitCommitAll(repoPath, 'seed big file')

    await service.startTurn({ sessionId, turnId, workingDirectory: repoPath })

    const replaced = Array.from({ length: 30000 }, (_, i) => `lineX ${i}`).join(
      '\n',
    )
    writeFileSync(join(repoPath, 'huge.txt'), replaced + '\n')

    service.endTurn({
      sessionId,
      turnId,
      status: 'completed',
      summarySource: null,
    })
    await service.flushPendingEnd(sessionId)

    const changes = service.listFileChanges(turnId)
    expect(changes).toHaveLength(1)
    expect(changes[0].diff.startsWith('[diff truncated:')).toBe(true)
    expect(changes[0].additions).toBe(0)
    expect(changes[0].deletions).toBe(0)
  })

  it('short-circuits capture for a non-git working directory', async () => {
    const sessionId = randomUUID()
    const turnId = randomUUID()
    const nonGitDir = join(tempDir, 'plain')
    rmSync(nonGitDir, { recursive: true, force: true })
    execFileSync('mkdir', ['-p', nonGitDir])
    seedSessionRow(db, sessionId, nonGitDir)

    await service.startTurn({
      sessionId,
      turnId,
      workingDirectory: nonGitDir,
    })
    writeFileSync(join(nonGitDir, 'a.txt'), 'ignored')
    service.endTurn({
      sessionId,
      turnId,
      status: 'completed',
      summarySource: null,
    })
    await service.flushPendingEnd(sessionId)

    expect(service.listTurns(sessionId)).toHaveLength(1)
    expect(service.listTurns(sessionId)[0].status).toBe('completed')
    expect(service.listFileChanges(turnId)).toEqual([])
  })

  it('recoverRunningTurns transitions leftover running rows to errored', async () => {
    const sessionId = randomUUID()
    const turnId = randomUUID()
    seedSessionRow(db, sessionId, repoPath)

    db.prepare(
      `INSERT INTO session_turns (id, session_id, sequence, started_at, status)
       VALUES (?, ?, 1, '2026-04-23T00:00:00.000Z', 'running')`,
    ).run(turnId, sessionId)

    service.recoverRunningTurns()

    const row = service.listTurns(sessionId)[0]
    expect(row.status).toBe('errored')
    expect(row.endedAt).not.toBeNull()
  })

  it('coalesces repeated endTurn calls within the debounce window', async () => {
    const debounced = new TurnCaptureService(git, db, { debounceMs: 25 })
    const sessionId = randomUUID()
    const turnId = randomUUID()
    seedSessionRow(db, sessionId, repoPath)

    writeFileSync(join(repoPath, 'x.txt'), 'orig\n')
    gitCommitAll(repoPath, 'seed')
    await debounced.startTurn({
      sessionId,
      turnId,
      workingDirectory: repoPath,
    })
    writeFileSync(join(repoPath, 'x.txt'), 'changed\n')

    let emitCount = 0
    debounced.setDeltaEmitter((_session, delta) => {
      if (delta.kind === 'turn.fileChanges.add') emitCount++
    })

    debounced.endTurn({
      sessionId,
      turnId,
      status: 'completed',
      summarySource: null,
    })
    debounced.endTurn({
      sessionId,
      turnId,
      status: 'completed',
      summarySource: null,
    })
    debounced.endTurn({
      sessionId,
      turnId,
      status: 'completed',
      summarySource: null,
    })

    await debounced.flushPendingEnd(sessionId)

    expect(emitCount).toBe(1)
    expect(debounced.listFileChanges(turnId)).toHaveLength(1)
  })

  it('emits turn.add on start and turn.fileChanges.add on end when files changed', async () => {
    const sessionId = randomUUID()
    const turnId = randomUUID()
    seedSessionRow(db, sessionId, repoPath)

    const emitted: TurnDelta[] = []
    service.setDeltaEmitter((_sid, delta) => emitted.push(delta))

    writeFileSync(join(repoPath, 'a.txt'), 'one\n')
    gitCommitAll(repoPath, 'seed')

    await service.startTurn({ sessionId, turnId, workingDirectory: repoPath })

    writeFileSync(join(repoPath, 'a.txt'), 'two\n')
    service.endTurn({
      sessionId,
      turnId,
      status: 'completed',
      summarySource: null,
    })
    await service.flushPendingEnd(sessionId)

    expect(emitted.map((d) => d.kind)).toEqual([
      'turn.add',
      'turn.fileChanges.add',
    ])
  })

  it('truncates a very long summary to the max length with an ellipsis', async () => {
    const sessionId = randomUUID()
    const turnId = randomUUID()
    seedSessionRow(db, sessionId, repoPath)
    await service.startTurn({ sessionId, turnId, workingDirectory: repoPath })

    const long = 'Fix the thing in the other thing '.repeat(20)
    service.endTurn({
      sessionId,
      turnId,
      status: 'completed',
      summarySource: long,
    })
    await service.flushPendingEnd(sessionId)

    const stored = service.listTurns(sessionId)[0].summary
    expect(stored).not.toBeNull()
    expect(stored!.length).toBe(80)
    expect(stored!.endsWith('…')).toBe(true)
  })

  it('getFileDiff returns the stored diff for a turn+file pair', async () => {
    const sessionId = randomUUID()
    const turnId = randomUUID()
    seedSessionRow(db, sessionId, repoPath)

    writeFileSync(join(repoPath, 'hello.txt'), 'one\n')
    gitCommitAll(repoPath, 'seed')
    await service.startTurn({ sessionId, turnId, workingDirectory: repoPath })
    writeFileSync(join(repoPath, 'hello.txt'), 'two\n')
    service.endTurn({
      sessionId,
      turnId,
      status: 'completed',
      summarySource: null,
    })
    await service.flushPendingEnd(sessionId)

    const diff = service.getFileDiff(turnId, 'hello.txt')
    expect(diff).toContain('two')
    expect(diff.length).toBeGreaterThan(0)
    expect(service.getFileDiff(turnId, 'nonexistent.txt')).toBe('')
  })
})
