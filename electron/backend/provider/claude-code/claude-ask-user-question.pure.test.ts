import { describe, expect, it } from 'vitest'
import {
  buildClaudeAskUserQuestionRequest,
  buildClaudeAskUserQuestionUpdatedInput,
  buildClaudeExitPlanModeHookResponse,
  buildClaudeExitPlanModeRequest,
  normalizeClaudeDeferredToolUse,
  supportsClaudeDeferredToolUseVersion,
} from './claude-ask-user-question.pure'

describe('Claude AskUserQuestion mapping', () => {
  it('gates deferred tool-use support at Claude Code 2.1.89', () => {
    expect(supportsClaudeDeferredToolUseVersion('2.1.88')).toBe(false)
    expect(supportsClaudeDeferredToolUseVersion('Claude Code v2.1.89')).toBe(
      true,
    )
    expect(supportsClaudeDeferredToolUseVersion('2.2.0')).toBe(true)
    expect(supportsClaudeDeferredToolUseVersion(null)).toBe(false)
  })

  it('maps deferred AskUserQuestion tool input to a choice request', () => {
    const toolUse = normalizeClaudeDeferredToolUse({
      id: 'toolu_123',
      name: 'AskUserQuestion',
      input: {
        questions: [
          {
            question: 'Where should scripts run?',
            header: 'Working dir',
            multiSelect: false,
            options: [
              {
                label: 'Project root only',
                description: 'Run in the main repo.',
              },
              {
                label: 'Active workspace',
                description: 'Run in the current worktree.',
              },
            ],
          },
        ],
      },
    })

    expect(toolUse).not.toBeNull()
    const request = buildClaudeAskUserQuestionRequest(toolUse!)

    expect(request).toMatchObject({
      prompt: 'Where should scripts run?',
      request: {
        kind: 'choice',
        questions: [
          {
            id: 'Where should scripts run?',
            question: 'Where should scripts run?',
            header: 'Working dir',
            multiSelect: false,
            options: [
              { label: 'Project root only' },
              { label: 'Active workspace' },
            ],
          },
        ],
      },
      pending: {
        toolUseId: 'toolu_123',
      },
    })
  })

  it('builds updatedInput answers keyed by question text', () => {
    const request = buildClaudeAskUserQuestionRequest({
      id: 'toolu_123',
      name: 'AskUserQuestion',
      input: {
        questions: [
          {
            question: 'Where should scripts run?',
            header: 'Working dir',
            multiSelect: false,
            options: [{ label: 'Project root only' }, { label: 'Workspace' }],
          },
        ],
      },
    })

    const updatedInput = buildClaudeAskUserQuestionUpdatedInput(
      request!.pending,
      {
        kind: 'choice',
        answers: [
          {
            questionId: 'Where should scripts run?',
            values: ['Workspace'],
          },
        ],
      },
      'fallback',
    )

    expect(updatedInput).toEqual({
      questions: [
        {
          question: 'Where should scripts run?',
          header: 'Working dir',
          multiSelect: false,
          options: [{ label: 'Project root only' }, { label: 'Workspace' }],
        },
      ],
      answers: {
        'Where should scripts run?': 'Workspace',
      },
    })
  })

  it('maps deferred ExitPlanMode tool input to a plan request', () => {
    const request = buildClaudeExitPlanModeRequest({
      id: 'toolu_plan',
      name: 'ExitPlanMode',
      input: {
        plan: '# Plan\n\n- Add the bridge',
        planPath: '/tmp/claude-plan.md',
        allowedPrompts: ['Edit files', 'Run tests'],
      },
    })

    expect(request).toMatchObject({
      prompt: '# Plan\n\n- Add the bridge',
      request: {
        kind: 'plan',
        plan: '# Plan\n\n- Add the bridge',
        planPath: '/tmp/claude-plan.md',
        allowedPrompts: ['Edit files', 'Run tests'],
      },
      pending: {
        toolUseId: 'toolu_plan',
      },
    })
  })

  it('builds ExitPlanMode hook responses for approve and reject', () => {
    const request = buildClaudeExitPlanModeRequest({
      id: 'toolu_plan',
      name: 'ExitPlanMode',
      input: {
        plan: 'Plan text',
        allowedPrompts: ['Edit files'],
      },
    })

    expect(
      buildClaudeExitPlanModeHookResponse(
        request!.pending,
        { kind: 'plan', decision: 'approve' },
        '',
      ),
    ).toEqual({
      permissionDecision: 'allow',
      permissionDecisionReason: 'The user approved the plan in Convergence.',
      updatedInput: {
        plan: 'Plan text',
        allowedPrompts: ['Edit files'],
      },
    })

    expect(
      buildClaudeExitPlanModeHookResponse(
        request!.pending,
        {
          kind: 'plan',
          decision: 'reject',
          message: 'Use a smaller slice.',
        },
        '',
      ),
    ).toEqual({
      permissionDecision: 'deny',
      permissionDecisionReason: 'Use a smaller slice.',
    })
  })
})
