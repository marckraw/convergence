import { sessionSummaryFromRow } from '../session/session.types'
import type { SessionRow } from '../database/database.types'
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
    await service.refreshForSession('session-1')

    expect(execFileMock).toHaveBeenCalledWith(
      'gh',
      expect.any(Array),
      expect.objectContaining({ cwd: '/repo-ws', timeout: 15_000 }),
      expect.any(Function),
    )
    expect(service.getByWorkspaceId('workspace-1')).toMatchObject({
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

  it('lists open pull requests for a project through GitHub CLI', async () => {
    const db = getDatabase()
    db.prepare(
      `INSERT INTO projects (id, name, repository_path, settings)
       VALUES (?, ?, ?, ?)`,
    ).run('project-1', 'Project', '/repo', '{}')

    const git = {
      getRemoteUrl: vi
        .fn()
        .mockResolvedValue('https://github.com/acme/app.git'),
    } as unknown as GitService
    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      callback?.(
        null,
        JSON.stringify([
          {
            number: 42,
            title: 'Remote PR',
            url: 'https://github.com/acme/app/pull/42',
            state: 'OPEN',
            isDraft: false,
            headRefName: 'feature',
            baseRefName: 'main',
            changedFiles: 7,
            updatedAt: '2026-01-05T00:00:00Z',
          },
        ]),
        '',
      )
      return null as never
    })

    const service = new PullRequestService(db, git)

    await expect(service.listOpenByProjectId('project-1')).resolves.toEqual([
      {
        projectId: 'project-1',
        provider: 'github',
        state: 'open',
        repositoryOwner: 'acme',
        repositoryName: 'app',
        number: 42,
        title: 'Remote PR',
        url: 'https://github.com/acme/app/pull/42',
        isDraft: false,
        headBranch: 'feature',
        baseBranch: 'main',
        changedFileCount: 7,
        updatedAt: '2026-01-05T00:00:00Z',
      },
    ])
    expect(execFileMock).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining([
        'pr',
        'list',
        '--repo',
        'acme/app',
        '--state',
        'open',
      ]),
      expect.objectContaining({ cwd: '/repo', timeout: 15_000 }),
      expect.any(Function),
    )
  })

  it('keeps open pull request discovery non-fatal', async () => {
    const db = getDatabase()
    db.prepare(
      `INSERT INTO projects (id, name, repository_path, settings)
       VALUES (?, ?, ?, ?)`,
    ).run('project-1', 'Project', '/repo', '{}')

    const git = {
      getRemoteUrl: vi
        .fn()
        .mockResolvedValue('https://github.com/acme/app.git'),
    } as unknown as GitService
    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      callback?.(new Error('gh failed'), '', 'not logged in')
      return null as never
    })

    const service = new PullRequestService(db, git)

    await expect(service.listOpenByProjectId('project-1')).resolves.toEqual([])
  })
})

describe('session PR fact (MAR-2978)', () => {
  beforeEach(() => {
    execFileMock.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
    closeDatabase()
    resetDatabase()
  })

  function fixture(remote = false) {
    const db = getDatabase()
    db.prepare(
      "INSERT INTO projects (id, name, repository_path, settings) VALUES ('p', 'Project', '/mac/repo', '{}')",
    ).run()
    db.prepare(
      "INSERT INTO workspaces (id, project_id, branch_name, path, type) VALUES ('w', 'p', 'feature/local', '/mac/worktree', 'worktree')",
    ).run()
    db.prepare(
      `INSERT INTO sessions (id, project_id, workspace_id, provider_id, name, working_directory, execution_host, reported_workspace)
      VALUES ('s', 'p', ?, 'codex', 'Horse', ?, ?, ?)`,
    ).run(
      remote ? null : 'w',
      remote ? '/remote/worktree' : '/mac/worktree',
      remote ? 'remote:test' : 'local',
      remote
        ? JSON.stringify({
            mode: 'repository',
            repository: 'https://github.com/acme/app.git',
            branchName: 'agent/horse',
            baseRef: 'master',
          })
        : null,
    )
    const git = {
      getCurrentBranch: vi.fn().mockResolvedValue('wrong-current-branch'),
      getRemoteUrl: vi
        .fn()
        .mockResolvedValue('https://github.com/acme/app.git'),
    } as unknown as GitService
    const service = new PullRequestService(db, git)
    let state = 'OPEN'
    execFileMock.mockImplementation((_file, args, _options, callback) => {
      const head = (args as string[])[(args as string[]).indexOf('--head') + 1]
      callback?.(
        null,
        JSON.stringify([
          {
            number: 42,
            url: 'https://github.com/acme/app/pull/42',
            state,
            isDraft: false,
            headRefName: head,
          },
        ]),
        '',
      )
      return null as never
    })
    return {
      db,
      service,
      git,
      merge: () => {
        state = 'MERGED'
      },
    }
  }

  it.each([false, true])(
    'persists the branch fact for remote=%s (mutation: workspace-only lookup)',
    async (remote) => {
      const { db, service } = fixture(remote)
      const result = await service.refreshForSession('s')
      expect(result?.pullRequest).toMatchObject({
        number: 42,
        state: 'open',
        headBranch: remote ? 'agent/horse' : 'feature/local',
        source: 'gh',
      })
      expect(
        sessionSummaryFromRow(
          db.prepare("SELECT * FROM sessions WHERE id='s'").get() as SessionRow,
        ).pullRequest,
      ).toEqual(result?.pullRequest)
      expect(
        JSON.parse(
          (
            db
              .prepare("SELECT pull_request_json FROM sessions WHERE id='s'")
              .get() as { pull_request_json: string }
          ).pull_request_json,
        ),
      ).toEqual(result?.pullRequest)
      expect(execFileMock).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining([
          '--repo',
          'acme/app',
          '--head',
          remote ? 'agent/horse' : 'feature/local',
        ]),
        expect.objectContaining({
          cwd: remote ? '/mac/repo' : '/mac/worktree',
        }),
        expect.any(Function),
      )
    },
  )

  it('has no PR without a recorded branch (mutation: use checkout HEAD)', async () => {
    const { db, service, git } = fixture()
    db.prepare("UPDATE sessions SET workspace_id=NULL WHERE id='s'").run()
    expect(await service.refreshForSession('s')).toMatchObject({
      pullRequest: null,
      message: 'no branch recorded for this session',
    })
    expect(execFileMock).not.toHaveBeenCalled()
    expect(git.getCurrentBranch).not.toHaveBeenCalled()
  })

  it('polls only open facts and stops after merged (mutation: poll every session)', async () => {
    const { db, service, merge } = fixture()
    await service.refreshForSession('s')
    db.prepare(
      "INSERT INTO sessions (id,project_id,provider_id,name,working_directory) VALUES ('other','p','codex','Other','/mac/repo')",
    ).run()
    const refresh = vi.spyOn(service, 'refreshForSession')
    merge()
    await service.pollOpenSessions()
    expect(refresh.mock.calls).toEqual([['s']])
    expect(service.getForSession('s').pullRequest?.state).toBe('merged')
    await service.pollOpenSessions()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('owns one ten-minute timer, unrefed and stopped (mutation: omit poll timer)', async () => {
    vi.useFakeTimers()
    const { service, merge } = fixture()
    await service.refreshForSession('s')
    const changed = vi.fn()
    const intervals = vi.spyOn(globalThis, 'setInterval')
    service.start(changed)
    service.start(changed)
    expect(vi.getTimerCount()).toBe(1)
    expect(intervals.mock.results[0].value.hasRef()).toBe(false)
    merge()
    await vi.advanceTimersByTimeAsync(599_999)
    expect(changed).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(service.getForSession('s').pullRequest?.state).toBe('merged')
    expect(changed).toHaveBeenCalledExactlyOnceWith('s')
    service.stop()
    expect(vi.getTimerCount()).toBe(0)
    intervals.mockRestore()
  })

  it('says gh not found (mutation: collapse lookup errors)', async () => {
    const { service } = fixture()
    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      callback?.(
        Object.assign(new Error('missing'), { code: 'ENOENT' }),
        '',
        '',
      )
      return null as never
    })
    expect(await service.refreshForSession('s')).toMatchObject({
      pullRequest: null,
      message: 'PR unknown — gh not found',
    })
  })
})
