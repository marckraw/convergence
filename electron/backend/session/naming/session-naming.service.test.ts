import { describe, expect, it, vi } from 'vitest'
import type { AppSettingsService } from '../../app-settings/app-settings.service'
import type { ProviderRegistry } from '../../provider/provider-registry'
import type { Provider } from '../../provider/provider.types'
import type { SessionSummary } from '../session.types'
import { SessionNamingService } from './session-naming.service'

function baseSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 's1',
    contextKind: 'project',
    projectId: 'p1',
    workspaceId: null,
    providerId: 'claude-code',
    model: 'sonnet',
    effort: 'medium',
    name: 'Untitled',
    status: 'idle',
    attention: 'none',
    activity: null,
    contextWindow: null,
    workingDirectory: '/tmp',
    archivedAt: null,
    parentSessionId: null,
    forkStrategy: null,
    primarySurface: 'conversation',
    continuationToken: null,
    lastSequence: 0,
    createdAt: 'now',
    updatedAt: 'now',
    ...overrides,
  }
}

describe('SessionNamingService', () => {
  it('passes the caller request id to the provider one-shot call', async () => {
    const oneShot = vi.fn(async () => ({ text: 'Better Session Name' }))
    const provider: Provider = {
      id: 'claude-code',
      name: 'Claude Code',
      supportsContinuation: false,
      describe: async () => {
        throw new Error('should not be queried')
      },
      start: () => {
        throw new Error('should not be started')
      },
      oneShot,
    }
    const providers = {
      get: vi.fn((id: string) => (id === 'claude-code' ? provider : undefined)),
      register: vi.fn(),
      getAll: vi.fn(() => [provider]),
    } as unknown as ProviderRegistry
    const appSettings = {
      resolveNamingModel: vi.fn(async () => 'fast'),
    } as unknown as AppSettingsService

    const service = new SessionNamingService({ providers, appSettings })

    const result = await service.generateName(
      baseSession(),
      [
        {
          id: 'u1',
          sessionId: 's1',
          sequence: 1,
          turnId: 't1',
          kind: 'message',
          actor: 'user',
          text: 'Please explore this bug.',
          state: 'complete',
          createdAt: 'now',
          updatedAt: 'now',
          providerMeta: {
            providerId: 'claude-code',
            providerItemId: null,
            providerEventType: null,
          },
        },
        {
          id: 'a1',
          sessionId: 's1',
          sequence: 2,
          turnId: 't1',
          kind: 'message',
          actor: 'assistant',
          text: 'I found the issue in the rename path.',
          state: 'complete',
          createdAt: 'now',
          updatedAt: 'now',
          providerMeta: {
            providerId: 'claude-code',
            providerItemId: null,
            providerEventType: null,
          },
        },
      ],
      { requestId: 'rename-request-1' },
    )

    expect(result).toBe('Better Session Name')
    expect(oneShot).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'fast',
        requestId: 'rename-request-1',
        workingDirectory: '/tmp',
      }),
    )
  })

  it('returns null without calling the provider when the session uses the shell provider', async () => {
    const oneShot = vi.fn()
    const provider: Provider = {
      id: 'shell',
      name: 'Shell',
      supportsContinuation: false,
      describe: async () => {
        throw new Error('should not be queried')
      },
      start: () => {
        throw new Error('should not be started')
      },
      oneShot,
    }
    const providers = {
      get: vi.fn((id: string) => (id === 'shell' ? provider : undefined)),
      register: vi.fn(),
      getAll: vi.fn(() => [provider]),
    } as unknown as ProviderRegistry
    const appSettings = {
      resolveNamingModel: vi.fn(async () => 'fast'),
    } as unknown as AppSettingsService

    const service = new SessionNamingService({ providers, appSettings })

    const result = await service.generateName(
      baseSession({ providerId: 'shell', primarySurface: 'terminal' }),
      [],
    )

    expect(result).toBeNull()
    expect(oneShot).not.toHaveBeenCalled()
  })
})
