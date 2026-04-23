import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, existsSync } from 'fs'
import { rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { execFileSync } from 'child_process'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { GitService } from '../git/git.service'
import { WorkspaceService } from './workspace.service'

function git(dir: string, args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
}

function gitInit(dir: string): void {
  execFileSync('git', ['init', dir])
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir })
  execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: dir })
  execFileSync('git', ['branch', '-M', 'master'], { cwd: dir })
}

function insertProject(
  projectId: string,
  repoPath: string,
  settings: unknown = {},
): void {
  const db = getDatabase()
  db.prepare(
    `INSERT INTO projects (id, name, repository_path, settings)
     VALUES (?, 'test-repo', ?, ?)`,
  ).run(projectId, repoPath, JSON.stringify(settings))
}

describe('WorkspaceService', () => {
  let service: WorkspaceService
  let tempDir: string
  let repoPath: string
  let projectId: string

  beforeEach(() => {
    const db = getDatabase()
    const gitService = new GitService()
    tempDir = mkdtempSync(join(tmpdir(), 'convergence-ws-test-'))
    const workspacesRoot = join(tempDir, 'workspaces')

    service = new WorkspaceService(db, gitService, workspacesRoot)

    repoPath = join(tempDir, 'repo')
    gitInit(repoPath)

    projectId = 'test-project-id'
    insertProject(projectId, repoPath)
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('creates a workspace with a new branch', async () => {
    const ws = await service.create({
      projectId,
      branchName: 'feature-test',
    })

    expect(ws.id).toBeDefined()
    expect(ws.projectId).toBe(projectId)
    expect(ws.branchName).toBe('feature-test')
    expect(ws.type).toBe('worktree')
    expect(existsSync(ws.path)).toBe(true)
  })

  it('creates a workspace from the base branch instead of the current HEAD', async () => {
    git(repoPath, ['checkout', '-b', 'feature-source'])
    git(repoPath, ['commit', '--allow-empty', '-m', 'feature change'])

    const featureHead = git(repoPath, ['rev-parse', 'HEAD'])
    const baseHead = git(repoPath, ['rev-parse', 'master'])

    const ws = await service.create({
      projectId,
      branchName: 'feature-test',
    })

    expect(git(ws.path, ['rev-parse', 'HEAD'])).toBe(baseHead)
    expect(git(ws.path, ['rev-parse', 'HEAD'])).not.toBe(featureHead)
  })

  it('fetches and starts from the remote base branch when available', async () => {
    const remotePath = join(tempDir, 'remote.git')
    execFileSync('git', ['init', '--bare', remotePath])
    execFileSync('git', ['symbolic-ref', 'HEAD', 'refs/heads/master'], {
      cwd: remotePath,
    })

    const seedPath = join(tempDir, 'seed')
    gitInit(seedPath)
    git(seedPath, ['remote', 'add', 'origin', remotePath])
    git(seedPath, ['push', '-u', 'origin', 'master'])

    repoPath = join(tempDir, 'clone')
    execFileSync('git', ['clone', remotePath, repoPath])
    execFileSync('git', ['config', 'user.email', 'test@test.com'], {
      cwd: repoPath,
    })
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repoPath })

    closeDatabase()
    resetDatabase()
    const db = getDatabase()
    const gitService = new GitService()
    service = new WorkspaceService(db, gitService, join(tempDir, 'workspaces'))
    insertProject(projectId, repoPath, {
      workspaceCreation: {
        startStrategy: 'base-branch',
        baseBranchName: 'master',
      },
    })

    const staleMasterHead = git(repoPath, ['rev-parse', 'master'])
    git(repoPath, ['checkout', '-b', 'feature-source'])
    git(repoPath, ['commit', '--allow-empty', '-m', 'local feature change'])
    const featureHead = git(repoPath, ['rev-parse', 'HEAD'])

    git(seedPath, ['commit', '--allow-empty', '-m', 'remote master update'])
    const remoteMasterHead = git(seedPath, ['rev-parse', 'HEAD'])
    git(seedPath, ['push', 'origin', 'master'])

    expect(git(repoPath, ['rev-parse', 'origin/master'])).toBe(staleMasterHead)

    const ws = await service.create({
      projectId,
      branchName: 'feature-remote-base',
    })

    const workspaceHead = git(ws.path, ['rev-parse', 'HEAD'])
    expect(workspaceHead).toBe(remoteMasterHead)
    expect(workspaceHead).not.toBe(staleMasterHead)
    expect(workspaceHead).not.toBe(featureHead)
  })

  it('uses the input baseBranch override instead of the project setting', async () => {
    getDatabase()
      .prepare('UPDATE projects SET settings = ? WHERE id = ?')
      .run(
        JSON.stringify({
          workspaceCreation: {
            startStrategy: 'current-head',
            baseBranchName: null,
          },
        }),
        projectId,
      )

    git(repoPath, ['checkout', '-b', 'develop'])
    git(repoPath, ['commit', '--allow-empty', '-m', 'develop change'])
    const developHead = git(repoPath, ['rev-parse', 'HEAD'])

    git(repoPath, ['checkout', 'master'])
    git(repoPath, ['checkout', '-b', 'feature-source'])
    git(repoPath, ['commit', '--allow-empty', '-m', 'feature change'])
    const featureHead = git(repoPath, ['rev-parse', 'HEAD'])

    const ws = await service.create({
      projectId,
      branchName: 'feature-from-develop',
      baseBranch: 'develop',
    })

    const workspaceHead = git(ws.path, ['rev-parse', 'HEAD'])
    expect(workspaceHead).toBe(developHead)
    expect(workspaceHead).not.toBe(featureHead)
  })

  it('uses the current HEAD when the project is configured for that strategy', async () => {
    getDatabase()
      .prepare('UPDATE projects SET settings = ? WHERE id = ?')
      .run(
        JSON.stringify({
          workspaceCreation: {
            startStrategy: 'current-head',
            baseBranchName: 'master',
          },
        }),
        projectId,
      )

    git(repoPath, ['checkout', '-b', 'feature-source'])
    git(repoPath, ['commit', '--allow-empty', '-m', 'feature change'])

    const featureHead = git(repoPath, ['rev-parse', 'HEAD'])

    const ws = await service.create({
      projectId,
      branchName: 'feature-current-head',
    })

    expect(git(ws.path, ['rev-parse', 'HEAD'])).toBe(featureHead)
  })

  it('creates a workspace from an existing branch', async () => {
    execFileSync('git', ['branch', 'existing-branch'], { cwd: repoPath })

    const ws = await service.create({
      projectId,
      branchName: 'existing-branch',
    })

    expect(ws.branchName).toBe('existing-branch')
    expect(existsSync(ws.path)).toBe(true)
  })

  it('rejects duplicate branch for same project', async () => {
    await service.create({ projectId, branchName: 'dup-branch' })

    await expect(
      service.create({ projectId, branchName: 'dup-branch' }),
    ).rejects.toThrow()
  })

  it('throws for non-existent project', async () => {
    await expect(
      service.create({ projectId: 'nonexistent', branchName: 'x' }),
    ).rejects.toThrow('Project not found')
  })

  it('lists workspaces for a project', async () => {
    await service.create({ projectId, branchName: 'branch-1' })
    await service.create({ projectId, branchName: 'branch-2' })

    const workspaces = service.getByProjectId(projectId)
    expect(workspaces).toHaveLength(2)
  })

  it('deletes a workspace and cleans up worktree', async () => {
    const ws = await service.create({ projectId, branchName: 'delete-me' })
    expect(existsSync(ws.path)).toBe(true)

    await service.delete(ws.id)
    expect(existsSync(ws.path)).toBe(false)

    const workspaces = service.getByProjectId(projectId)
    expect(workspaces).toHaveLength(0)
  })

  it('deleteAllForProject removes all workspaces', async () => {
    await service.create({ projectId, branchName: 'ws-1' })
    await service.create({ projectId, branchName: 'ws-2' })
    expect(service.getByProjectId(projectId)).toHaveLength(2)

    await service.deleteAllForProject(projectId)
    expect(service.getByProjectId(projectId)).toHaveLength(0)
  })

  it('listAll returns an empty array when no workspaces exist', () => {
    expect(service.listAll()).toEqual([])
  })

  it('listAll returns workspaces from every project in one call', async () => {
    const secondRepoPath = join(tempDir, 'repo-2')
    gitInit(secondRepoPath)
    const secondProjectId = 'test-project-id-2'
    insertProject(secondProjectId, secondRepoPath)

    await service.create({ projectId, branchName: 'project-a-branch-1' })
    await service.create({ projectId, branchName: 'project-a-branch-2' })
    await service.create({
      projectId: secondProjectId,
      branchName: 'project-b-branch-1',
    })

    const all = service.listAll()
    expect(all).toHaveLength(3)
    const projectIds = new Set(all.map((w) => w.projectId))
    expect(projectIds).toEqual(new Set([projectId, secondProjectId]))

    expect(service.getByProjectId(projectId)).toHaveLength(2)
    expect(service.getByProjectId(secondProjectId)).toHaveLength(1)
  })
})
