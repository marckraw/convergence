import { describe, expect, it, vi } from 'vitest'
import type { AppSettingsService } from '../app-settings/app-settings.service'
import { NO_MID_RUN_INPUT_CAPABILITY } from '../provider/provider-descriptor.pure'
import type { ProviderRegistry } from '../provider/provider-registry'
import type {
  OneShotInput,
  OneShotResult,
  Provider,
} from '../provider/provider.types'
import type { SessionService } from '../session/session.service'
import type { ConversationItem } from '../session/conversation-item.types'
import type { SessionSummary } from '../session/session.types'
import type { SpaceService } from './space.service'
import {
  SpaceSynthesisError,
  SpaceSynthesisService,
} from './space-synthesis.service'
import type { Space } from './space.types'

const space: Space = {
  id: 'i1',
  title: 'Agent-native spaces',
  status: 'exploring',
  attention: 'none',
  brief: 'Initial notes',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const session: SessionSummary = {
  id: 's1',
  contextKind: 'project',
  projectId: 'p1',
  workspaceId: 'w1',
  providerId: 'codex',
  model: 'gpt-5.4',
  effort: 'high',
  name: 'Implement synthesis',
  status: 'completed',
  attention: 'finished',
  activity: null,
  contextWindow: null,
  workingDirectory: '/tmp/repo',
  archivedAt: null,
  parentSessionId: null,
  forkStrategy: null,
  primarySurface: 'conversation',
  continuationToken: null,
  lastSequence: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const conversation: ConversationItem[] = [
  {
    id: 'c1',
    sessionId: 's1',
    sequence: 1,
    turnId: 'turn-1',
    kind: 'message',
    state: 'complete',
    actor: 'user',
    text: 'We decided to keep suggestions transient.',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    providerMeta: {
      providerId: 'codex',
      providerItemId: null,
      providerEventType: 'user',
    },
  },
]

const validResponse = JSON.stringify({
  brief: 'Synthesized notes',
  decisions: ['Keep suggestions transient.'],
  open_questions: [],
  next_action: 'Save accepted notes.',
  artifacts: [],
})

function setup(
  input: {
    oneShotTexts?: string[]
    providerAvailable?: boolean
    fallbackProviderAvailable?: boolean
  } = {},
) {
  const oneShotTexts = input.oneShotTexts ?? [validResponse]
  const providerAvailable = input.providerAvailable ?? true
  const fallbackProviderAvailable = input.fallbackProviderAvailable ?? false
  const spaces = {
    getById: vi.fn(() => space),
    listAttempts: vi.fn(() => [
      {
        id: 'a1',
        spaceId: 'i1',
        sessionId: 's1',
        role: 'seed',
        isPrimary: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]),
    listArtifacts: vi.fn(() => []),
  } as unknown as SpaceService

  const sessions = {
    getSummaryById: vi.fn((id: string) => (id === 's1' ? session : null)),
    getConversation: vi.fn(() => conversation),
  } as unknown as SessionService

  let call = 0
  const oneShot = vi.fn(
    async (_input: OneShotInput): Promise<OneShotResult> => {
      const text = oneShotTexts[call] ?? oneShotTexts[oneShotTexts.length - 1]
      call += 1
      return { text }
    },
  )
  const provider: Provider = {
    id: 'codex',
    name: 'Codex',
    supportsContinuation: true,
    describe: async () => ({
      id: 'codex',
      name: 'Codex',
      vendorLabel: 'OpenAI',
      kind: 'conversation',
      supportsContinuation: true,
      defaultModelId: 'gpt-5.4',
      modelOptions: [],
      attachments: {
        supportsImage: false,
        supportsPdf: false,
        supportsText: false,
        maxImageBytes: 0,
        maxPdfBytes: 0,
        maxTextBytes: 0,
        maxTotalBytes: 0,
      },
      midRunInput: NO_MID_RUN_INPUT_CAPABILITY,
    }),
    start: vi.fn(),
    oneShot,
  } as unknown as Provider
  const fallbackOneShot = vi.fn(
    async (_input: OneShotInput): Promise<OneShotResult> => ({
      text: validResponse,
    }),
  )
  const fallbackProvider: Provider = {
    ...provider,
    id: 'claude-code',
    name: 'Claude Code',
    oneShot: fallbackOneShot,
  }

  const providers = {
    get: vi.fn((id: string) =>
      providerAvailable && id === 'codex' ? provider : undefined,
    ),
    getAll: vi.fn(() =>
      fallbackProviderAvailable
        ? [fallbackProvider]
        : providerAvailable
          ? [provider]
          : [],
    ),
  } as unknown as ProviderRegistry

  const appSettings = {
    resolveExtractionModel: vi.fn(async () => 'gpt-5.4'),
  } as unknown as AppSettingsService

  return {
    service: new SpaceSynthesisService({
      spaces,
      sessions,
      providers,
      appSettings,
    }),
    oneShot,
    fallbackOneShot,
    appSettings,
  }
}

describe('SpaceSynthesisService', () => {
  it('runs synthesis through provider oneShot', async () => {
    const { service, oneShot, appSettings } = setup()

    const result = await service.synthesize('i1', 'request-1')

    expect(result.brief).toBe('Synthesized notes')
    expect(result.decisions).toEqual(['Keep suggestions transient.'])
    expect(appSettings.resolveExtractionModel).toHaveBeenCalledWith('codex')
    expect(oneShot).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'gpt-5.4',
        workingDirectory: '/tmp/repo',
        requestId: 'request-1',
      }),
    )
    expect(oneShot.mock.calls[0][0].prompt).toContain('Initial notes')
    expect(oneShot.mock.calls[0][0].prompt).toContain(
      'We decided to keep suggestions transient.',
    )
  })

  it('retries once when provider artifact is invalid', async () => {
    const { service, oneShot } = setup({
      oneShotTexts: ['not json', validResponse],
    })

    const result = await service.synthesize('i1')

    expect(result.brief).toBe('Synthesized notes')
    expect(oneShot).toHaveBeenCalledTimes(2)
    expect(oneShot.mock.calls[1][0].prompt).toContain(
      'Your previous artifact was not valid JSON',
    )
  })

  it('uses any configured one-shot provider when the Attempt provider is unavailable', async () => {
    const { service, fallbackOneShot, appSettings } = setup({
      providerAvailable: false,
      fallbackProviderAvailable: true,
    })

    const result = await service.synthesize('i1')

    expect(result.brief).toBe('Synthesized notes')
    expect(fallbackOneShot).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'gpt-5.4',
        workingDirectory: '/tmp/repo',
      }),
    )
    expect(appSettings.resolveExtractionModel).toHaveBeenCalledWith(
      'claude-code',
    )
  })

  it('fails when no valid provider-backed Attempt exists', async () => {
    const { service } = setup({ providerAvailable: false })

    await expect(service.synthesize('i1')).rejects.toThrow(SpaceSynthesisError)
  })
})
