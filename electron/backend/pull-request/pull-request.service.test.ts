import { execFile } from 'child_process'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import type { GitService } from '../git/git.service'
import { PullRequestService } from './pull-request.service'

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}))

const execFileMock = vi.mocked(execFile)

describe('PullRequestService', () => {
  beforeEach(() => {
    execFileMock.mockReset()
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  it('times out gh lookups and stores an error status', async () => {
    const db = getDatabase()
    db.prepare(
      `INSERT INTO projects (id, name, repository_path, settings)
       VALUES (?, ?, ?, ?)`,
    ).run('project-1', 'Project', '/repo', '{}')
    db.prepare(
      `INSERT INTO workspaces (id, project_id, branch_name, path, type)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('workspace-1', 'project-1', 'feature-x', '/repo-ws', 'worktree')
    db.prepare(
      `INSERT INTO sessions (id, project_id, workspace_id, provider_id, name, working_directory)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      'session-1',
      'project-1',
      'workspace-1',
      'claude-code',
      'Session',
      '/repo-ws',
    )

    const git = {
      getCurrentBranch: vi.fn().mockResolvedValue('feature-x'),
      getRemoteUrl: vi
        .fn()
        .mockResolvedValue('https://github.com/acme/app.git'),
    } as unknown as GitService
    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      const error = new Error('Command timed out') as Error & {
        killed: boolean
        signal: NodeJS.Signals
      }
      error.killed = true
      error.signal = 'SIGTERM'
      callback?.(error, '', '')
      return null as never
    })

    const service = new PullRequestService(db, git)
    const result = await service.refreshForSession('session-1')

    expect(execFileMock).toHaveBeenCalledWith(
      'gh',
      expect.any(Array),
      expect.objectContaining({ cwd: '/repo-ws', timeout: 15_000 }),
      expect.any(Function),
    )
    expect(result).toMatchObject({
      lookupStatus: 'error',
      state: 'unknown',
      error: 'GitHub CLI timed out while looking up pull request.',
    })
  })

  it('lists cached pull requests for a project in one read', () => {
    const db = getDatabase()
    db.prepare(
      `INSERT INTO projects (id, name, repository_path, settings)
       VALUES (?, ?, ?, ?)`,
    ).run('project-1', 'Project', '/repo', '{}')
    db.prepare(
      `INSERT INTO workspaces (id, project_id, branch_name, path, type)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('workspace-1', 'project-1', 'feature-x', '/repo-ws', 'worktree')
    db.prepare(
      `INSERT INTO workspace_pull_requests (
         id,
         project_id,
         workspace_id,
         provider,
         lookup_status,
         state,
         is_draft,
         last_checked_at,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'pr-1',
      'project-1',
      'workspace-1',
      'github',
      'found',
      'open',
      0,
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
    )

    const service = new PullRequestService(db, {} as GitService)

    expect(service.listByProjectId('project-1')).toMatchObject([
      {
        id: 'pr-1',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        lookupStatus: 'found',
        state: 'open',
      },
    ])
  })
})
