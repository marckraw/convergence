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
      providerEventType: 'deferred_tool_use',
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
