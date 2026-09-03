import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { ProjectService } from './project.service'
import { DEFAULT_PROJECT_SETTINGS } from './project-settings.pure'

describe('ProjectService', () => {
  let service: ProjectService
  let tempDir: string
  let gitRepoPath: string

  beforeEach(() => {
    const db = getDatabase()
    service = new ProjectService(db)

    tempDir = mkdtempSync(join(tmpdir(), 'convergence-test-'))
    gitRepoPath = join(tempDir, 'my-repo')
    mkdirSync(gitRepoPath)
    mkdirSync(join(gitRepoPath, '.git'))
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('creates a project from a valid git repo', () => {
    const project = service.create({ repositoryPath: gitRepoPath })

    expect(project.id).toBeDefined()
    expect(project.name).toBe('my-repo')
    expect(project.repositoryPath).toBe(gitRepoPath)
    expect(project.settings).toEqual(DEFAULT_PROJECT_SETTINGS)
    expect(project.createdAt).toBeDefined()
  })

  it('uses custom name when provided', () => {
    const project = service.create({
      repositoryPath: gitRepoPath,
      name: 'Custom Name',
    })

    expect(project.name).toBe('Custom Name')
  })

  it('throws for non-existent path', () => {
    expect(() =>
      service.create({ repositoryPath: '/nonexistent/path' }),
    ).toThrow('Path does not exist')
  })

  it('throws for non-git directory', () => {
    const noGitDir = join(tempDir, 'no-git')
    mkdirSync(noGitDir)

    expect(() => service.create({ repositoryPath: noGitDir })).toThrow(
      'Not a git repository',
    )
  })

  it('returns the existing project for a duplicate repository path', () => {
    const first = service.create({ repositoryPath: gitRepoPath })
    const duplicate = service.create({ repositoryPath: gitRepoPath })

    expect(duplicate.id).toBe(first.id)
    expect(service.getAll()).toHaveLength(1)
  })

  it('lists all projects', () => {
    const repo2 = join(tempDir, 'repo-2')
    mkdirSync(repo2)
    mkdirSync(join(repo2, '.git'))

    service.create({ repositoryPath: gitRepoPath })
    service.create({ repositoryPath: repo2 })

    const projects = service.getAll()
    expect(projects).toHaveLength(2)
  })

  it('gets project by id', () => {
    const created = service.create({ repositoryPath: gitRepoPath })
    const found = service.getById(created.id)

    expect(found).not.toBeNull()
    expect(found!.id).toBe(created.id)
  })

  it('returns null for unknown id', () => {
    const found = service.getById('nonexistent')
    expect(found).toBeNull()
  })

  it('deletes a project', () => {
    const created = service.create({ repositoryPath: gitRepoPath })
    service.delete(created.id)

    const found = service.getById(created.id)
    expect(found).toBeNull()
  })

  it('updates project settings', () => {
    const created = service.create({ repositoryPath: gitRepoPath })

    const updated = service.updateSettings(created.id, {
      workspaceCreation: {
        startStrategy: 'current-head',
        baseBranchName: 'develop',
      },
      workspaceEnvFiles: DEFAULT_PROJECT_SETTINGS.workspaceEnvFiles,
    })

    expect(updated.settings).toEqual({
      workspaceCreation: {
        startStrategy: 'current-head',
        baseBranchName: 'develop',
      },
      workspaceEnvFiles: DEFAULT_PROJECT_SETTINGS.workspaceEnvFiles,
    })
  })
})

describe('ProjectService lanes (MAR-2783)', () => {
  let service: ProjectService
  let tempDir: string
  let rootPath: string

  function insertLane(id: string, rootId: string, laneName: string): void {
    getDatabase()
      .prepare(
        `INSERT INTO projects (id, name, repository_path, settings, lane_of, lane_name)
         VALUES (?, ?, ?, '{}', ?, ?)`,
      )
      .run(id, `root · lane: ${laneName}`, join(tempDir, id), rootId, laneName)
  }

  beforeEach(() => {
    service = new ProjectService(getDatabase())
    tempDir = mkdtempSync(join(tmpdir(), 'convergence-lanes-'))
    rootPath = join(tempDir, 'root')
    mkdirSync(join(rootPath, '.git'), { recursive: true })
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('reads a root as its own root, with both lane fields null', () => {
    const root = service.create({ repositoryPath: rootPath })
    expect(root.laneOf).toBeNull()
    expect(root.laneName).toBeNull()
    expect(service.getRoot(root)).toEqual(root)
    expect(service.listLanes(root.id)).toEqual([])
  })

  it('lists the lanes of a root oldest first, and resolves a lane to its root', () => {
    const root = service.create({ repositoryPath: rootPath })
    insertLane('lane-b', root.id, 'beta')
    insertLane('lane-a', root.id, 'alpha')

    const lanes = service.listLanes(root.id)
    expect(lanes.map((lane) => lane.laneName)).toEqual(['beta', 'alpha'])
    expect(lanes[0]!.laneOf).toBe(root.id)
    expect(service.getRoot(lanes[0]!)).toEqual(root)
    // A lane shows up in the flat list too: it IS a project.
    expect(
      service
        .getAll()
        .map((p) => p.id)
        .sort(),
    ).toEqual([root.id, 'lane-a', 'lane-b'].sort())
  })

  // M4 (round 2): the self-FK cascade would take the lane rows, their
  // sessions and workspace rows, while the lane folders stayed on disk with
  // no record. L1 refuses; L2's delete-lane owns the rest.
  it('refuses to delete a root that still has lanes, and deletes it once they are gone', async () => {
    const root = service.create({ repositoryPath: rootPath })
    insertLane('lane-a', root.id, 'alpha')
    insertLane('lane-b', root.id, 'beta')

    await expect(service.delete(root.id)).rejects.toThrow(
      'Delete or move its 2 lanes first',
    )
    expect(service.getById(root.id)).not.toBeNull()
    expect(service.listLanes(root.id)).toHaveLength(2)

    getDatabase().prepare('DELETE FROM projects WHERE lane_of = ?').run(root.id)
    await service.delete(root.id)
    expect(service.getById(root.id)).toBeNull()
  })

  it('answers null for a lane whose root row is gone', () => {
    const root = service.create({ repositoryPath: rootPath })
    insertLane('lane-a', root.id, 'alpha')
    const lane = service.getById('lane-a')!
    getDatabase().prepare('DELETE FROM projects WHERE id = ?').run(root.id)
    expect(service.getRoot(lane)).toBeNull()
    // And the cascade took the lane row with it.
    expect(service.getById('lane-a')).toBeNull()
  })
})
