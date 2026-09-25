import * as markerHelpers from './parallel-work.pure'
import { Profiler, useRef, useState } from 'react'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ConversationItem, Session } from '@/entities/session'
import type {
  SessionAgentRun,
  SessionTask,
} from '@/shared/types/harness-evidence.types'
import { buildParallelWork } from '@/shared/lib/parallel-work.pure'
import { ParallelWork } from './parallel-work.container'
import { parallelWorkApi } from './parallel-work.api'
import { useTranscriptViewStore } from './transcript-view.model'

vi.mock('./parallel-work.api', () => ({
  parallelWorkApi: {
    subscribeConversation: vi.fn(() => () => {}),
    readTaskResultNotes: vi.fn().mockResolvedValue([]),
    stop: vi.fn(),
    readDetail: vi.fn(),
  },
}))

// MAR-3310 O0b: the detail's by-id read answers nothing unless a test says
// otherwise, so every older test sees exactly the loaded list it passes in.
beforeEach(() => {
  vi.mocked(parallelWorkApi.readDetail).mockReset().mockResolvedValue([])
})

// MAR-3391 R5: this file is today's sidebar transcript, so it runs in Full. The
// Compact view has its own tests (R7 below).
vi.mock('./transcript-view-mode.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./transcript-view-mode.api')>()),
  loadTranscriptViewMode: () => 'full',
}))
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
/**
 * A session-view row of a given width, and the ResizeObservers watching it.
 * `resize` moves the row and fires every observer, as the browser does.
 */
function rowOf(width: number) {
  let current = width
  const row = document.createElement('div')
  row.getBoundingClientRect = () => ({ width: current }) as DOMRect
  const observers = new Set<() => void>()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private readonly callback: () => void) {}
      observe() {
        observers.add(this.callback)
      }
      unobserve() {}
      disconnect() {
        observers.delete(this.callback)
      }
    },
  )
  return {
    ref: { current: row as HTMLElement | null },
    resize: (next: number) => {
      current = next
      for (const observer of [...observers]) observer()
    },
  }
}

// Wide enough to dock with nothing else open: today's docked panel.
const wideRow = () => {
  const row = document.createElement('div')
  row.getBoundingClientRect = () => ({ width: 1700 }) as DOMRect
  return { current: row as HTMLElement | null }
}

const props = () => ({
  session: { id: 's', canStopTasks: true } as Session,
  rows: buildParallelWork([run], []),
  items: [] as ConversationItem[],
  open: true,
  selectedId: null,
  onSelect: vi.fn(),
  onClose: vi.fn(),
  onNavigate: vi.fn(),
  loading: false,
  error: null,
  rowRef: wideRow(),
  otherDockedWidths: [] as number[],
  onReturnFocus: vi.fn(),
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
    rows: buildParallelWork([{ ...run, status: 'unknown' }], []),
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
  const input = { ...props(), rowRef: rowOf(900).ref }
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
  const rows = buildParallelWork([run, { ...run, id: 'other' }], [])
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
    rows: buildParallelWork([linkedRun], [task]),
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
      rows={buildParallelWork([{ ...run, status: 'completed' }], [])}
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
        parentRunId: 'agent',
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
        parentRunId: 'agent',
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

it('MAR-3391 R7 a subagent’s tool calls fold by the transcript’s rule and open in place — mutation sidebar bypasses the rule turns red', () => {
  useTranscriptViewStore.setState({
    modes: { s: 'compact' },
    openBlocks: new Set(),
  })
  const common = {
    sessionId: 's',
    agentRunId: 'agent',
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
      id: 'said',
      sequence: 1,
      kind: 'message',
      actor: 'assistant',
      text: 'looking at routes',
    },
    ...Array.from({ length: 6 }, (_, index) => ({
      ...common,
      id: `tool-${index}`,
      sequence: 2 + index,
      kind: 'tool-call',
      toolName: 'Read',
      inputText: JSON.stringify({ file_path: `/repo/src/routes/r${index}.ts` }),
    })),
    {
      ...common,
      id: 'done',
      sequence: 9,
      kind: 'message',
      actor: 'assistant',
      text: 'routes are fine',
    },
  ] as ConversationItem[]
  try {
    render(
      <ParallelWork
        {...props()}
        session={
          { id: 's', canStopTasks: true, workingDirectory: '/repo' } as Session
        }
        items={items}
        selectedId="agent:agent"
      />,
    )
    const folded = {
      blocks: screen
        .queryAllByTestId('work-block')
        .map((block) => block.textContent),
      tools: document.body.textContent?.includes('r3.ts'),
      said: [
        Boolean(screen.queryByText('looking at routes')),
        Boolean(screen.queryByText('routes are fine')),
      ],
    }
    fireEvent.click(screen.getByTestId('work-block'))
    expect({
      folded,
      opened: {
        expanded: screen
          .getByTestId('work-block')
          .getAttribute('aria-expanded'),
        tools: document.body.textContent?.includes('r3.ts'),
      },
    }).toEqual({
      folded: {
        blocks: ['Read 6 files in src/routes'],
        tools: false,
        said: [true, true],
      },
      opened: { expanded: 'true', tools: true },
    })
  } finally {
    useTranscriptViewStore.setState({ modes: {}, openBlocks: new Set() })
  }
})

it('MAR-3391 R1/R7 D2 the sidebar never folds an entry the parallel-work markers speak for — mutation drop isMarked turns red', () => {
  useTranscriptViewStore.setState({
    modes: { s: 'compact' },
    openBlocks: new Set(),
  })
  const common = {
    sessionId: 's',
    agentRunId: 'agent',
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
  const readCall = (id: string, sequence: number) => ({
    ...common,
    id,
    sequence,
    kind: 'tool-call',
    toolName: 'Read',
    inputText: JSON.stringify({ file_path: `/repo/src/${id}.ts` }),
  })
  const items = [
    readCall('before', 1),
    {
      ...common,
      id: 'nested-spawn',
      sequence: 2,
      kind: 'tool-call',
      toolName: 'Task',
      inputText: JSON.stringify({ description: 'nested probe' }),
    },
    readCall('after', 3),
  ] as ConversationItem[]
  const nested: SessionAgentRun = {
    ...run,
    id: 'nested',
    spawnedByItemId: 'nested-spawn',
    description: 'Nested probe',
    depth: 2,
  }
  try {
    render(
      <ParallelWork
        {...props()}
        session={
          { id: 's', canStopTasks: true, workingDirectory: '/repo' } as Session
        }
        rows={buildParallelWork([run, nested], [])}
        items={items}
        selectedId="agent:agent"
      />,
    )
    const transcript = screen.getByRole('heading', {
      name: 'Agent transcript',
    }).parentElement!
    const shape = [...transcript.children]
      .filter((child) => child.tagName !== 'H3' && child.tagName !== 'P')
      .map((child) => {
        const block = child.querySelector('[data-testid="work-block"]')
        return block ? `block:${block.textContent}` : 'entry'
      })
    // The agent is still running, so the last block is the live one (R4).
    expect(shape).toEqual([
      'block:Read 1 file',
      'entry',
      'block:Working… read 1 file',
    ])
  } finally {
    useTranscriptViewStore.setState({ modes: {}, openBlocks: new Set() })
  }
})

it.each(['full', 'window'] as const)(
  'MAR-3310 O0b R2/R3 with the %s conversation loaded, the detail shows the older transcript, resolves View result and the pending decision, and keeps the live text — mutations drop the read or let the fetched copy win turn red',
  async (loaded) => {
    const common = {
      sessionId: 's',
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
    const older = [
      {
        ...common,
        id: 'older-tool',
        sequence: 1,
        agentRunId: 'agent',
        kind: 'tool-call',
        toolName: 'Read',
        inputText: '{"file_path":"older-file.txt"}',
      },
      {
        ...common,
        id: 'older-request',
        sequence: 2,
        agentRunId: 'agent',
        kind: 'approval-request',
        resolution: 'pending',
        description: 'older permission card',
      },
      {
        ...common,
        id: 'older-note',
        sequence: 3,
        taskId: 'harness',
        kind: 'note',
        text: 'Task finished',
        providerMeta: {
          ...common.providerMeta,
          providerEventType: 'harness.task.terminal',
        },
      },
    ] as ConversationItem[]
    const live = (text: string) =>
      ({
        ...common,
        id: 'live',
        sequence: 4,
        agentRunId: 'agent',
        kind: 'message',
        actor: 'assistant',
        text,
      }) as ConversationItem
    // Main answered before the last chunk streamed in.
    vi.mocked(parallelWorkApi.readDetail).mockResolvedValue([
      ...older,
      live('stale snapshot'),
    ])
    const onNavigate = vi.fn()
    const rows = buildParallelWork(
      [{ ...run, taskId: 'harness' }],
      [
        {
          taskId: 'harness',
          sessionId: 's',
          status: 'completed',
          description: 'Read routes',
          startedAt: '2026-09-09T00:00:00Z',
          endedAt: '2026-09-09T00:00:09Z',
          observedAt: null,
          toolUseId: null,
          taskType: 'local_agent',
          outputFile: null,
        },
      ],
    )
    const items =
      loaded === 'full'
        ? [...older, live('the live reply')]
        : [live('the live reply')]
    const { container } = render(
      <ParallelWork
        {...props()}
        rows={rows}
        items={items}
        selectedId="agent:agent"
        onNavigate={onNavigate}
      />,
    )
    await act(async () => {})
    fireEvent.click(
      screen.getByText('Waiting for your decision in the conversation →'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'View result' }))
    expect({
      read: vi.mocked(parallelWorkApi.readDetail).mock.calls,
      olderTool: container.textContent?.includes('older-file.txt'),
      live: container.textContent?.includes('the live reply'),
      stale: container.textContent?.includes('stale snapshot'),
      navigated: onNavigate.mock.calls,
    }).toEqual({
      read: [['s', ['agent', 'harness']]],
      olderTool: true,
      live: true,
      stale: false,
      navigated: [['older-request'], ['older-note']],
    })
  },
)

it('MAR-3310 O0b R2 a failed detail read says so beside what is loaded — mutation swallow the failure turns red', async () => {
  vi.mocked(parallelWorkApi.readDetail).mockRejectedValue(
    new Error('database is locked'),
  )
  render(<ParallelWork {...props()} selectedId="agent:agent" />)
  await act(async () => {})
  expect(screen.getByRole('alert').textContent).toBe(
    'Could not read the earlier part of this work: database is locked',
  )
})

it('O1 R4 an unselected card keeps View result when its task note predates the window', async () => {
  const input = {
    ...props(),
    rows: buildParallelWork([{ ...run, taskId: 'separate-task-id' }], []),
  }
  const note = {
    id: 'old-result',
    sessionId: 's',
    sequence: 1,
    turnId: null,
    kind: 'note',
    state: 'complete',
    text: 'Finished',
    taskId: 'separate-task-id',
    createdAt: 'now',
    updatedAt: 'now',
    providerMeta: {
      providerId: 'fake',
      providerItemId: null,
      providerEventType: 'harness.task.terminal',
    },
  } as ConversationItem
  vi.mocked(parallelWorkApi.readTaskResultNotes).mockResolvedValueOnce([note])
  render(<ParallelWork {...input} />)
  await act(async () => {})
  fireEvent.click(screen.getByRole('button', { name: 'View result' }))
  expect(input.onNavigate).toHaveBeenCalledWith('old-result')
  expect(parallelWorkApi.readDetail).not.toHaveBeenCalled()
})

// MAR-3426 CH2: the conversation's own row decides, not the window.
const dialog = () => screen.queryByRole('dialog', { name: 'Parallel work' })
const docked = () =>
  dialog() === null &&
  screen.queryByRole('complementary', { name: 'Parallel work' }) !== null

it.each([
  [900, { overlay: true, docked: false }],
  [1700, { overlay: false, docked: true }],
])(
  'CH2 R2 a wide window with a %ipx row picks the mode by the row — mutation restore matchMedia turns red',
  (width, expected) => {
    vi.stubGlobal('innerWidth', 1800)
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === '(max-width: 1100px)' && window.innerWidth <= 1100,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )
    render(<ParallelWork {...props()} rowRef={rowOf(width).ref} />)
    expect({ overlay: dialog() !== null, docked: docked() }).toEqual(expected)
  },
)

it('CH2 R1 wiring: a row that fits the panel alone overlays once PR and Space take their share', () => {
  render(
    <ParallelWork
      {...props()}
      rowRef={rowOf(1400).ref}
      otherDockedWidths={[320, 320]}
    />,
  )
  expect(dialog()).not.toBeNull()
})

it('CH2 R3 shrinking past the bound keeps the panel open as the overlay; Escape closes it and focus returns to the trigger — mutation close on a mode change turns red', async () => {
  const row = rowOf(1700)
  const input = props()
  function Harness() {
    const [open, setOpen] = useState(false)
    const trigger = useRef<HTMLButtonElement>(null)
    return (
      <>
        <button ref={trigger} onClick={() => setOpen(true)}>
          Parallel work trigger
        </button>
        <ParallelWork
          {...input}
          rowRef={row.ref}
          open={open}
          onClose={() => {
            // SessionView's closeParallel: close, then focus the invoker --
            // which a still-mounted overlay's trap pulls back inside.
            setOpen(false)
            trigger.current?.focus()
          }}
          onReturnFocus={() => trigger.current?.focus()}
        />
      </>
    )
  }
  render(<Harness />)
  const trigger = screen.getByRole('button', { name: 'Parallel work trigger' })
  trigger.focus()
  fireEvent.click(trigger)
  const dockedFirst = docked()
  act(() => row.resize(900))
  const overlayAfterShrink = dialog() !== null
  await act(async () =>
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    }),
  )
  // The dialog's focus trap lets go on a later task; wait for it rather than
  // guess which one.
  await waitFor(() => expect(document.activeElement).toBe(trigger))
  expect({
    dockedFirst,
    overlayAfterShrink,
    closed: dialog() === null && !docked(),
  }).toEqual({
    dockedFirst: true,
    overlayAfterShrink: true,
    closed: true,
  })
})

it('CH2 R4 twenty resizes on one side of the bound render nothing; crossing it renders — mutation keep the width in state turns red', () => {
  const row = rowOf(1700)
  let commits = 0
  render(
    <Profiler id="parallel-work" onRender={() => commits++}>
      <ParallelWork {...props()} rowRef={row.ref} />
    </Profiler>,
  )
  const settled = commits
  for (let step = 1; step <= 20; step++) act(() => row.resize(1700 - step * 10))
  const sameSide = commits - settled
  act(() => row.resize(900))
  // Crossing mounts the dialog, whose own parts commit a few times; what
  // matters is that it renders at all, and that nothing did before it.
  expect({ sameSide, crossed: commits - settled - sameSide > 0 }).toEqual({
    sameSide: 0,
    crossed: true,
  })
})
