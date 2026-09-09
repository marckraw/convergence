import * as markerHelpers from './parallel-work.pure'
import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ConversationItem, Session } from '@/entities/session'
import type {
  SessionAgentRun,
  SessionTask,
} from '@/shared/types/harness-evidence.types'
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

it.each([
  'Control refused',
  "Error invoking remote method 'session:stopTask': Error: Control refused",
])(
  'L7/R6′ a refusal shows the service message and offers Retry stop — mutation show raw IPC wrapper or swallow refusal turns red (%s)',
  async (message) => {
    vi.mocked(parallelWorkApi.stop)
      .mockReset()
      .mockRejectedValue(new Error(message))
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
  },
)

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

afterEach(() => vi.unstubAllGlobals())

it('T10 narrow sheet closes when navigating to the spawn — mutations force wide or omit close on navigate turn red', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
  const input = props()
  function Harness() {
    const [open, setOpen] = useState(true)
    return (
      <ParallelWork {...input} open={open} onClose={() => setOpen(false)} />
    )
  }
  render(<Harness />)
  const sheet = Boolean(screen.queryByRole('dialog', { name: 'Parallel work' }))
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'View spawn' })),
  )
  expect({
    sheet,
    closed: screen.queryByRole('dialog', { name: 'Parallel work' }) === null,
    destination: input.onNavigate.mock.calls,
  }).toEqual({ sheet: true, closed: true, destination: [['spawn']] })
})

it('T10 cyclic ancestry finishes selection — mutation remove visited parent guard turns red', () => {
  const rows = buildParallelWork([run, { ...run, id: 'other' }], [], [])
  rows[0].parentId = 'other'
  rows[1].parentId = 'agent'
  let reads = 0
  const originalFind = rows.find.bind(rows)
  rows.find = ((...args: Parameters<typeof rows.find>) => {
    if (++reads > 100) throw new Error('Ancestry traversal did not terminate')
    return originalFind(...args)
  }) as typeof rows.find
  expect(() =>
    render(<ParallelWork {...props()} rows={rows} selectedId="agent" />),
  ).not.toThrow()
})

it('H2 a missed-adoption row stops by the harness id and settles from its task with a result link — mutation stop by row id or use run status turns red', async () => {
  vi.mocked(parallelWorkApi.stop).mockReset().mockResolvedValue(undefined)
  const task = {
    taskId: 'harness',
    sessionId: 's',
    taskType: 'local_agent',
    status: 'running',
  } as SessionTask
  const linkedRun = { ...run, taskId: 'harness' }
  const input = { ...props(), rows: buildParallelWork([linkedRun], [task], []) }
  const { rerender } = render(<ParallelWork {...input} />)
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Stop task' })),
  )
  rerender(
    <ParallelWork
      {...input}
      rows={buildParallelWork(
        [linkedRun],
        [{ ...task, status: 'completed', endedAt: '2026-09-09T00:00:12Z' }],
        [],
      )}
      items={[
        {
          id: 'terminal',
          kind: 'note',
          taskId: 'harness',
          text: 'returned',
          providerMeta: { providerEventType: 'harness.task.terminal' },
        } as ConversationItem,
      ]}
    />,
  )
  const result = screen.queryByRole('button', { name: 'View result' })
  if (result) fireEvent.click(result)
  expect({
    requests: vi.mocked(parallelWorkApi.stop).mock.calls,
    disabled: (
      screen.getByRole('button', { name: 'Stop' }) as HTMLButtonElement
    ).disabled,
    destination: input.onNavigate.mock.calls,
  }).toEqual({
    requests: [['s', 'harness']],
    disabled: true,
    destination: [['terminal']],
  })
})

it('L8 a refused Stop stays visible after the row is no longer running — mutation hide or erase settled refusal turns red', async () => {
  vi.mocked(parallelWorkApi.stop)
    .mockReset()
    .mockRejectedValue(new Error('This task is not running'))
  const input = props()
  const { rerender } = render(<ParallelWork {...input} />)
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Stop task' })),
  )
  rerender(
    <ParallelWork
      {...input}
      rows={buildParallelWork([{ ...run, status: 'completed' }], [], [])}
    />,
  )
  expect(screen.queryByText('This task is not running')).not.toBeNull()
})

it('M7 the container marker scan runs per item/row revision, not per clock tick — mutation scan each render turns red', () => {
  vi.useFakeTimers()
  const scan = vi.spyOn(markerHelpers, 'parallelWorkMarkers')
  try {
    const input = props()
    const { rerender } = render(<ParallelWork {...input} />)
    act(() => vi.advanceTimersByTime(3000))
    const afterTicks = scan.mock.calls.length
    rerender(<ParallelWork {...input} items={[]} />)
    expect({ afterTicks, revised: scan.mock.calls.length }).toEqual({
      afterTicks: 1,
      revised: 2,
    })
  } finally {
    scan.mockRestore()
    vi.useRealTimers()
  }
})
