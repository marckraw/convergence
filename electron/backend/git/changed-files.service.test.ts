import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { ChangedFilesService } from './changed-files.service'
import { GitService } from './git.service'

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function gitInit(dir: string): void {
  execFileSync('git', ['init', dir])
  git(dir, ['config', 'user.email', 'test@test.com'])
  git(dir, ['config', 'user.name', 'Test'])
  writeFileSync(join(dir, 'base.txt'), 'base\n')
  writeFileSync(join(dir, 'staged.txt'), 'staged base\n')
  writeFileSync(join(dir, 'unstaged.txt'), 'unstaged base\n')
  git(dir, ['add', '.'])
  git(dir, ['commit', '-m', 'base'])
  git(dir, ['branch', '-M', 'master'])
}

describe('ChangedFilesService', () => {
  let tempDir: string
  let repoPath: string
  let service: ChangedFilesService

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'convergence-changed-files-'))
    repoPath = join(tempDir, 'repo')
    gitInit(repoPath)
    service = new ChangedFilesService(getDatabase(), new GitService())
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('uses cached pull request base branch before project settings', async () => {
    git(repoPath, ['checkout', '-b', 'beta'])
    writeFileSync(join(repoPath, 'beta-only.txt'), 'beta\n')
    git(repoPath, ['add', '.'])
    git(repoPath, ['commit', '-m', 'beta'])
    git(repoPath, ['checkout', 'master'])
    git(repoPath, ['checkout', '-b', 'feature'])
    writeFileSync(join(repoPath, 'feature.txt'), 'feature\n')

    insertProject({ settingsBaseBranch: 'master' })
    insertWorkspace()
    insertPullRequest({ baseBranch: 'beta' })
    insertSession()

    const summary = await service.getBaseBranchStatus('s1')

    expect(summary.base).toMatchObject({
      branchName: 'beta',
      comparisonRef: 'beta',
      source: 'pull-request',
    })
  })

  it('uses project settings when no pull request base exists', async () => {
    git(repoPath, ['checkout', '-b', 'develop'])
    git(repoPath, ['checkout', 'master'])
    git(repoPath, ['checkout', '-b', 'feature'])
    insertProject({ settingsBaseBranch: 'develop' })
    insertSession()

    const summary = await service.getBaseBranchStatus('s1')

    expect(summary.base).toMatchObject({
      branchName: 'develop',
      comparisonRef: 'develop',
      source: 'project-settings',
    })
  })

  it('falls back to remote default branch', async () => {
    const remotePath = join(tempDir, 'remote.git')
    execFileSync('git', ['init', '--bare', remotePath])
    execFileSync('git', ['symbolic-ref', 'HEAD', 'refs/heads/master'], {
      cwd: remotePath,
    })
    git(repoPath, ['remote', 'add', 'origin', remotePath])
    git(repoPath, ['push', '-u', 'origin', 'master'])
    git(repoPath, ['remote', 'set-head', 'origin', '-a'])
    git(repoPath, ['checkout', '-b', 'feature'])
    insertProject()
    insertSession()

    const summary = await service.getBaseBranchStatus('s1')

    expect(summary.base).toMatchObject({
      branchName: 'master',
      comparisonRef: 'origin/master',
      source: 'remote-default',
    })
  })

  it('lists committed, staged, unstaged, and untracked changes', async () => {
    git(repoPath, ['checkout', '-b', 'feature'])
    writeFileSync(join(repoPath, 'committed.txt'), 'committed\n')
    git(repoPath, ['add', 'committed.txt'])
    git(repoPath, ['commit', '-m', 'feature commit'])
    writeFileSync(join(repoPath, 'staged.txt'), 'staged changed\n')
    git(repoPath, ['add', 'staged.txt'])
    writeFileSync(join(repoPath, 'unstaged.txt'), 'unstaged changed\n')
    writeFileSync(join(repoPath, 'untracked.txt'), 'untracked\n')
    insertProject({ settingsBaseBranch: 'master' })
    insertSession()

    const summary = await service.getBaseBranchStatus('s1')

    expect(summary.files).toEqual([
      { status: 'A', file: 'committed.txt' },
      { status: 'M', file: 'staged.txt' },
      { status: 'M', file: 'unstaged.txt' },
      { status: '??', file: 'untracked.txt' },
    ])
  })

  it('returns cumulative file diffs against the merge base', async () => {
    git(repoPath, ['checkout', '-b', 'feature'])
    writeFileSync(join(repoPath, 'base.txt'), 'base changed\n')
    git(repoPath, ['add', 'base.txt'])
    git(repoPath, ['commit', '-m', 'feature commit'])
    writeFileSync(join(repoPath, 'base.txt'), 'base changed again\n')
    insertProject({ settingsBaseBranch: 'master' })
    insertSession()

    const diff = await service.getBaseBranchDiff({
      sessionId: 's1',
      filePath: 'base.txt',
    })

    expect(diff).toContain('base.txt')
    expect(diff).toContain('-base')
    expect(diff).toContain('+base changed again')
  })

  it('returns a synthetic diff for untracked files', async () => {
    git(repoPath, ['checkout', '-b', 'feature'])
    writeFileSync(join(repoPath, 'untracked.txt'), 'untracked\n')
    insertProject({ settingsBaseBranch: 'master' })
    insertSession()

    const diff = await service.getBaseBranchDiff({
      sessionId: 's1',
      filePath: 'untracked.txt',
    })

    expect(diff).toContain('/dev/null')
    expect(diff).toContain('+untracked')
  })

  it('throws a clear error when the configured base branch is missing', async () => {
    git(repoPath, ['checkout', '-b', 'feature'])
    insertProject({ settingsBaseBranch: 'missing-base' })
    insertSession()

    await expect(service.getBaseBranchStatus('s1')).rejects.toThrow(
      'Base branch not found: missing-base',
    )
  })

  function insertProject(input: { settingsBaseBranch?: string } = {}): void {
    const settings = {
      workspaceCreation: {
        startStrategy: 'base-branch',
        baseBranchName: input.settingsBaseBranch ?? null,
      },
    }
    getDatabase()
      .prepare(
        `INSERT INTO projects (id, name, repository_path, settings)
         VALUES ('p1', 'repo', ?, ?)`,
      )
      .run(repoPath, JSON.stringify(settings))
  }

  function insertWorkspace(): void {
    getDatabase()
      .prepare(
        `INSERT OR IGNORE INTO workspaces (id, project_id, branch_name, path, type)
         VALUES ('w1', 'p1', 'feature', ?, 'worktree')`,
      )
      .run(repoPath)
  }

  function insertPullRequest(input: { baseBranch: string }): void {
    getDatabase()
      .prepare(
        `INSERT INTO workspace_pull_requests (
           id, project_id, workspace_id, provider, lookup_status, state,
           base_branch, last_checked_at
         ) VALUES (
           'pr1', 'p1', 'w1', 'github', 'found', 'open', ?, '2026-01-01T00:00:00.000Z'
         )`,
      )
      .run(input.baseBranch)
  }

  function insertSession(): void {
    insertWorkspace()
    getDatabase()
      .prepare(
        `INSERT INTO sessions (
           id, project_id, workspace_id, provider_id, name, working_directory
         ) VALUES (
           's1', 'p1', 'w1', 'claude-code', 'Session', ?
         )`,
      )
      .run(repoPath)
  }
})
