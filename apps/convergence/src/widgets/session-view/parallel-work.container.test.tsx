import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { ConversationItem, Session } from '@/entities/session'
import type { SessionAgentRun } from '@/shared/types/harness-evidence.types'
import { buildParallelWork } from '@/shared/lib/parallel-work.pure'
import { ParallelWork } from './parallel-work.container'
import { parallelWorkApi } from './parallel-work.api'

vi.mock('./parallel-work.api', () => ({ parallelWorkApi: { stop: vi.fn() } }))
const run: SessionAgentRun = {
  id: 'agent',
  sessionId: 's',
  spawnedByItemId: 'spawn',
  agentType: 'Explore',
  description: 'Read routes',
  model: null,
  status: 'running',
  depth: 1,
  startedAt: '2026-09-09T00:00:00Z',
  endedAt: null,
  transcriptPath: null,
  isBackgrounded: true,
  lastToolName: null,
  usageJson: null,
  updatedAt: null,
}
const props = () => ({
  session: { id: 's', canStopTasks: true } as Session,
  rows: buildParallelWork([run], [], []),
  items: [] as ConversationItem[],
  open: true,
  selectedId: null,
  onSelect: vi.fn(),
  onClose: vi.fn(),
  onNavigate: vi.fn(),
  loading: false,
  error: null,
})

it('R6′ keeps Stop pending after the receipt until evidence settles — mutation clear pending on receipt turns red', async () => {
  vi.mocked(parallelWorkApi.stop).mockResolvedValue(undefined)
  const input = props()
  const { rerender } = render(<ParallelWork {...input} />)
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Stop task' })),
  )
  const pending =
    screen.queryByText('Stop requested… awaiting confirmation') !== null
  const disabled = (
    screen.getByRole('button', {
      name: 'Stop',
    }) as HTMLButtonElement
  ).disabled
  rerender(
    <ParallelWork
      {...input}
      rows={buildParallelWork(
        [
          {
            ...run,
            status: 'stopped',
            stopReason: 'stop',
            endedAt: '2026-09-09T00:00:12Z',
          },
        ],
        [],
        [],
      )}
    />,
  )
  expect({
    pending,
    disabled,
    settled:
      screen.queryByText('Stop requested… awaiting confirmation') !== null,
    calls: vi.mocked(parallelWorkApi.stop).mock.calls,
  }).toEqual({
    pending: true,
    disabled: true,
    settled: false,
    calls: [['s', 'agent']],
  })
})

it('R6′ a refusal keeps the confirmed state and offers Retry stop — mutation swallow the refusal turns red', async () => {
  vi.mocked(parallelWorkApi.stop)
    .mockReset()
    .mockRejectedValue(new Error('Control refused'))
  render(<ParallelWork {...props()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Stop task' })),
  )
  expect({
    retry: Boolean(screen.queryByRole('button', { name: 'Retry stop' })),
    refusal: Boolean(screen.queryByText('Control refused')),
    running: Boolean(screen.queryByText(/^Running ·/)),
  }).toEqual({ retry: true, refusal: true, running: true })
})

it('R3′ renders the child tool in its own transcript and links rather than relocating its card — mutation omit child tool turns red', () => {
  const common = {
    sessionId: 's',
    agentRunId: 'agent',
    sequence: 1,
    turnId: null,
    state: 'complete',
    createdAt: 'now',
    updatedAt: 'now',
    providerMeta: {
      providerId: 'claude-code',
      providerItemId: null,
      providerEventType: null,
    },
  }
  const items = [
    {
      ...common,
      id: 'tool',
      kind: 'tool-call',
      toolName: 'Read',
      inputText: '{"file_path":"child-only.txt"}',
    },
    {
      ...common,
      id: 'card',
      kind: 'approval-request',
      resolution: 'pending',
      description: 'private permission card',
    },
  ] as ConversationItem[]
  const { container } = render(
    <ParallelWork {...props()} items={items} selectedId="agent" />,
  )
  expect({
    child: container.textContent?.includes('child-only.txt'),
    card: Boolean(screen.queryByText('private permission card')),
    link: Boolean(
      screen.queryByText('Waiting for your decision in the conversation →'),
    ),
  }).toEqual({ child: true, card: false, link: true })
})

it('R2 back restores the panel list scroll and selection — mutation reset list scroll on back turns red', () => {
  function Harness() {
    const [id, select] = useState<string | null>(null)
    return <ParallelWork {...props()} selectedId={id} onSelect={select} />
  }
  const { container } = render(<Harness />)
  const scroll = container.querySelector('[data-parallel-scroll]')!
  scroll.scrollTop = 132
  fireEvent.scroll(scroll)
  fireEvent.click(screen.getByRole('button', { name: 'Read routes' }))
  const transcript = Boolean(screen.queryByText('Agent transcript'))
  fireEvent.click(screen.getByRole('button', { name: 'Parallel work' }))
  expect({
    transcript,
    scroll: container.querySelector('[data-parallel-scroll]')?.scrollTop,
    selected: container
      .querySelector('[data-work-id="agent"]')
      ?.className.includes('border-blue-500'),
  }).toEqual({ transcript: true, scroll: 132, selected: true })
})

it('R4 View result exists only at a recorded return — mutation use terminal row status as a return turns red', () => {
  const input = {
    ...props(),
    rows: buildParallelWork([{ ...run, status: 'unknown' }], [], []),
  }
  const { rerender } = render(<ParallelWork {...input} />)
  const absent = screen.queryByRole('button', { name: 'View result' }) === null
  rerender(
    <ParallelWork
      {...input}
      items={[
        {
          id: 'terminal-note',
          kind: 'note',
          taskId: 'agent',
          text: 'Agent stopped',
          level: 'info',
          sessionId: 's',
          sequence: 1,
          turnId: null,
          state: 'complete',
          createdAt: '2026-09-09T00:00:12Z',
          updatedAt: '2026-09-09T00:00:12Z',
          providerMeta: {
            providerId: 'claude-code',
            providerItemId: null,
            providerEventType: 'harness.task.terminal',
          },
        },
      ]}
    />,
  )
  const button = screen.queryByRole('button', { name: 'View result' })
  if (button) fireEvent.click(button)
  expect({ absent, destination: input.onNavigate.mock.calls }).toEqual({
    absent: true,
    destination: [['terminal-note']],
  })
})
