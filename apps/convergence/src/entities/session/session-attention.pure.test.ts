import { describe, expect, it } from 'vitest'
import {
  formatSessionAttentionLabel,
  summarizeAttentionRequests,
} from './session-attention.pure'
import type { SessionSummary } from './session.types'

function makeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 'session-1',
    contextKind: 'project',
    projectId: 'project-1',
    workspaceId: null,
    providerId: 'claude-code',
    model: 'sonnet',
    effort: 'medium',
    name: 'Refactor auth',
    status: 'running',
    attention: 'none',
    attentionRequestKind: null,
    activity: null,
    contextWindow: null,
    workingDirectory: '/tmp',
    archivedAt: null,
    parentSessionId: null,
    forkStrategy: null,
    primarySurface: 'conversation',
    continuationToken: null,
    lastSequence: 0,
    createdAt: '2026-04-21T00:00:00.000Z',
    updatedAt: '2026-04-21T00:00:00.000Z',
    ...overrides,
  }
}

describe('session attention labels', () => {
  it('formats structured interaction request labels', () => {
    expect(
      formatSessionAttentionLabel(
        makeSession({
          attention: 'needs-input',
          attentionRequestKind: 'question',
        }),
      ),
    ).toBe('Question needs answer')
    expect(
      formatSessionAttentionLabel(
        makeSession({ attention: 'needs-input', attentionRequestKind: 'plan' }),
      ),
    ).toBe('Plan review needed')
    expect(
      formatSessionAttentionLabel(
        makeSession({ attention: 'needs-input', attentionRequestKind: 'form' }),
      ),
    ).toBe('Form input needed')
    expect(
      formatSessionAttentionLabel(
        makeSession({ attention: 'needs-input', attentionRequestKind: 'url' }),
      ),
    ).toBe('URL confirmation needed')
  })

  it('summarizes mixed attention requests compactly', () => {
    expect(
      summarizeAttentionRequests([
        makeSession({ id: 'a', attention: 'needs-approval' }),
        makeSession({
          id: 'b',
          attention: 'needs-input',
          attentionRequestKind: 'form',
        }),
        makeSession({
          id: 'c',
          attention: 'needs-input',
          attentionRequestKind: 'form',
        }),
      ]),
    ).toBe('1 approval, 2 forms')
  })
})
