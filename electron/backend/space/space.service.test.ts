import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { SpaceService } from './space.service'

describe('SpaceService', () => {
  let service: SpaceService

  beforeEach(() => {
    const db = getDatabase()
    service = new SpaceService(db)
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('p1', 'p1', '/tmp/p1')",
    ).run()
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('p2', 'p2', '/tmp/p2')",
    ).run()
    db.prepare(
      "INSERT INTO sessions (id, project_id, provider_id, name, working_directory) VALUES ('s1', 'p1', 'codex', 's1', '/tmp/p1')",
    ).run()
    db.prepare(
      "INSERT INTO sessions (id, project_id, provider_id, name, working_directory) VALUES ('s2', 'p2', 'claude-code', 's2', '/tmp/p2')",
    ).run()
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  it('creates and updates a global space', () => {
    const created = service.create({
      title: ' Agent-native spaces ',
      brief: '  rough idea  ',
    })

    expect(created.title).toBe('Agent-native spaces')
    expect(created.status).toBe('exploring')
    expect(created.attention).toBe('none')
    expect(created.brief).toBe('rough idea')

    const updated = service.update(created.id, {
      status: 'implementing',
      attention: 'needs-decision',
      brief: 'implementation direction',
    })

    expect(updated.status).toBe('implementing')
    expect(updated.attention).toBe('needs-decision')
    expect(updated.brief).toBe('implementation direction')
  })

  it('rejects an empty title', () => {
    expect(() => service.create({ title: '   ' })).toThrow(
      'Space title is required',
    )
  })

  it('links sessions from different projects as attempts', () => {
    const space = service.create({ title: 'Cross-project feature' })

    const first = service.linkAttempt({
      spaceId: space.id,
      sessionId: 's1',
      role: 'seed',
    })
    const second = service.linkAttempt({
      spaceId: space.id,
      sessionId: 's2',
      role: 'implementation',
    })

    expect(first.isPrimary).toBe(true)
    expect(second.isPrimary).toBe(false)
    expect(service.listAttempts(space.id).map((a) => a.sessionId)).toEqual([
      's1',
      's2',
    ])
    expect(
      service.listAttemptsForSession('s2').map((attempt) => attempt.spaceId),
    ).toEqual([space.id])
  })

  it('prevents duplicate session links within one space', () => {
    const space = service.create({ title: 'Duplicate test' })
    service.linkAttempt({ spaceId: space.id, sessionId: 's1' })

    expect(() =>
      service.linkAttempt({ spaceId: space.id, sessionId: 's1' }),
    ).toThrow('Session is already linked to this Space')
  })

  it('sets one primary attempt transactionally', () => {
    const space = service.create({ title: 'Primary test' })
    const first = service.linkAttempt({
      spaceId: space.id,
      sessionId: 's1',
    })
    const second = service.linkAttempt({
      spaceId: space.id,
      sessionId: 's2',
    })

    service.setPrimaryAttempt(space.id, second.id)

    const attempts = service.listAttempts(space.id)
    expect(
      attempts
        .filter((attempt) => attempt.isPrimary)
        .map((attempt) => attempt.id),
    ).toEqual([second.id])
    expect(attempts.find((attempt) => attempt.id === first.id)?.isPrimary).toBe(
      false,
    )
  })

  it('updates and unlinks attempts', () => {
    const space = service.create({ title: 'Attempt updates' })
    const attempt = service.linkAttempt({
      spaceId: space.id,
      sessionId: 's1',
    })

    expect(service.updateAttempt(attempt.id, { role: 'review' }).role).toBe(
      'review',
    )

    service.unlinkAttempt(attempt.id)
    expect(service.listAttempts(space.id)).toEqual([])
  })

  it('manages artifacts', () => {
    const space = service.create({ title: 'Artifact test' })
    const artifact = service.addArtifact({
      spaceId: space.id,
      kind: 'pull-request',
      label: ' PR ',
      value: ' https://example.com/pr/1 ',
      sourceSessionId: 's1',
    })

    expect(artifact.label).toBe('PR')
    expect(artifact.value).toBe('https://example.com/pr/1')
    expect(artifact.status).toBe('planned')

    const updated = service.updateArtifact(artifact.id, {
      status: 'merged',
      label: 'Merged PR',
    })
    expect(updated.status).toBe('merged')
    expect(updated.label).toBe('Merged PR')

    service.deleteArtifact(artifact.id)
    expect(service.listArtifacts(space.id)).toEqual([])
  })

  it('creates Space roots and manages copied file sources', () => {
    const spaceRoot = mkdtempSync(join(tmpdir(), 'convergence-space-root-'))
    const sourceRoot = mkdtempSync(join(tmpdir(), 'convergence-source-root-'))

    try {
      const fsService = new SpaceService(getDatabase(), spaceRoot)
      const sourcePath = join(sourceRoot, 'notes.md')
      writeFileSync(sourcePath, '# Notes\n')

      const space = fsService.create({ title: 'Source test' })
      const root = join(spaceRoot, space.id)

      expect(existsSync(join(root, 'sources'))).toBe(true)
      expect(existsSync(join(root, 'memory'))).toBe(true)
      expect(existsSync(join(root, 'artifacts'))).toBe(true)
      expect(existsSync(join(root, 'attempts'))).toBe(true)
      expect(existsSync(join(root, 'scratch'))).toBe(true)

      fsService.linkAttempt({ spaceId: space.id, sessionId: 's1' })
      expect(existsSync(join(root, 'attempts', 's1'))).toBe(true)

      const [source] = fsService.addSourcesFromPaths(space.id, [sourcePath])

      expect(source.filename).toBe('notes.md')
      expect(source.originalPath).toBe(sourcePath)
      expect(source.storagePath.startsWith(join(root, 'sources'))).toBe(true)
      expect(readFileSync(source.storagePath, 'utf8')).toBe('# Notes\n')
      expect(fsService.listSources(space.id)).toEqual([source])

      fsService.deleteSource(source.id)
      expect(existsSync(source.storagePath)).toBe(false)
      expect(existsSync(sourcePath)).toBe(true)
      expect(fsService.listSources(space.id)).toEqual([])

      fsService.addSourcesFromPaths(space.id, [sourcePath])
      fsService.delete(space.id)
      expect(existsSync(root)).toBe(false)
    } finally {
      rmSync(spaceRoot, { recursive: true, force: true })
      rmSync(sourceRoot, { recursive: true, force: true })
    }
  })

  it('cascades attempts and artifacts when a space is deleted', () => {
    const space = service.create({ title: 'Cascade test' })
    service.linkAttempt({ spaceId: space.id, sessionId: 's1' })
    service.addArtifact({
      spaceId: space.id,
      kind: 'branch',
      label: 'Branch',
      value: 'feature/a',
    })

    service.delete(space.id)

    expect(service.getById(space.id)).toBeNull()
    const db = getDatabase()
    expect(
      db
        .prepare('SELECT id FROM space_attempts WHERE space_id = ?')
        .all(space.id),
    ).toEqual([])
    expect(
      db
        .prepare('SELECT id FROM space_artifacts WHERE space_id = ?')
        .all(space.id),
    ).toEqual([])
  })
})
