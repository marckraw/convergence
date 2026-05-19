import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionDelta } from '../../session/conversation-item.types'

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}))

vi.mock('child_process', () => ({
  spawn: spawnMock,
}))

import { ClaudeCodeProvider } from './claude-code-provider'

class MockChildProcess extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  killed = false
  private exited = false

  kill = vi.fn((_signal?: NodeJS.Signals) => {
    this.killed = true
    this.emitExit(0)
    return true
  })

  emitExit(code: number): void {
    if (this.exited) return
    this.exited = true
    this.emit('exit', code)
  }
}

function waitFor(
  assertion: () => void,
  timeoutMs = 500,
  intervalMs = 10,
): Promise<void> {
  const startedAt = Date.now()
  return new Promise((resolve, reject) => {
    const attempt = () => {
      try {
        assertion()
        resolve()
      } catch (error) {
        if (Date.now() - startedAt >= timeoutMs) {
          reject(error)
          return
        }
        setTimeout(attempt, intervalMs)
      }
    }
    attempt()
  })
}

describe('ClaudeCodeProvider AskUserQuestion bridge', () => {
  afterEach(() => {
    spawnMock.mockReset()
  })

  it('surfaces deferred AskUserQuestion and resumes with updatedInput answers', async () => {
    const deferredChild = new MockChildProcess()
    const resumedChild = new MockChildProcess()
    spawnMock
      .mockReturnValueOnce(deferredChild)
      .mockReturnValueOnce(resumedChild)

    const provider = new ClaudeCodeProvider('/usr/local/bin/claude')
    const handle = provider.start({
      sessionId: 'session-1',
      workingDirectory: process.cwd(),
      initialMessage: 'configure scripts',
      initialAttachments: undefined,
      model: null,
      effort: null,
      continuationToken: null,
    })

    const items: Array<
      Extract<SessionDelta, { kind: 'conversation.item.add' }>['item']
    > = []
    const attentions: string[] = []
    const statuses: string[] = []

    handle.onDelta((delta) => {
      if (delta.kind === 'conversation.item.add') {
        items.push(delta.item)
      }
    })
    handle.onStatusChange((status) => {
      statuses.push(status)
    })
    handle.onAttentionChange((attention) => {
      attentions.push(attention)
    })
    handle.onContinuationToken(() => {})
    handle.onContextWindowChange(() => {})
    handle.onActivityChange(() => {})

    await waitFor(() => {
      expect(spawnMock).toHaveBeenCalledTimes(1)
    })

    deferredChild.stdout.write(
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'claude-session-1',
      }) + '\n',
    )
    deferredChild.stdout.write(
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        stop_reason: 'tool_deferred',
        session_id: 'claude-session-1',
        deferred_tool_use: {
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
                    description: 'Run in the worktree.',
                  },
                ],
              },
            ],
          },
        },
      }) + '\n',
    )
    deferredChild.emitExit(0)

    await waitFor(() => {
      expect(attentions).toContain('needs-input')
      expect(items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'input-request',
            prompt: 'Where should scripts run?',
            request: {
              kind: 'choice',
              questions: [
                expect.objectContaining({
                  question: 'Where should scripts run?',
                  header: 'Working dir',
                }),
              ],
            },
            providerMeta: expect.objectContaining({
              providerItemId: 'toolu_123',
              providerEventType: 'deferred_tool_use',
            }),
          }),
        ]),
      )
    })

    handle.sendMessage('Active workspace', undefined, undefined, {
      deliveryMode: 'answer',
      interactionResponse: {
        kind: 'choice',
        answers: [
          {
            questionId: 'Where should scripts run?',
            values: ['Active workspace'],
          },
        ],
      },
    })

    await waitFor(() => {
      expect(spawnMock).toHaveBeenCalledTimes(2)
    })

    const resumedArgs = spawnMock.mock.calls[1]?.[1] as string[]
    const resumedOptions = spawnMock.mock.calls[1]?.[2] as {
      env?: Record<string, string>
    }
    expect(resumedArgs).toEqual(
      expect.arrayContaining(['--resume', 'claude-session-1']),
    )
    expect(resumedArgs).toContain('--settings')
    expect(
      JSON.parse(
        resumedOptions.env?.CONVERGENCE_CLAUDE_DEFERRED_TOOL_RESPONSE ?? '{}',
      ),
    ).toEqual({
      permissionDecision: 'allow',
      updatedInput: {
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
                description: 'Run in the worktree.',
              },
            ],
          },
        ],
        answers: {
          'Where should scripts run?': 'Active workspace',
        },
      },
    })

    resumedChild.stdout.write(
      JSON.stringify({
        type: 'result',
        is_error: false,
        result: 'Configured scripts.',
      }) + '\n',
    )
    resumedChild.emitExit(0)

    await waitFor(() => {
      expect(statuses).toContain('completed')
      expect(attentions).toContain('finished')
    })
  })

  it('does not install the defer hook for unsupported Claude Code versions', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const provider = new ClaudeCodeProvider(
      '/usr/local/bin/claude',
      null,
      undefined,
      '2.1.88',
    )
    const handle = provider.start({
      sessionId: 'session-unsupported',
      workingDirectory: process.cwd(),
      initialMessage: 'configure scripts',
      initialAttachments: undefined,
      model: null,
      effort: null,
      continuationToken: null,
    })

    const items: Array<
      Extract<SessionDelta, { kind: 'conversation.item.add' }>['item']
    > = []
    handle.onDelta((delta) => {
      if (delta.kind === 'conversation.item.add') {
        items.push(delta.item)
      }
    })
    handle.onStatusChange(() => {})
    handle.onAttentionChange(() => {})
    handle.onContinuationToken(() => {})
    handle.onContextWindowChange(() => {})
    handle.onActivityChange(() => {})

    await waitFor(() => {
      expect(spawnMock).toHaveBeenCalledTimes(1)
      expect(items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'note',
            level: 'warning',
            text: expect.stringContaining('does not support deferred tool-use'),
          }),
        ]),
      )
    })

    const args = spawnMock.mock.calls[0]?.[1] as string[]
    expect(args).not.toContain('--settings')
  })

  it('surfaces deferred ExitPlanMode and resumes with approval', async () => {
    const deferredChild = new MockChildProcess()
    const resumedChild = new MockChildProcess()
    spawnMock
      .mockReturnValueOnce(deferredChild)
      .mockReturnValueOnce(resumedChild)

    const provider = new ClaudeCodeProvider('/usr/local/bin/claude')
    const handle = provider.start({
      sessionId: 'session-plan',
      workingDirectory: process.cwd(),
      initialMessage: 'make a plan first',
      initialAttachments: undefined,
      model: null,
      effort: null,
      continuationToken: null,
    })

    const items: Array<
      Extract<SessionDelta, { kind: 'conversation.item.add' }>['item']
    > = []
    handle.onDelta((delta) => {
      if (delta.kind === 'conversation.item.add') {
        items.push(delta.item)
      }
    })
    handle.onStatusChange(() => {})
    handle.onAttentionChange(() => {})
    handle.onContinuationToken(() => {})
    handle.onContextWindowChange(() => {})
    handle.onActivityChange(() => {})

    await waitFor(() => {
      expect(spawnMock).toHaveBeenCalledTimes(1)
    })

    deferredChild.stdout.write(
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'claude-session-plan',
      }) + '\n',
    )
    deferredChild.stdout.write(
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        stop_reason: 'tool_deferred',
        session_id: 'claude-session-plan',
        deferred_tool_use: {
          id: 'toolu_plan',
          name: 'ExitPlanMode',
          input: {
            plan: '# Plan\n\n- Update the provider bridge',
            planPath: '/tmp/claude-plan.md',
            allowedPrompts: ['Edit files'],
          },
        },
      }) + '\n',
    )
    deferredChild.emitExit(0)

    await waitFor(() => {
      expect(items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'input-request',
            request: {
              kind: 'plan',
              plan: '# Plan\n\n- Update the provider bridge',
              planPath: '/tmp/claude-plan.md',
              allowedPrompts: ['Edit files'],
            },
            providerMeta: expect.objectContaining({
              providerItemId: 'toolu_plan',
              providerEventType: 'deferred_tool_use',
            }),
          }),
        ]),
      )
    })

    handle.sendMessage('Approved plan', undefined, undefined, {
      deliveryMode: 'answer',
      interactionResponse: {
        kind: 'plan',
        decision: 'approve',
      },
    })

    await waitFor(() => {
      expect(spawnMock).toHaveBeenCalledTimes(2)
    })

    const resumedOptions = spawnMock.mock.calls[1]?.[2] as {
      env?: Record<string, string>
    }
    expect(
      JSON.parse(
        resumedOptions.env?.CONVERGENCE_CLAUDE_DEFERRED_TOOL_RESPONSE ?? '{}',
      ),
    ).toEqual({
      permissionDecision: 'allow',
      permissionDecisionReason: 'The user approved the plan in Convergence.',
      updatedInput: {
        plan: '# Plan\n\n- Update the provider bridge',
        planPath: '/tmp/claude-plan.md',
        allowedPrompts: ['Edit files'],
      },
    })
  })
})
