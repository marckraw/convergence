import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { ProjectService } from './project.service'

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
    expect(project.settings).toEqual({})
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

  it('throws for duplicate repository path', () => {
    service.create({ repositoryPath: gitRepoPath })

    expect(() => service.create({ repositoryPath: gitRepoPath })).toThrow()
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
})
