import { describe, expect, it } from 'vitest'
import type { ProviderInfo, SessionSummary } from '@/entities/session'
import { resolveContextCompactionAction } from './context-compaction.pure'

const session = {
  id: 'session-1',
  providerId: 'codex',
  status: 'completed',
  attention: 'finished',
  activity: null,
  continuationToken: 'thread-1',
  executionHost: 'local',
} as SessionSummary

const provider = {
  id: 'codex',
  name: 'Codex',
  contextManagement: {
    compact: {
      availability: 'available',
      method: 'native-rpc',
      supportsInstructions: false,
    },
  },
} as ProviderInfo

describe('resolveContextCompactionAction', () => {
  it('enables compaction for an idle resumable local session', () => {
    expect(resolveContextCompactionAction(session, provider)).toEqual({
      visible: true,
      enabled: true,
      reason: null,
    })
  })

  it('disables compaction for active and remote sessions', () => {
    expect(
      resolveContextCompactionAction(
        { ...session, status: 'running' },
        provider,
      ).enabled,
    ).toBe(false)
    expect(
      resolveContextCompactionAction(
        { ...session, executionHost: 'remote' },
        provider,
      ).reason,
    ).toMatch(/remote sessions/)
  })

  it('surfaces an unsupported provider explanation', () => {
    const unsupported = {
      ...provider,
      contextManagement: {
        compact: {
          availability: 'unavailable',
          method: 'unsupported',
          supportsInstructions: false,
          notes: 'Start a new session instead.',
        },
      },
    } as ProviderInfo

    expect(resolveContextCompactionAction(session, unsupported)).toEqual({
      visible: true,
      enabled: false,
      reason: 'Start a new session instead.',
    })
  })
})
