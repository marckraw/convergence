import { describe, expect, it } from 'vitest'
import {
  buildInitiativeSynthesisPrompt,
  parseAndValidateInitiativeSynthesis,
} from './initiative-synthesis.pure'
import type { InitiativeSynthesisPromptInput } from './initiative-synthesis.types'

const promptInput: InitiativeSynthesisPromptInput = {
  initiative: {
    id: 'i1',
    title: 'Agent-native initiatives',
    status: 'exploring',
    attention: 'none',
    currentUnderstanding: 'Stable user notes.',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  attempts: [
    {
      attempt: {
        id: 'a1',
        initiativeId: 'i1',
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
      transcript: 'user: summarize this initiative',
    },
  ],
  outputs: [
    {
      kind: 'branch',
      label: 'Feature branch',
      value: 'feat/initiatives',
      status: 'in-progress',
      sourceSessionId: 's1',
    },
  ],
}

describe('initiative synthesis pure helpers', () => {
  it('builds a prompt with stable state, attempts, and outputs', () => {
    const prompt = buildInitiativeSynthesisPrompt(promptInput)

    expect(prompt).toContain('Agent-native initiatives')
    expect(prompt).toContain('Stable user notes.')
    expect(prompt).toContain('Feature branch: feat/initiatives')
    expect(prompt).toContain('Attempt 1:')
    expect(prompt).toContain('user: summarize this initiative')
    expect(prompt).toContain('Output ONLY the JSON object')
  })

  it('parses valid synthesis JSON', () => {
    const result = parseAndValidateInitiativeSynthesis(
      JSON.stringify({
        current_understanding: 'Build suggestions first.',
        decisions: ['Keep suggestions transient.'],
        open_questions: ['Should decisions be persisted?'],
        next_action: 'Accept useful text.',
        outputs: [
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
        currentUnderstanding: 'Build suggestions first.',
        decisions: ['Keep suggestions transient.'],
        openQuestions: ['Should decisions be persisted?'],
        nextAction: 'Accept useful text.',
        outputs: [
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
    const result = parseAndValidateInitiativeSynthesis(
      JSON.stringify({
        current_understanding: 'Missing arrays',
        decisions: 'nope',
        open_questions: [],
        next_action: '',
        outputs: [],
      }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.field).toBe('decisions')
  })
})
