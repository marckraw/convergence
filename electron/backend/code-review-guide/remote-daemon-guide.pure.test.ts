import { describe, expect, it } from 'vitest'
import {
  buildRemoteCodeReviewGuideRequestBody,
  buildRemoteDaemonUrl,
  mapProviderIdToRemoteDaemonProviderId,
  mapRemoteGuideToCodeReviewGuideDraft,
  parseRemoteCodeReviewGuideGenerateResult,
  resolveRemoteCodeReviewGuideTarget,
  resolveRemoteDaemonGenerationModel,
  resolveRemoteDaemonBaseUrl,
} from './remote-daemon-guide.pure'

describe('remote daemon guide pure helpers', () => {
  it('normalizes HTTP(S) daemon base URLs and strips query/hash/trailing slash', () => {
    expect(
      resolveRemoteDaemonBaseUrl(
        ' https://daemon.example.com/root/?debug=1#top ',
      ),
    ).toEqual({
      ok: true,
      baseUrl: 'https://daemon.example.com/root',
    })
    expect(resolveRemoteDaemonBaseUrl('http://127.0.0.1:7800/')).toEqual({
      ok: true,
      baseUrl: 'http://127.0.0.1:7800',
    })
  })

  it('classifies missing and invalid daemon base URLs', () => {
    expect(resolveRemoteDaemonBaseUrl('')).toEqual({
      ok: false,
      reason: 'missing',
    })
    expect(resolveRemoteDaemonBaseUrl('file:///tmp/daemon')).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })

  it('builds endpoint URLs under the configured daemon base path', () => {
    expect(
      buildRemoteDaemonUrl('https://daemon.example.com/root', '/v0/meta'),
    ).toBe('https://daemon.example.com/root/v0/meta')
  })

  it('rejects unsafe endpoint paths', () => {
    expect(() =>
      buildRemoteDaemonUrl('https://daemon.example.com', 'v0/meta'),
    ).toThrow('Remote daemon endpoint path must be absolute.')
    expect(() =>
      buildRemoteDaemonUrl('https://daemon.example.com', '//evil.test/meta'),
    ).toThrow('Remote daemon endpoint path must be absolute.')
  })

  it('builds the daemon guide generation request body', () => {
    expect(
      buildRemoteCodeReviewGuideRequestBody({
        repository: ' https://github.com/org/repo ',
        pullRequestNumber: 42,
        provider: 'codex',
        model: ' gpt-5.3-codex ',
        effort: ' high ',
        force: true,
      }),
    ).toEqual({
      source: {
        repository: 'https://github.com/org/repo',
        pullRequest: { number: 42 },
      },
      provider: 'codex',
      model: 'gpt-5.3-codex',
      effort: 'high',
      force: true,
    })
  })

  it('maps Convergence provider ids to daemon provider ids', () => {
    expect(mapProviderIdToRemoteDaemonProviderId('claude-code')).toBe('claude')
    expect(mapProviderIdToRemoteDaemonProviderId('codex')).toBe('codex')
    expect(mapProviderIdToRemoteDaemonProviderId('cursor')).toBe('cursor')
    expect(mapProviderIdToRemoteDaemonProviderId('antigravity')).toBeNull()
  })

  it('resolves remote GitHub pull request targets for daemon generation', () => {
    expect(resolveRemoteCodeReviewGuideTarget(makeRemoteTarget())).toEqual({
      ok: true,
      repository: 'https://github.com/org/repo',
      pullRequestNumber: 42,
    })
  })

  it('does not classify local or malformed pull request targets as daemon-ready', () => {
    expect(
      resolveRemoteCodeReviewGuideTarget(
        makeRemoteTarget({ workspaceId: 'workspace-1' }),
      ),
    ).toEqual({
      ok: false,
      reason: 'not-remote-pull-request',
    })
    expect(
      resolveRemoteCodeReviewGuideTarget(
        makeRemoteTarget({ pullRequestUrl: null }),
      ),
    ).toEqual({
      ok: false,
      reason: 'missing-pull-request-url',
    })
    expect(
      resolveRemoteCodeReviewGuideTarget(
        makeRemoteTarget({
          pullRequestUrl: 'https://gitlab.com/org/repo/-/merge_requests/42',
        }),
      ),
    ).toEqual({
      ok: false,
      reason: 'unsupported-pull-request-url',
    })
  })

  it('keeps preferred daemon models when the provider advertises them', () => {
    expect(
      resolveRemoteDaemonGenerationModel({
        meta: makeMeta(),
        provider: 'codex',
        preferredModel: 'gpt-5.3-codex',
      }),
    ).toEqual({
      ok: true,
      model: 'gpt-5.3-codex',
      changed: false,
    })
  })

  it('falls back to the preferred remote provider model when the local default is unavailable', () => {
    expect(
      resolveRemoteDaemonGenerationModel({
        meta: makeMeta(),
        provider: 'codex',
        preferredModel: 'gpt-5.5',
      }),
    ).toEqual({
      ok: true,
      model: 'gpt-5.4',
      changed: true,
    })
  })

  it('rejects unavailable daemon providers before generation', () => {
    expect(
      resolveRemoteDaemonGenerationModel({
        meta: makeMeta(),
        provider: 'cursor',
        preferredModel: 'auto',
      }),
    ).toEqual({
      ok: false,
      reason: 'provider-unavailable',
    })
  })

  it('parses a daemon guide response into typed guide content', () => {
    const result = parseRemoteCodeReviewGuideGenerateResult(makeGuideResult())

    expect(result.guide.provider).toBe('codex')
    expect(result.guide.sections[0]).toMatchObject({
      id: 'runtime',
      riskLevel: 'high',
      files: [
        {
          path: 'electron/main/ipc.ts',
          status: 'M',
          hunkHints: ['IPC registration'],
        },
      ],
    })
    expect(mapRemoteGuideToCodeReviewGuideDraft(result.guide)).toEqual({
      overview: 'Review backend boundary first.',
      generatedBy: 'agent',
      sections: result.guide.sections,
    })
  })

  it('rejects malformed daemon guide responses', () => {
    const malformed = makeGuideResult()
    malformed.guide.sections[0].riskLevel = 'critical'

    expect(() => parseRemoteCodeReviewGuideGenerateResult(malformed)).toThrow(
      'Invalid sections.0.riskLevel',
    )
  })
})

function makeGuideResult() {
  const cacheIdentity = {
    comparisonRef: 'refs/remotes/origin/main',
    comparisonPoint: 'abc123',
    workingTreeVersionToken: 'pr-42:abc123',
  }
  const pullRequest = {
    provider: 'github',
    repositoryOwner: 'org',
    repositoryName: 'repo',
    number: 42,
    title: 'Add remote review',
    url: 'https://github.com/org/repo/pull/42',
    state: 'open',
    baseBranch: 'main',
    headBranch: 'feature',
    headRepositoryOwner: null,
    headRepositoryName: null,
  }
  const summary = {
    cacheIdentity,
    files: [{ file: 'electron/main/ipc.ts', status: 'M' }],
  }
  const guide = {
    id: 'guide-1',
    repository: 'https://github.com/org/repo',
    pullRequestNumber: 42,
    targetId: 'github:org/repo#42',
    mode: 'pull-request',
    cacheIdentity,
    provider: 'codex',
    model: 'gpt-5.3-codex',
    effort: 'high',
    status: 'ready',
    overview: 'Review backend boundary first.',
    generatedBy: 'agent',
    sections: [
      {
        id: 'runtime',
        title: 'Runtime Boundary',
        summary: 'IPC and daemon client changes.',
        narrative: 'Start with the backend contract.',
        riskLevel: 'high',
        riskRationale: 'IPC affects renderer/backend trust boundaries.',
        checklist: ['Confirm auth token stays in the backend.'],
        files: [
          {
            path: 'electron/main/ipc.ts',
            status: 'M',
            reason: 'Registers the connection test.',
            hunkHints: ['IPC registration'],
          },
        ],
      },
    ],
    error: null,
    pullRequest,
    summary,
    createdAt: '2026-06-04T10:00:00.000Z',
    updatedAt: '2026-06-04T10:00:00.000Z',
  }

  return {
    pullRequest,
    summary,
    guide,
  }
}

function makeMeta() {
  return {
    providers: [
      {
        id: 'codex',
        available: true,
        authenticated: true,
        models: [
          { slug: 'gpt-5.4', label: 'GPT-5.4' },
          { slug: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
        ],
      },
      {
        id: 'cursor',
        available: false,
        authenticated: false,
        models: [],
      },
    ],
  }
}

function makeRemoteTarget(
  overrides: Partial<
    Parameters<typeof resolveRemoteCodeReviewGuideTarget>[0]
  > = {},
): Parameters<typeof resolveRemoteCodeReviewGuideTarget>[0] {
  return {
    id: 'pull-request:github:org/repo#42',
    projectId: 'project-1',
    projectName: 'Project',
    repositoryPath: '/repo',
    workspaceId: null,
    sessionId: null,
    sessionName: null,
    branchName: 'feature',
    pullRequestId: null,
    pullRequestNumber: 42,
    pullRequestLabel: '#42 Add remote review',
    pullRequestUrl: 'https://github.com/org/repo/pull/42',
    pullRequestBaseBranch: 'main',
    pullRequestHeadBranch: 'feature',
    source: 'pull-request',
    updatedAt: null,
    status: {
      workingTreeFileCount: 1,
      workingTreeStatusCounts: {},
      error: null,
    },
    ...overrides,
  }
}
