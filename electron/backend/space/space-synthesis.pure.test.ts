import { describe, expect, it } from 'vitest'
import {
  buildSpaceSynthesisPrompt,
  parseAndValidateSpaceSynthesis,
} from './space-synthesis.pure'
import type { SpaceSynthesisPromptInput } from './space-synthesis.types'

const promptInput: SpaceSynthesisPromptInput = {
  space: {
    id: 'i1',
    title: 'Agent-native spaces',
    status: 'exploring',
    attention: 'none',
    brief: 'Stable user notes.',
    memory: '',
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  attempts: [
    {
      attempt: {
        id: 'a1',
        spaceId: 'i1',
        sessionId: 's1',
        role: 'implementation',
        isPrimary: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      session: {
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
      },
      transcript: 'user: summarize this space',
    },
  ],
  artifacts: [
    {
      kind: 'branch',
      label: 'Feature branch',
      value: 'feat/spaces',
      status: 'in-progress',
      sourceSessionId: 's1',
    },
  ],
}

describe('space synthesis pure helpers', () => {
  it('builds a prompt with stable state, attempts, and artifacts', () => {
    const prompt = buildSpaceSynthesisPrompt(promptInput)

    expect(prompt).toContain('Agent-native spaces')
    expect(prompt).toContain('Stable user notes.')
    expect(prompt).toContain('Feature branch: feat/spaces')
    expect(prompt).toContain('Attempt 1:')
    expect(prompt).toContain('user: summarize this space')
    expect(prompt).toContain('Return ONLY the JSON object')
  })

  it('parses valid synthesis JSON', () => {
    const result = parseAndValidateSpaceSynthesis(
      JSON.stringify({
        brief: 'Build suggestions first.',
        decisions: ['Keep suggestions transient.'],
        open_questions: ['Should decisions be persisted?'],
        next_action: 'Accept useful text.',
        artifacts: [
          {
            kind: 'documentation',
            label: 'Spec',
            value: 'docs/spec.md',
            status: 'ready',
            source_session_id: 's1',
          },
        ],
      }),
    )

    expect(result).toEqual({
      ok: true,
      value: {
        brief: 'Build suggestions first.',
        decisions: ['Keep suggestions transient.'],
        openQuestions: ['Should decisions be persisted?'],
        nextAction: 'Accept useful text.',
        artifacts: [
          {
            kind: 'documentation',
            label: 'Spec',
            value: 'docs/spec.md',
            status: 'ready',
            sourceSessionId: 's1',
          },
        ],
      },
    })
  })

  it('rejects invalid synthesis JSON', () => {
    const result = parseAndValidateSpaceSynthesis(
      JSON.stringify({
        brief: 'Missing arrays',
        decisions: 'nope',
        open_questions: [],
        next_action: '',
        artifacts: [],
      }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.field).toBe('decisions')
  })
})
