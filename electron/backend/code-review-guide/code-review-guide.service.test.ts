import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettingsService } from '../app-settings/app-settings.service'
import type { CodeReviewService } from '../code-review/code-review.service'
import { closeDatabase, getDatabase } from '../database/database'
import type { ProviderRegistry } from '../provider/provider-registry'
import type { Provider } from '../provider/provider.types'
import type { SessionService } from '../session/session.service'
import { CodeReviewGuideService } from './code-review-guide.service'
import type { CodeReviewGuideGenerateRequest } from './code-review-guide.types'

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
})

function makeProvider(oneShot: Provider['oneShot']): Provider {
  return {
    id: 'claude-code',
    name: 'Claude Code',
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
