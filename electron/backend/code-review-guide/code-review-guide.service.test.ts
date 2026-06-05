import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettingsService } from '../app-settings/app-settings.service'
import type { CodeReviewService } from '../code-review/code-review.service'
import { closeDatabase, getDatabase } from '../database/database'
import type { ProviderRegistry } from '../provider/provider-registry'
import type { Provider } from '../provider/provider.types'
import type { SessionService } from '../session/session.service'
import {
  CodeReviewGuideGenerationError,
  CodeReviewGuideService,
} from './code-review-guide.service'
import type { CodeReviewGuideGenerateRequest } from './code-review-guide.types'
import type { RemoteCodeReviewGuideGenerateResult } from './remote-daemon-guide.types'

describe('CodeReviewGuideService', () => {
  let db: Database.Database
  let service: CodeReviewGuideService

  beforeEach(() => {
    db = getDatabase()
    db.prepare(
      `INSERT INTO projects (id, name, repository_path)
       VALUES ('project-1', 'Project', '/repo')`,
    ).run()
    service = new CodeReviewGuideService(db)
  })

  afterEach(() => {
    closeDatabase()
  })

  it('returns null when no guide exists for the cache identity', () => {
    expect(service.getGuide(makeInput())).toBeNull()
  })

  it('generates, persists, and reloads deterministic guides', async () => {
    const input = makeInput()
    const generated = await service.generateGuide(input)
    const loaded = service.getGuide(input)

    expect(generated.status).toBe('ready')
    expect(generated.generatedBy).toBe('deterministic')
    expect(generated.sections.map((section) => section.id)).toEqual([
      'renderer-state',
      'docs-and-config',
    ])
    expect(loaded).toEqual(generated)
  })

  it('misses the cache when the cache identity changes', async () => {
    const input = makeInput()
    await service.generateGuide(input)

    expect(
      service.getGuide({
        ...input,
        cacheIdentity: {
          ...input.cacheIdentity,
          workingTreeVersionToken: 'wt-2',
        },
      }),
    ).toBeNull()
  })

  it('refreshes an existing guide row instead of creating duplicates', async () => {
    const input = makeInput()
    const first = await service.generateGuide(input)
    const refreshed = await service.refreshGuide(input)

    expect(refreshed.id).toBe(first.id)
    expect(service.getGuide(input)?.sections).toEqual(refreshed.sections)
  })

  it('generates guides through the selected session provider', async () => {
    const input = makeInput()
    const oneShot = vi.fn(async () => ({
      text: JSON.stringify({
        overview: 'Review the renderer model before docs.',
        sections: [
          {
            id: 'state-contract',
            title: 'State Contract',
            summary: 'Model changes that define guide state.',
            narrative: 'Start with the entity model before checking docs.',
            risk_level: 'medium',
            risk_rationale:
              'Shared renderer state can affect multiple review UI flows.',
            checklist: ['Confirm the view state is serializable.'],
            files: [
              {
                path: 'src/entities/code-review/code-review.model.ts',
                reason: 'Defines the selected review view.',
                hunk_hints: ['selectedView transition'],
              },
            ],
          },
          {
            id: 'docs',
            title: 'Docs',
            summary: 'Spec update for the guide mode.',
            narrative: 'Confirm the documented behavior matches the UI.',
            risk_level: 'low',
            risk_rationale: 'Documentation does not directly alter runtime.',
            checklist: ['Check implementation language.'],
            files: [
              {
                path: 'docs/specs/code-review-guide-mode.md',
                reason: 'Captures the intended product behavior.',
                hunk_hints: [],
              },
            ],
          },
        ],
      }),
    }))
    const provider = makeProvider(oneShot)
    const providers = {
      get: vi.fn((id: string) => (id === 'claude-code' ? provider : undefined)),
      getAll: vi.fn(() => [provider]),
    } as unknown as ProviderRegistry
    const appSettings = {
      getAppSettings: vi.fn(async () => ({
        guidedReviewBackend: 'local',
      })),
      resolveGuidedReviewModel: vi.fn(async () => ({
        modelId: 'opus',
        effortId: 'medium',
      })),
    } as unknown as AppSettingsService
    const sessions = {
      getSummaryById: vi.fn(() => ({
        providerId: 'claude-code',
        workingDirectory: '/repo/worktree',
      })),
    } as unknown as SessionService
    const codeReview = {
      getFilePatch: vi.fn(async ({ filePath }: { filePath: string }) =>
        filePath.endsWith('.ts')
          ? '@@ -1 +1 @@\n-selectedView: working-tree\n+selectedView: guide'
          : '@@ -1 +1 @@\n+# Guide mode',
      ),
    } as unknown as CodeReviewService

    const agentService = new CodeReviewGuideService(db, {
      providers,
      appSettings,
      sessions,
      codeReview,
    })

    const generated = await agentService.generateGuide(input)

    expect(generated.status).toBe('ready')
    expect(generated.generatedBy).toBe('agent')
    expect(generated.sections.map((section) => section.id)).toEqual([
      'state-contract',
      'docs',
    ])
    expect(generated.sections[0].files[0]).toMatchObject({
      path: 'src/entities/code-review/code-review.model.ts',
      status: 'M',
      hunkHints: ['selectedView transition'],
    })
    expect(generated.sections[0].riskRationale).toBe(
      'Shared renderer state can affect multiple review UI flows.',
    )
    expect(appSettings.resolveGuidedReviewModel).toHaveBeenCalledWith(
      'claude-code',
    )
    expect(codeReview.getFilePatch).toHaveBeenCalledTimes(2)
    expect(oneShot).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'opus',
        effort: 'medium',
        timeoutMs: 600_000,
        workingDirectory: '/repo/worktree',
        prompt: expect.stringContaining('selectedView: guide'),
      }),
    )
  })

  it('routes remote pull request guide generation through the daemon and persists locally', async () => {
    const input = makeRemoteInput()
    const oneShot = vi.fn()
    const provider = makeProvider(oneShot, 'codex')
    const remoteDaemon = {
      resolveGenerationModel: vi.fn(async () => 'gpt-5.4'),
      generateGuide: vi.fn(async () =>
        makeRemoteGuideResult('Review daemon output first.', 'remote-runtime'),
      ),
    }
    const agentService = new CodeReviewGuideService(db, {
      providers: {
        get: vi.fn(),
        getAll: vi.fn(() => [provider]),
      } as unknown as ProviderRegistry,
      appSettings: {
        getAppSettings: vi.fn(async () => ({
          guidedReviewBackend: 'remote',
        })),
        resolveGuidedReviewModel: vi.fn(async () => ({
          modelId: 'gpt-5.5',
          effortId: 'medium',
        })),
      } as unknown as AppSettingsService,
      sessions: {
        getSummaryById: vi.fn(),
      } as unknown as SessionService,
      codeReview: {
        getFilePatch: vi.fn(),
      } as unknown as CodeReviewService,
      remoteDaemon,
    })

    const generated = await agentService.generateGuide(input)
    const reloaded = agentService.getGuide(input)

    expect(remoteDaemon.resolveGenerationModel).toHaveBeenCalledWith({
      provider: 'codex',
      preferredModel: 'gpt-5.5',
    })
    expect(remoteDaemon.generateGuide).toHaveBeenCalledWith({
      repository: 'https://github.com/acme/project',
      pullRequestNumber: 42,
      provider: 'codex',
      model: 'gpt-5.4',
      effort: 'medium',
      force: false,
    })
    expect(oneShot).not.toHaveBeenCalled()
    expect(generated).toMatchObject({
      projectId: 'project-1',
      targetId: 'pull-request:github:acme/project#42',
      mode: 'working-tree',
      status: 'ready',
      generatedBy: 'agent',
      overview: 'Review daemon output first.',
    })
    expect(generated.cacheIdentity).toEqual(input.cacheIdentity)
    expect(generated.sections.map((section) => section.id)).toEqual([
      'remote-runtime',
      'other-changes',
    ])
    expect(reloaded).toEqual(generated)
    expect(remoteDaemon.generateGuide).toHaveBeenCalledTimes(1)
  })

  it('forces daemon regeneration on refresh and updates the same local row', async () => {
    const input = makeRemoteInput()
    const provider = makeProvider(vi.fn(), 'codex')
    const remoteDaemon = {
      resolveGenerationModel: vi.fn(async () => 'gpt-5.4'),
      generateGuide: vi
        .fn()
        .mockResolvedValueOnce(makeRemoteGuideResult('First daemon guide.'))
        .mockResolvedValueOnce(
          makeRemoteGuideResult('Refreshed daemon guide.'),
        ),
    }
    const agentService = new CodeReviewGuideService(db, {
      providers: {
        get: vi.fn(),
        getAll: vi.fn(() => [provider]),
      } as unknown as ProviderRegistry,
      appSettings: makeRemoteAppSettings(),
      sessions: {
        getSummaryById: vi.fn(),
      } as unknown as SessionService,
      codeReview: {
        getFilePatch: vi.fn(),
      } as unknown as CodeReviewService,
      remoteDaemon,
    })

    const first = await agentService.generateGuide(input)
    const refreshed = await agentService.refreshGuide(input)

    expect(refreshed.id).toBe(first.id)
    expect(refreshed.overview).toBe('Refreshed daemon guide.')
    expect(remoteDaemon.generateGuide).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ force: false }),
    )
    expect(remoteDaemon.generateGuide).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ force: true }),
    )
    expect(agentService.getGuide(input)).toEqual(refreshed)
  })

  it('keeps local targets on local generation when the remote backend is selected', async () => {
    const input = makeInput()
    const oneShot = vi.fn(async () => ({
      text: JSON.stringify({
        overview: 'Local target still uses local agent.',
        sections: [
          {
            id: 'local',
            title: 'Local',
            summary: 'Local target section.',
            narrative: 'Review local changes.',
            risk_level: 'medium',
            risk_rationale: 'Local worktree review stays inside Convergence.',
            checklist: ['Check local patch.'],
            files: [
              {
                path: 'src/entities/code-review/code-review.model.ts',
                reason: 'Local file.',
                hunk_hints: [],
              },
            ],
          },
        ],
      }),
    }))
    const remoteDaemon = {
      resolveGenerationModel: vi.fn(),
      generateGuide: vi.fn(),
    }
    const agentService = new CodeReviewGuideService(db, {
      providers: {
        get: vi.fn((id: string) =>
          id === 'claude-code' ? makeProvider(oneShot) : undefined,
        ),
        getAll: vi.fn(() => [makeProvider(oneShot)]),
      } as unknown as ProviderRegistry,
      appSettings: makeRemoteAppSettings('opus'),
      sessions: {
        getSummaryById: vi.fn(() => ({
          providerId: 'claude-code',
          workingDirectory: '/repo/worktree',
        })),
      } as unknown as SessionService,
      codeReview: {
        getFilePatch: vi.fn(async () => '@@ -1 +1 @@\n-old\n+new'),
      } as unknown as CodeReviewService,
      remoteDaemon,
    })

    const generated = await agentService.generateGuide(input)

    expect(remoteDaemon.generateGuide).not.toHaveBeenCalled()
    expect(oneShot).toHaveBeenCalled()
    expect(generated.overview).toBe('Local target still uses local agent.')
  })

  it('persists a failed local guide when daemon generation fails', async () => {
    const input = makeRemoteInput()
    const agentService = new CodeReviewGuideService(db, {
      providers: {
        get: vi.fn(),
        getAll: vi.fn(() => [makeProvider(vi.fn(), 'codex')]),
      } as unknown as ProviderRegistry,
      appSettings: makeRemoteAppSettings(),
      sessions: {
        getSummaryById: vi.fn(),
      } as unknown as SessionService,
      codeReview: {
        getFilePatch: vi.fn(),
      } as unknown as CodeReviewService,
      remoteDaemon: {
        resolveGenerationModel: vi.fn(async () => 'gpt-5.4'),
        generateGuide: vi.fn(async () => {
          throw new Error('daemon unavailable')
        }),
      },
    })

    await expect(agentService.generateGuide(input)).rejects.toThrow(
      CodeReviewGuideGenerationError,
    )

    expect(agentService.getGuide(input)).toMatchObject({
      status: 'failed',
      generatedBy: 'agent',
      error: 'Remote guide generation failed: daemon unavailable',
      sections: [],
    })
  })

  it('fails clearly for malformed remote pull request targets instead of falling back', async () => {
    const input = makeRemoteInput({
      target: {
        pullRequestUrl: null,
      },
    })
    const remoteDaemon = {
      resolveGenerationModel: vi.fn(),
      generateGuide: vi.fn(),
    }
    const oneShot = vi.fn()
    const agentService = new CodeReviewGuideService(db, {
      providers: {
        get: vi.fn(),
        getAll: vi.fn(() => [makeProvider(oneShot, 'codex')]),
      } as unknown as ProviderRegistry,
      appSettings: makeRemoteAppSettings(),
      sessions: {
        getSummaryById: vi.fn(),
      } as unknown as SessionService,
      codeReview: {
        getFilePatch: vi.fn(),
      } as unknown as CodeReviewService,
      remoteDaemon,
    })

    await expect(agentService.generateGuide(input)).rejects.toThrow(
      'Remote guide generation requires a GitHub pull request URL.',
    )
    expect(remoteDaemon.generateGuide).not.toHaveBeenCalled()
    expect(oneShot).not.toHaveBeenCalled()
    expect(agentService.getGuide(input)?.status).toBe('failed')
  })
})

function makeProvider(
  oneShot: Provider['oneShot'],
  id = 'claude-code',
): Provider {
  return {
    id,
    name: id,
    supportsContinuation: true,
    describe: async () => {
      throw new Error('not used')
    },
    start: () => {
      throw new Error('not used')
    },
    oneShot,
  }
}

function makeRemoteAppSettings(modelId = 'gpt-5.5'): AppSettingsService {
  return {
    getAppSettings: vi.fn(async () => ({
      guidedReviewBackend: 'remote',
    })),
    resolveGuidedReviewModel: vi.fn(async () => ({
      modelId,
      effortId: 'medium',
    })),
  } as unknown as AppSettingsService
}

function makeInput(): CodeReviewGuideGenerateRequest {
  return {
    target: {
      id: 'session:session-1',
      projectId: 'project-1',
      projectName: 'Project',
      repositoryPath: '/repo',
      workspaceId: null,
      sessionId: 'session-1',
      sessionName: 'Session',
      branchName: 'feature',
      pullRequestId: null,
      pullRequestNumber: null,
      pullRequestLabel: null,
      pullRequestUrl: null,
      pullRequestBaseBranch: null,
      pullRequestHeadBranch: null,
      source: 'session',
      updatedAt: null,
      status: {
        workingTreeFileCount: 2,
        workingTreeStatusCounts: { M: 1, A: 1 },
        error: null,
      },
    },
    mode: 'working-tree',
    cacheIdentity: {
      comparisonRef: null,
      comparisonPoint: null,
      workingTreeVersionToken: 'wt-1',
    },
    files: [
      { file: 'src/entities/code-review/code-review.model.ts', status: 'M' },
      { file: 'docs/specs/code-review-guide-mode.md', status: 'A' },
    ],
  }
}

function makeRemoteInput(
  overrides: {
    target?: Partial<CodeReviewGuideGenerateRequest['target']>
  } = {},
): CodeReviewGuideGenerateRequest {
  return {
    target: {
      id: 'pull-request:github:acme/project#42',
      projectId: 'project-1',
      projectName: 'Project',
      repositoryPath: '/repo',
      workspaceId: null,
      sessionId: null,
      sessionName: null,
      branchName: 'remote-feature',
      pullRequestId: null,
      pullRequestNumber: 42,
      pullRequestLabel: '#42 Add remote review',
      pullRequestUrl: 'https://github.com/acme/project/pull/42',
      pullRequestBaseBranch: 'main',
      pullRequestHeadBranch: 'remote-feature',
      source: 'pull-request',
      updatedAt: null,
      status: {
        workingTreeFileCount: 2,
        workingTreeStatusCounts: {},
        error: null,
      },
      ...overrides.target,
    },
    mode: 'working-tree',
    cacheIdentity: {
      comparisonRef: 'refs/remotes/origin/main',
      comparisonPoint: 'base-sha',
      workingTreeVersionToken: 'pr-42:base-sha',
    },
    files: [
      { file: 'remote.ts', status: 'M' },
      { file: 'docs/remote.md', status: 'A' },
    ],
  }
}

function makeRemoteGuideResult(
  overview: string,
  sectionId = 'remote',
): RemoteCodeReviewGuideGenerateResult {
  const cacheIdentity = {
    comparisonRef: 'refs/remotes/origin/main',
    comparisonPoint: 'base-sha',
    workingTreeVersionToken: 'pr-42:base-sha',
  }
  const pullRequest = {
    provider: 'github' as const,
    repositoryOwner: 'acme',
    repositoryName: 'project',
    number: 42,
    title: 'Add remote review',
    url: 'https://github.com/acme/project/pull/42',
    state: 'open' as const,
    baseBranch: 'main',
    headBranch: 'remote-feature',
    headRepositoryOwner: null,
    headRepositoryName: null,
  }
  const summary = {
    cacheIdentity,
    files: [
      {
        status: 'M',
        file: 'remote.ts',
      },
    ],
  }
  const sections = [
    {
      id: sectionId,
      title: 'Remote',
      summary: 'Remote guide section.',
      narrative: 'Review remote output.',
      riskLevel: 'medium' as const,
      riskRationale: 'Remote guide updates persisted review state.',
      checklist: ['Check persisted row.'],
      files: [
        {
          path: 'remote.ts',
          status: 'M' as const,
          reason: 'Remote file.',
          hunkHints: [],
        },
      ],
    },
  ]

  return {
    pullRequest,
    summary,
    guide: {
      id: 'remote-guide-1',
      repository: 'https://github.com/acme/project',
      pullRequestNumber: 42,
      targetId: 'github:acme/project#42',
      mode: 'pull-request',
      cacheIdentity,
      provider: 'codex',
      model: 'gpt-5.4',
      effort: 'medium',
      status: 'ready',
      overview,
      generatedBy: 'agent',
      sections,
      error: null,
      pullRequest,
      summary,
      createdAt: '2026-06-04T10:00:00.000Z',
      updatedAt: '2026-06-04T10:00:00.000Z',
    },
    guideDraft: {
      overview,
      generatedBy: 'agent',
      sections,
    },
  }
}
