import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, existsSync } from 'fs'
import { rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { execFileSync } from 'child_process'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { GitService } from '../git/git.service'
import { WorkspaceService } from './workspace.service'

function gitInit(dir: string): void {
  execFileSync('git', ['init', dir])
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir })
  execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: dir })
}

describe('WorkspaceService', () => {
  let service: WorkspaceService
  let tempDir: string
  let repoPath: string
  let projectId: string

  beforeEach(() => {
    const db = getDatabase()
    const git = new GitService()
    tempDir = mkdtempSync(join(tmpdir(), 'convergence-ws-test-'))
    const workspacesRoot = join(tempDir, 'workspaces')

    service = new WorkspaceService(db, git, workspacesRoot)

    repoPath = join(tempDir, 'repo')
    gitInit(repoPath)

    // Insert a project record
    projectId = 'test-project-id'
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES (?, 'test-repo', ?)",
    ).run(projectId, repoPath)
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
})
