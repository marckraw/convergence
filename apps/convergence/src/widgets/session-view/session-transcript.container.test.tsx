import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ConversationItem, Session } from '@/entities/session'
import { useAttachmentStore } from '@/entities/attachment'
import type { SessionAgentRun } from '@/shared/types/harness-evidence.types'
import { SessionTranscript } from './session-transcript.container'

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: {
    count: number
    estimateSize: (index: number) => number
    getItemKey?: (index: number) => string | number | bigint
  }) => ({
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, index) => ({
        index,
        key: options.getItemKey?.(index) ?? index,
        start: index * options.estimateSize(index),
      })),
    getTotalSize: () =>
      Array.from({ length: options.count }, (_, index) =>
        options.estimateSize(index),
      ).reduce((total, size) => total + size, 0),
    measureElement: vi.fn(),
    scrollToIndex: vi.fn(),
  }),
}))

const baseSession: Session = {
  id: 'session-1',
  contextKind: 'project',
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  providerId: 'claude-code',
  model: 'sonnet',
  effort: 'medium',
  name: 'Test session',
  status: 'running',
  hasActiveHandle: true,
  attention: 'none',
  activity: null,
  workingDirectory: '/tmp/project',
  contextWindow: null,
  archivedAt: null,
  parentSessionId: null,
  forkStrategy: null,
  primarySurface: 'conversation',
  continuationToken: null,
  lastSequence: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

it('R3′ keeps an attributed approval actionable while child work leaves the main transcript — mutations move approval or keep child work turn red', () => {
  const approve = vi.fn()
  const approval = {
    ...approvalRequest({
      id: 'decision',
      sequence: 1,
      providerItemId: 'permission',
    }),
    agentRunId: 'child',
    resolution: 'pending' as const,
    agentAttribution: { description: 'Read routes', agentType: 'Explore' },
  }
  const work = {
    ...assistantMessage({
      id: 'child-text',
      sequence: 2,
      text: 'private child voice',
    }),
    agentRunId: 'child',
  }
  render(
    <SessionTranscript
      session={baseSession}
      parallelRows={[
        {
          id: 'child',
          kind: 'agent',
          parentId: null,
          run: { id: 'child', spawnedByItemId: 'spawn' } as SessionAgentRun,
        },
      ]}
      conversationItems={[approval, work]}
      onApprove={approve}
      onDeny={vi.fn()}
      onInputAnswer={vi.fn()}
    />,
  )
  const allow =
    screen.queryByRole('button', { name: 'Allow once' }) ??
    screen.queryByRole('button', { name: 'Approve' })
  if (allow) fireEvent.click(allow)
  expect({
    childInMain: screen.queryByText('private child voice') !== null,
    approved: approve.mock.calls,
    attributed: screen.queryByText('↳ Read routes (Explore)') !== null,
  }).toEqual({
    childInMain: false,
    approved: [['session-1', 'permission']],
    attributed: true,
  })
})

function userMessage(overrides: {
  id: string
  sequence: number
  text: string
  turnId?: string
}): ConversationItem {
  return {
    id: overrides.id,
    sessionId: 'session-1',
    sequence: overrides.sequence,
    turnId: overrides.turnId ?? `turn-${overrides.sequence}`,
    kind: 'message',
    actor: 'user',
    text: overrides.text,
    state: 'complete',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    providerMeta: {
      providerId: 'claude-code',
      providerItemId: null,
      providerEventType: 'user',
    },
  }
}

function assistantMessage(overrides: {
  id: string
  sequence: number
  text: string
  turnId?: string
  state?: 'streaming' | 'complete'
}): ConversationItem {
  return {
    id: overrides.id,
    sessionId: 'session-1',
    sequence: overrides.sequence,
    turnId: overrides.turnId ?? `turn-${overrides.sequence}`,
    kind: 'message',
    actor: 'assistant',
    text: overrides.text,
    state: overrides.state ?? 'streaming',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    providerMeta: {
      providerId: 'claude-code',
      providerItemId: null,
      providerEventType: 'assistant',
    },
  }
}

function approvalRequest(overrides: {
  id: string
  sequence: number
  description?: string
  providerItemId?: string | null
}): ConversationItem {
  return {
    id: overrides.id,
    sessionId: 'session-1',
    sequence: overrides.sequence,
    turnId: `turn-${overrides.sequence}`,
    kind: 'approval-request',
    description: overrides.description ?? 'Allow file edit?',
    state: 'complete',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    providerMeta: {
      providerId: 'claude-code',
      providerItemId: overrides.providerItemId ?? null,
      providerEventType: 'approval',
    },
  }
}

function inputRequest(overrides: {
  id: string
  sequence: number
  prompt?: string
  providerItemId?: string | null
}): ConversationItem {
  return {
    id: overrides.id,
    sessionId: 'session-1',
    sequence: overrides.sequence,
    turnId: `turn-${overrides.sequence}`,
    kind: 'input-request',
    prompt: overrides.prompt ?? 'Where should scripts run?',
    request: {
      kind: 'choice',
      questions: [
        {
          id: 'working_dir',
          question: 'Where should scripts run?',
          header: 'Working dir',
          multiSelect: false,
          options: [
            {
              label: 'Project root only',
              description: 'Scripts always run in the main repo path.',
            },
            {
              label: 'Active workspace',
              description: 'Scripts run in the active worktree.',
            },
          ],
        },
      ],
    },
    state: 'complete',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    providerMeta: {
      providerId: 'codex',
      providerItemId: overrides.providerItemId ?? null,
      providerEventType: 'item/tool/requestUserInput',
    },
  }
}

function planRequest(overrides: {
  id: string
  sequence: number
  providerItemId?: string | null
}): ConversationItem {
  return {
    id: overrides.id,
    sessionId: 'session-1',
    sequence: overrides.sequence,
    turnId: `turn-${overrides.sequence}`,
    kind: 'input-request',
    prompt: '# Plan\n\n- Add ExitPlanMode support',
    request: {
      kind: 'plan',
      plan: '# Plan\n\n- Add ExitPlanMode support',
      planPath: '/tmp/claude-plan.md',
      allowedPrompts: ['Edit files'],
    },
    state: 'complete',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    providerMeta: {
      providerId: 'claude-code',
      providerItemId: overrides.providerItemId ?? null,
      providerEventType: 'input-request',
    },
  }
}

function formRequest(overrides: {
  id: string
  sequence: number
  providerItemId?: string | null
}): ConversationItem {
  return {
    id: overrides.id,
    sessionId: 'session-1',
    sequence: overrides.sequence,
    turnId: `turn-${overrides.sequence}`,
    kind: 'input-request',
    prompt: 'Create issue?',
    request: {
      kind: 'form',
      title: 'linear request',
      message: 'Create issue?',
      fields: [
        {
          id: 'title',
          label: 'Title',
          type: 'string',
          required: true,
          defaultValue: 'Bug report',
        },
        {
          id: 'estimate',
          label: 'Estimate',
          type: 'number',
          required: false,
          defaultValue: 3,
        },
        {
          id: 'urgent',
          label: 'Urgent',
          type: 'boolean',
          required: false,
          defaultValue: true,
        },
      ],
    },
    state: 'complete',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    providerMeta: {
      providerId: 'codex',
      providerItemId: overrides.providerItemId ?? null,
      providerEventType: 'mcpServer/elicitation/request',
    },
  }
}

function urlRequest(overrides: {
  id: string
  sequence: number
  providerItemId?: string | null
}): ConversationItem {
  return {
    id: overrides.id,
    sessionId: 'session-1',
    sequence: overrides.sequence,
    turnId: `turn-${overrides.sequence}`,
    kind: 'input-request',
    prompt: 'Open authorization URL?',
    request: {
      kind: 'url',
      title: 'github request',
      message: 'Open authorization URL?',
      url: 'https://github.com/login/oauth/authorize',
    },
    state: 'complete',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    providerMeta: {
      providerId: 'codex',
      providerItemId: overrides.providerItemId ?? null,
      providerEventType: 'mcpServer/elicitation/request',
    },
  }
}

describe('SessionTranscript', () => {
  it('renders conversation rows through the virtual transcript surface', async () => {
    useAttachmentStore.setState({ resolved: {} })

    render(
      <SessionTranscript
        session={baseSession}
        conversationItems={[
          userMessage({ id: 'message-1', sequence: 1, text: 'First turn' }),
          userMessage({ id: 'message-2', sequence: 2, text: 'Second turn' }),
        ]}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onInputAnswer={vi.fn()}
      />,
    )

    expect(
      screen.getByTestId('session-transcript-scroll-region'),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getAllByTestId('session-transcript-row')).toHaveLength(2)
    })
    expect(screen.getByText('First turn')).toBeInTheDocument()
    expect(screen.getByText('Second turn')).toBeInTheDocument()
    expect(screen.getByText('Turn 1')).toBeInTheDocument()
    expect(screen.getByText('Turn 2')).toBeInTheDocument()
  })

  it('keeps the latest approval request actionable', async () => {
    const onApprove = vi.fn()
    const onDeny = vi.fn()

    render(
      <SessionTranscript
        session={{
          ...baseSession,
          attention: 'needs-approval',
        }}
        conversationItems={[approvalRequest({ id: 'approval-1', sequence: 1 })]}
        onApprove={onApprove}
        onDeny={onDeny}
        onInputAnswer={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }))

    expect(onApprove).toHaveBeenCalledWith('session-1', undefined)
    expect(onDeny).not.toHaveBeenCalled()
  })

  it('R2 session action carries scope and needs suggestions — drop scope or show Always without suggestions turns red', async () => {
    const onApprove = vi.fn()
    const suggested = {
      ...approvalRequest({
        id: 'suggested',
        sequence: 1,
        providerItemId: 'tool',
      }),
      supportsSessionApproval: true,
    } as ConversationItem
    const plain = approvalRequest({ id: 'plain', sequence: 2 })
    render(
      <SessionTranscript
        session={{ ...baseSession, attention: 'needs-approval' }}
        conversationItems={[suggested, plain]}
        onApprove={onApprove}
        onDeny={vi.fn()}
        onInputAnswer={vi.fn()}
      />,
    )
    await screen.findAllByTestId('approval-request-card')
    const buttons = screen.queryAllByRole('button', {
      name: 'Always allow (this session)',
    })
    if (buttons[0]) fireEvent.click(buttons[0])
    expect({ buttons: buttons.length, calls: onApprove.mock.calls }).toEqual({
      buttons: 1,
      calls: [['session-1', 'tool', { scope: 'session' }]],
    })
  })

  it('R6 a persisted denial cannot be acted on after reopening — ignore resolution turns red', async () => {
    render(
      <SessionTranscript
        session={{ ...baseSession, attention: 'needs-approval' }}
        conversationItems={[
          {
            ...approvalRequest({ id: 'ended', sequence: 1 }),
            resolution: 'denied',
          } as ConversationItem,
        ]}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onInputAnswer={vi.fn()}
      />,
    )
    await screen.findByTestId('approval-request-card')
    expect({
      approve: screen.queryByRole('button', { name: 'Approve' }) !== null,
      denied: screen.queryByText('Denied') !== null,
    }).toEqual({ approve: false, denied: true })
  })

  it('R1 a resident background approval remains actionable after the answer — require a running turn turns red', async () => {
    const onApprove = vi.fn()
    render(
      <SessionTranscript
        session={{
          ...baseSession,
          status: 'completed',
          attention: 'needs-approval',
        }}
        conversationItems={[
          {
            ...approvalRequest({
              id: 'background',
              sequence: 1,
              providerItemId: 'tool',
            }),
            resolution: 'pending',
          } as ConversationItem,
        ]}
        onApprove={onApprove}
        onDeny={vi.fn()}
        onInputAnswer={vi.fn()}
      />,
    )
    await screen.findByTestId('approval-request-card')
    const approve = screen.queryByRole('button', { name: 'Approve' })
    if (approve) fireEvent.click(approve)
    expect(onApprove.mock.calls).toEqual([['session-1', 'tool']])
  })

  it('keeps the approval button when an assistant delta lands after the request', async () => {
    const onApprove = vi.fn()
    const onDeny = vi.fn()

    render(
      <SessionTranscript
        session={{
          ...baseSession,
          attention: 'needs-approval',
        }}
        conversationItems={[
          approvalRequest({
            id: 'approval-1',
            sequence: 1,
            providerItemId: '100',
          }),
          assistantMessage({
            id: 'message-1',
            sequence: 2,
            text: 'Still thinking…',
            turnId: 'turn-1',
            state: 'streaming',
          }),
        ]}
        onApprove={onApprove}
        onDeny={onDeny}
        onInputAnswer={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }))

    expect(onApprove).toHaveBeenCalledWith('session-1', '100')
  })

  it('renders actions inside each active approval request card', async () => {
    const onApprove = vi.fn()
    const onDeny = vi.fn()

    render(
      <SessionTranscript
        session={{
          ...baseSession,
          attention: 'needs-approval',
        }}
        conversationItems={[
          approvalRequest({
            id: 'approval-1',
            sequence: 1,
            description: 'Allow diskutil?',
            providerItemId: '100',
          }),
          approvalRequest({
            id: 'approval-2',
            sequence: 2,
            description: 'Allow top?',
            providerItemId: '101',
          }),
        ]}
        onApprove={onApprove}
        onDeny={onDeny}
        onInputAnswer={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getAllByTestId('approval-request-card')).toHaveLength(2)
    })

    const [firstCard, secondCard] = screen.getAllByTestId(
      'approval-request-card',
    )
    expect(within(firstCard).getByText('Allow diskutil?')).toBeInTheDocument()
    expect(
      within(firstCard).getByRole('button', { name: 'Approve' }),
    ).toBeInTheDocument()
    expect(within(secondCard).getByText('Allow top?')).toBeInTheDocument()
    expect(
      within(secondCard).getByRole('button', { name: 'Approve' }),
    ).toBeInTheDocument()

    fireEvent.click(within(firstCard).getByRole('button', { name: 'Deny' }))
    fireEvent.click(within(secondCard).getByRole('button', { name: 'Approve' }))

    expect(onDeny).toHaveBeenCalledWith('session-1', '100')
    expect(onApprove).toHaveBeenCalledWith('session-1', '101')
  })

  it('answers active structured input requests from the transcript', async () => {
    const onInputAnswer = vi.fn()

    render(
      <SessionTranscript
        session={{
          ...baseSession,
          providerId: 'codex',
          attention: 'needs-input',
        }}
        conversationItems={[
          inputRequest({
            id: 'input-1',
            sequence: 1,
            providerItemId: '100',
          }),
        ]}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onInputAnswer={onInputAnswer}
      />,
    )

    fireEvent.click(
      await screen.findByRole('button', { name: /Active workspace/ }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Answer' }))

    expect(onInputAnswer).toHaveBeenCalledWith(
      'session-1',
      {
        kind: 'choice',
        answers: [
          {
            questionId: 'working_dir',
            values: ['Active workspace'],
          },
        ],
      },
      'Where should scripts run?\nActive workspace',
    )
  })

  it('answers active plan requests from the transcript', async () => {
    const onInputAnswer = vi.fn()

    render(
      <SessionTranscript
        session={{
          ...baseSession,
          attention: 'needs-input',
        }}
        conversationItems={[
          planRequest({
            id: 'plan-1',
            sequence: 1,
            providerItemId: 'toolu_plan',
          }),
        ]}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onInputAnswer={onInputAnswer}
      />,
    )

    expect(await screen.findByText('Plan review needed')).toBeInTheDocument()
    expect(screen.getByText('/tmp/claude-plan.md')).toBeInTheDocument()
    expect(screen.getByText('Add ExitPlanMode support')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Approve plan' }))

    expect(onInputAnswer).toHaveBeenCalledWith(
      'session-1',
      {
        kind: 'plan',
        decision: 'approve',
      },
      'Approved plan',
    )
  })

  it('submits active form requests from the transcript', async () => {
    const onInputAnswer = vi.fn()

    render(
      <SessionTranscript
        session={{
          ...baseSession,
          attention: 'needs-input',
        }}
        conversationItems={[
          formRequest({
            id: 'form-1',
            sequence: 1,
            providerItemId: '100',
          }),
        ]}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onInputAnswer={onInputAnswer}
      />,
    )

    expect(await screen.findByText('Form input needed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Decline' })).toHaveAttribute(
      'formnovalidate',
    )
    fireEvent.change(screen.getByRole('textbox', { name: /Title/ }), {
      target: { value: 'New issue' },
    })
    fireEvent.change(screen.getByRole('spinbutton', { name: /Estimate/ }), {
      target: { value: '5' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /Urgent/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(onInputAnswer).toHaveBeenCalledWith(
      'session-1',
      {
        kind: 'form',
        action: 'accept',
        values: {
          title: 'New issue',
          estimate: 5,
          urgent: false,
        },
      },
      'Title\nNew issue\n\nEstimate\n5\n\nUrgent\nfalse',
    )
  })

  it('declines active URL requests from the transcript', async () => {
    const onInputAnswer = vi.fn()

    render(
      <SessionTranscript
        session={{
          ...baseSession,
          attention: 'needs-input',
        }}
        conversationItems={[
          urlRequest({
            id: 'url-1',
            sequence: 1,
            providerItemId: '101',
          }),
        ]}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onInputAnswer={onInputAnswer}
      />,
    )

    expect(
      await screen.findByText('URL confirmation needed'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('https://github.com/login/oauth/authorize'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))

    expect(onInputAnswer).toHaveBeenCalledWith(
      'session-1',
      {
        kind: 'url',
        action: 'decline',
      },
      'Declined URL request',
    )
  })
})

it('R4 the rendered question answer carries its provider item id — omit dialog id turns red', async () => {
  const onInputAnswer = vi.fn()
  render(
    <SessionTranscript
      session={{ ...baseSession, attention: 'needs-input' }}
      conversationItems={[
        {
          ...inputRequest({
            id: 'question',
            sequence: 1,
            providerItemId: 'tool-question',
          }),
          responseProviderItemId: 'tool-question',
          request: {
            kind: 'choice',
            questions: [
              {
                id: 'q',
                question: 'Color?',
                header: 'Color',
                multiSelect: false,
                options: [{ label: 'Blue' }],
              },
            ],
          },
        } as ConversationItem,
      ]}
      onApprove={vi.fn()}
      onDeny={vi.fn()}
      onInputAnswer={onInputAnswer}
    />,
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Blue' }))
  const submit = screen.queryByRole('button', {
    name: /submit|send answer|answer/i,
  })
  if (submit) fireEvent.click(submit)
  expect(onInputAnswer.mock.calls[0]?.[1]?.providerItemId).toBe('tool-question')
})

it.each([
  ['running', 'needs-input'],
  ['completed', 'needs-input'],
  ['running', 'needs-approval'],
  ['completed', 'needs-approval'],
] as const)(
  'M4 mixed pending cards remain actionable while %s %s — gate on attention turns red',
  async (status, attention) => {
    const { rerender } = render(
      <SessionTranscript
        session={{
          ...baseSession,
          status,
          attention,
          hasActiveHandle: true,
        }}
        conversationItems={[
          {
            ...approvalRequest({ id: 'approval', sequence: 1 }),
            resolution: 'pending',
          } as ConversationItem,
          {
            ...inputRequest({ id: 'question', sequence: 2 }),
            resolution: 'pending',
          } as ConversationItem,
        ]}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onInputAnswer={vi.fn()}
      />,
    )
    await screen.findByTestId('approval-request-card')
    const live = {
      approve: !!screen.queryByRole('button', { name: 'Approve' }),
      answer: !!screen.queryByRole('button', { name: 'Answer' }),
    }
    rerender(
      <SessionTranscript
        session={{
          ...baseSession,
          status,
          attention,
          hasActiveHandle: false,
        }}
        conversationItems={[
          {
            ...approvalRequest({ id: 'approval', sequence: 1 }),
            resolution: 'pending',
          } as ConversationItem,
          {
            ...inputRequest({ id: 'question', sequence: 2 }),
            resolution: 'pending',
          } as ConversationItem,
        ]}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onInputAnswer={vi.fn()}
      />,
    )
    expect({
      live,
      dead: {
        approve: !!screen.queryByRole('button', { name: 'Approve' }),
        answer: !!screen.queryByRole('button', { name: 'Answer' }),
      },
    }).toEqual({
      live: { approve: true, answer: true },
      dead: { approve: false, answer: false },
    })
  },
)

it.each([
  { state: 'unsettled', loading: true, matched: false, visible: false },
  { state: 'settled matched', loading: false, matched: true, visible: false },
  { state: 'settled unmatched', loading: false, matched: false, visible: true },
])(
  'M4′ $state preserves main work and partitions attributed work — mutations show unsettled work or hide settled orphans turn red',
  ({ loading, matched, visible }) => {
    const items = [
      assistantMessage({
        id: 'main',
        sequence: 1,
        text: 'main work immediately',
      }),
      {
        ...assistantMessage({ id: 'child', sequence: 2, text: 'child work' }),
        agentRunId: 'child',
        agentAttribution: { description: 'child agent', agentType: 'Explore' },
      },
    ]
    render(
      <SessionTranscript
        session={baseSession}
        conversationItems={items}
        parallelLoading={loading}
        parallelRows={
          matched
            ? [
                {
                  id: 'child',
                  kind: 'agent',
                  parentId: null,
                  run: {
                    id: 'child',
                    spawnedByItemId: 'spawn',
                  } as SessionAgentRun,
                },
              ]
            : []
        }
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onInputAnswer={vi.fn()}
      />,
    )
    expect({
      main: !!screen.queryByText('main work immediately'),
      child: !!screen.queryByText('child work'),
      label: !!screen.queryByText('↳ child agent (Explore)'),
    }).toEqual({ main: true, child: visible, label: visible })
  },
)
