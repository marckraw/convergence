import * as markerHelpers from './parallel-work.pure'
import { useState } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
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
    <ParallelWork {...props()} items={items} selectedId="agent:agent" />,
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
      .querySelector('[data-work-id="agent:agent"]')
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
    render(<ParallelWork {...props()} rows={rows} selectedId="agent:agent" />),
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
  const input = {
    ...props(),
    selectedId: 'agent:agent',
    rows: buildParallelWork([linkedRun], [task], []),
  }
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
  fireEvent.click(
    screen.getByRole('button', { name: '1 older · time not reported' }),
  )
  expect(screen.queryByText('This task is not running')).not.toBeNull()
})

it('M7 the container marker scan runs per item/row revision, not per clock tick — mutation scan each render turns red', () => {
  vi.useFakeTimers()
  const scan = vi.spyOn(markerHelpers, 'parallelWorkMarkers')
  try {
    const input = props()
    const { rerender } = render(<ParallelWork {...input} />)
    act(() => vi.advanceTimersByTime(90000))
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

it('RUN64 R2 open-only 30s clock and ISO title — mutation tick closed or use 1s interval turns red', () => {
  vi.useFakeTimers()
  const clock = Date.parse('2026-09-09T00:04:00Z')
  vi.setSystemTime(clock)
  const interval = vi.spyOn(globalThis, 'setInterval')
  const input = props()
  const { rerender, unmount } = render(<ParallelWork {...input} open={false} />)
  const closed = interval.mock.calls.length
  rerender(<ParallelWork {...input} />)
  const first = screen.queryByText('Running · 4 m')?.getAttribute('title')
  act(() => vi.advanceTimersByTime(60000))
  const later = Boolean(screen.queryByText('Running · 5 m'))
  rerender(<ParallelWork {...input} open={false} />)
  const timersAfterClose = vi.getTimerCount()
  unmount()
  vi.useRealTimers()
  expect({
    closed,
    periods: interval.mock.calls.map((call) => call[1]),
    first,
    later,
    timersAfterClose,
  }).toEqual({
    closed: 0,
    periods: [30000],
    first: run.startedAt,
    later: true,
    timersAfterClose: 0,
  })
})
it('RUN64 R3 older bucket expands without changing all-time summary — mutation render all rows or drop archive expansion turns red', () => {
  vi.useFakeTimers()
  const clock = Date.parse('2026-09-09T12:00:00Z')
  vi.setSystemTime(clock)
  const at = (m: number) => new Date(clock - m * 60000).toISOString()
  const input = {
    ...props(),
    rows: buildParallelWork(
      [
        {
          ...run,
          id: 'old',
          description: 'Old reviewer',
          status: 'failed',
          endedAt: at(61),
        },
        {
          ...run,
          id: 'young',
          description: 'Recent reviewer',
          status: 'completed',
          endedAt: at(59),
        },
        {
          ...run,
          id: 'active',
          description: 'Active reviewer',
          startedAt: at(2),
        },
      ],
      [],
      [],
    ),
  }
  const { container, unmount } = render(<ParallelWork {...input} />)
  const before = [...container.querySelectorAll('[data-work-id]')].map((row) =>
    row.getAttribute('data-work-id'),
  )
  const bucket = screen.queryByRole('button', {
    name: '1 older · newest 1 h ago',
  })
  if (bucket) fireEvent.click(bucket)
  const after = [...container.querySelectorAll('[data-work-id]')].map((row) =>
    row.getAttribute('data-work-id'),
  )
  const summary = Boolean(
    screen.queryByText('This session · 1 running · 1 completed · 1 failed'),
  )
  unmount()
  vi.useRealTimers()
  expect({ before, after, summary }).toEqual({
    before: ['agent:active', 'agent:young'],
    after: ['agent:active', 'agent:young', 'agent:old'],
    summary: true,
  })
})

it('RUN64 R2/R3 finished-only panel ages into archive — mutation clock only with running rows turns red', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-09T01:00:00Z'))
  const input = {
    ...props(),
    rows: buildParallelWork(
      [{ ...run, status: 'completed', endedAt: '2026-09-09T00:00:30Z' }],
      [],
      [],
    ),
  }
  const { unmount } = render(<ParallelWork {...input} />)
  const before = Boolean(screen.queryByText('Completed · 59 m ago'))
  act(() => vi.advanceTimersByTime(60000))
  const bucket = Boolean(
    screen.queryByRole('button', { name: '1 older · newest 1 h ago' }),
  )
  unmount()
  vi.useRealTimers()
  expect({ before, bucket }).toEqual({ before: true, bucket: true })
})

it('RUN64 round2 one root bucket keeps visible trees whole — mutation bucket each sibling group or lose root expansion turns red', () => {
  vi.useFakeTimers()
  const clock = Date.parse('2026-09-09T12:00:00Z')
  vi.setSystemTime(clock)
  const at = (m: number) => new Date(clock - m * 60000).toISOString()
  const rows = buildParallelWork(
    [
      { ...run, id: 'active', description: 'Active', startedAt: at(4) },
      {
        ...run,
        id: 'old-child',
        description: 'Old child',
        status: 'completed',
        endedAt: at(120),
      },
      {
        ...run,
        id: 'old-root',
        description: 'Old root',
        status: 'completed',
        endedAt: at(180),
      },
      {
        ...run,
        id: 'old-descendant',
        description: 'Old descendant',
        status: 'completed',
        endedAt: at(120),
      },
    ],
    [
      {
        taskId: 'legacy',
        sessionId: 's',
        status: 'completed',
        description: 'Legacy',
        startedAt: null,
        endedAt: null,
        observedAt: null,
        toolUseId: null,
        taskType: null,
        outputFile: null,
      },
    ],
    [],
  )
  rows.find((row) => row.id === 'old-child')!.parentId = 'active'
  rows.find((row) => row.id === 'old-descendant')!.parentId = 'old-root'
  const { container, unmount } = render(
    <ParallelWork {...props()} rows={rows} />,
  )
  const before = [...container.querySelectorAll('[data-work-id]')].map((row) =>
    row.getAttribute('data-work-id'),
  )
  const buttons = screen.queryAllByRole('button', { name: /older · newest/ })
  const label = buttons[0]?.textContent
  if (buttons[0]) fireEvent.click(buttons[0])
  const after = [...container.querySelectorAll('[data-work-id]')].map((row) =>
    row.getAttribute('data-work-id'),
  )
  unmount()
  vi.useRealTimers()
  expect({ before, buttons: buttons.length, label, after }).toEqual({
    before: ['agent:active', 'agent:old-child'],
    buttons: 1,
    label: '3 older · newest 2 h ago',
    after: [
      'agent:active',
      'agent:old-child',
      'agent:old-root',
      'agent:old-descendant',
      'task:legacy',
    ],
  })
})

it.each(['reopen', 'session'] as const)(
  'RUN64 round3 bucket collapses on %s — mutation omit reset dependency turns red',
  (change) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-09T12:00:00Z'))
    const input = {
      ...props(),
      rows: buildParallelWork(
        [{ ...run, status: 'completed', endedAt: '2026-09-09T09:00:00Z' }],
        [],
        [],
      ),
    }
    const { rerender, unmount } = render(<ParallelWork {...input} />)
    const bucket = () =>
      screen.getByRole('button', { name: '1 older · newest 3 h ago' })
    fireEvent.click(bucket())
    const expanded = bucket().getAttribute('aria-expanded')
    if (change === 'reopen') {
      rerender(<ParallelWork {...input} open={false} />)
      rerender(<ParallelWork {...input} open />)
    } else {
      rerender(
        <ParallelWork {...input} session={{ ...input.session, id: 'other' }} />,
      )
    }
    const after = bucket().getAttribute('aria-expanded')
    unmount()
    vi.useRealTimers()
    expect({ expanded, after }).toEqual({ expanded: 'true', after: 'false' })
  },
)

/**
 * RUN72 / MAR-2902. A row's id is the harness's own, and the two namespaces
 * are not disjoint: a non-`local_agent` task whose id equals a run id produces
 * an agent row and a task row that share it. Every per-row surface keys on
 * `${kind}:${id}` so the two can be told apart.
 *
 * Mutation: key any one of these on the bare id and the wrong row answers —
 * `rows.find` returns whichever came first, which is the agent.
 */
const sharedIdRows = () =>
  buildParallelWork(
    [run],
    [
      {
        taskId: 'agent',
        sessionId: 's',
        status: 'running',
        description: 'Watch logs',
        startedAt: '2026-09-09T00:00:00Z',
        endedAt: null,
        observedAt: null,
        toolUseId: null,
        taskType: 'monitor',
        outputFile: null,
      },
    ],
    [],
  )

it('RUN72 an agent and a task sharing an id are separate rows on every surface — mutation key a surface on the bare id turns red', async () => {
  vi.mocked(parallelWorkApi.stop).mockReset().mockResolvedValue(undefined)
  const input = { ...props(), rows: sharedIdRows() }
  const { container } = render(<ParallelWork {...input} />)
  const taskCard = screen.getByText('Watch logs').closest('[data-work-id]')!
  // Select: the title button reports the row it belongs to, not the id alone.
  fireEvent.click(screen.getByRole('button', { name: 'Watch logs' }))
  // Confirm: the dialog names the row whose Stop was pressed.
  fireEvent.click(
    within(taskCard as HTMLElement).getByRole('button', {
      name: 'Stop',
    }),
  )
  const confirmTitle = screen.getByRole('heading', {
    name: /^Stop /,
  }).textContent
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Stop task' })),
  )
  expect({
    keys: [...container.querySelectorAll('[data-work-id]')].map((row) =>
      row.getAttribute('data-work-id'),
    ),
    selected: input.onSelect.mock.calls,
    confirmTitle,
    // Stop state belongs to one row: the agent row is running too, and under a
    // bare-id key it would report a stop nobody asked it for.
    pending: screen.getAllByText('Stop requested… awaiting confirmation')
      .length,
    requests: vi.mocked(parallelWorkApi.stop).mock.calls,
  }).toEqual({
    keys: ['agent:agent', 'task:agent'],
    selected: [['task:agent']],
    confirmTitle: 'Stop Watch logs?',
    pending: 1,
    requests: [['s', 'agent']],
  })
})

it('RUN72 a shared id selects the row the key names, not the first match — mutation resolve selection by bare id turns red', () => {
  // Two transcripts under one id: the agent's forwarded message and the task's
  // tool call. Only the row the key names may show its own.
  const items = [
    {
      id: 'agent-text',
      kind: 'message',
      actor: 'assistant',
      agentRunId: 'agent',
      text: 'agent-only.txt',
      providerMeta: {},
    },
    {
      id: 'task-tool',
      kind: 'tool-call',
      taskId: 'agent',
      toolName: 'Read',
      inputText: '{"file_path":"task-only.txt"}',
      providerMeta: {},
    },
  ] as ConversationItem[]
  const { container } = render(
    <ParallelWork
      {...props()}
      rows={sharedIdRows()}
      items={items}
      selectedId="task:agent"
    />,
  )
  const transcript = {
    heading: Boolean(screen.queryByText('Task output')),
    task: Boolean(container.textContent?.includes('task-only.txt')),
    agent: Boolean(container.textContent?.includes('agent-only.txt')),
  }
  // The details sheet reads the same selection: its fields come from the row
  // the container resolved, so a bare-id miss empties it.
  fireEvent.click(screen.getByRole('button', { name: 'Details' }))
  expect({
    ...transcript,
    details: container.querySelector('dl')?.textContent ?? null,
  }).toEqual({
    heading: true,
    task: true,
    agent: false,
    details: expect.stringContaining('Typemonitor'),
  })
})

it('RUN72 collapsing the agent under a shared id hides only its branch — mutation key collapse on the bare id turns red', () => {
  const rows = buildParallelWork(
    [
      run,
      {
        ...run,
        id: 'child',
        spawnedByItemId: 'child-spawn',
        description: 'Child work',
      },
    ],
    [
      {
        taskId: 'agent',
        sessionId: 's',
        status: 'running',
        description: 'Watch logs',
        startedAt: '2026-09-09T00:00:00Z',
        endedAt: null,
        observedAt: null,
        toolUseId: null,
        taskType: 'monitor',
        outputFile: null,
      },
    ],
    [{ id: 'child-spawn', agentRunId: 'agent' }],
  )
  render(<ParallelWork {...props()} rows={rows} />)
  const before = Boolean(screen.queryByText('Child work'))
  fireEvent.click(screen.getByRole('button', { name: 'Collapse Read routes' }))
  expect({
    before,
    // The branch folds…
    child: Boolean(screen.queryByText('Child work')),
    count: Boolean(screen.queryByText('1 descendants running')),
    // …and the task that merely shares the agent's id is untouched.
    task: Boolean(screen.queryByText('Watch logs')),
  }).toEqual({ before: true, child: false, count: true, task: true })
})

it('RUN72 selecting a hidden descendant expands its ancestors by row key — mutation delete the bare parent id turns red', () => {
  const rows = buildParallelWork(
    [
      run,
      {
        ...run,
        id: 'child',
        spawnedByItemId: 'child-spawn',
        description: 'Child work',
      },
    ],
    [
      {
        taskId: 'agent',
        sessionId: 's',
        status: 'running',
        description: 'Watch logs',
        startedAt: '2026-09-09T00:00:00Z',
        endedAt: null,
        observedAt: null,
        toolUseId: null,
        taskType: 'monitor',
        outputFile: null,
      },
    ],
    [{ id: 'child-spawn', agentRunId: 'agent' }],
  )
  const input = { ...props(), rows }
  const { rerender } = render(<ParallelWork {...input} />)
  fireEvent.click(screen.getByRole('button', { name: 'Collapse Read routes' }))
  const hidden = Boolean(screen.queryByText('Child work'))
  // The branch is folded; a selection landing inside it must open the way back.
  rerender(<ParallelWork {...input} selectedId="agent:child" />)
  rerender(<ParallelWork {...input} selectedId={null} />)
  expect({
    hidden,
    reopened: Boolean(screen.queryByText('Child work')),
  }).toEqual({ hidden: false, reopened: true })
})
