import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { SessionAgentRun } from '@/shared/types/harness-evidence.types'
import { buildParallelWork } from '@/shared/lib/parallel-work.pure'
import * as rowHelpers from './parallel-work.pure'
import * as workHelpers from '@/shared/lib/parallel-work.pure'
import { ParallelWorkPanel } from './parallel-work.presentational'
import { PARALLEL_WORK_CARD_TONE_CLASS } from './parallel-work.pure'

afterEach(() => vi.restoreAllMocks())

const agent: SessionAgentRun = {
  id: 'agent',
  sessionId: 's',
  spawnedByItemId: 'spawn',
  agentType: 'Explore',
  description: 'Inspect routing',
  model: 'haiku',
  depth: 2,
  status: 'failed',
  startedAt: '2026-09-09T00:00:00Z',
  endedAt: '2026-09-09T00:00:12Z',
  transcriptPath: null,
  lastToolName: 'Read',
  usageJson: null,
  updatedAt: null,
  isBackgrounded: true,
  endedSummary: 'Upstream refused the request',
}

it('R6 renders capability reasons with disabled controls — mutation enable unavailable controls or remove reasons turns red', () => {
  render(
    <ParallelWorkPanel
      rows={buildParallelWork([{ ...agent, status: 'running' }], [], [])}
      now={0}
      onSelect={vi.fn()}
      onClose={vi.fn()}
    />,
  )
  expect({
    stop: screen
      .queryByTitle('Stop is not available on this Claude Code version')
      ?.querySelector('button')?.disabled,
    message: (
      screen.queryByRole('button', {
        name: 'Message is not available on this Claude Code version',
      }) as HTMLButtonElement | null
    )?.disabled,
  }).toEqual({ stop: true, message: true })
})

it('RUN64 R2 unknown last sighting has a relative age and provisional identity stays out of the title — mutation omit relative age or show provider id turns red', () => {
  const { container } = render(
    <ParallelWorkPanel
      rows={buildParallelWork(
        [
          {
            ...agent,
            id: 'tool-provisional',
            status: 'unknown',
            description: null,
            agentType: null,
            model: null,
          },
        ],
        [],
        [],
      )}
      now={Date.parse('2026-09-09T00:04:12Z')}
      onSelect={vi.fn()}
      onClose={vi.fn()}
    />,
  )
  expect({
    title: Boolean(screen.queryByText('Subagent')),
    idInTitle: container.textContent?.includes('tool-provisional'),
    fixed: Boolean(screen.queryByText('Unknown · last seen 4 m ago')),
  }).toEqual({ title: true, idInTitle: false, fixed: true })
})

it.each([
  'Inspect routing',
  'Explore · haiku · depth 2',
  'Failed · 59 m ago',
  'Last tool: Read',
  'Reported by the harness: Upstream refused the request',
])('R2/R7 renders %s — mutation omit that reported field turns red', (text) => {
  render(
    <ParallelWorkPanel
      rows={buildParallelWork([agent], [], [])}
      now={Date.parse('2026-09-09T01:00:00Z')}
      onSelect={vi.fn()}
      onClose={vi.fn()}
    />,
  )
  expect(screen.getByText(text)).toBeInTheDocument()
})

it('R7 renders the frozen empty state — mutation omit empty copy turns red', () => {
  render(
    <ParallelWorkPanel
      rows={[]}
      now={0}
      onSelect={vi.fn()}
      onClose={vi.fn()}
    />,
  )
  expect(
    screen.getByText(
      'No parallel work yet. Agents, background commands and monitors will appear here when this session starts them.',
    ),
  ).toBeInTheDocument()
})

it.each([
  ['quit', 'Stopped by quit'],
  ['idle', 'Stopped after idle timeout'],
  ['account', 'Stopped by account change'],
  ['stop', 'Stopped by you'],
  [null, 'Stopped'],
] as const)(
  'R7 renders stop reason %s — mutation erase local stop reason turns red',
  (stopReason, label) => {
    render(
      <ParallelWorkPanel
        rows={buildParallelWork(
          [{ ...agent, status: 'stopped', stopReason }],
          [],
          [],
        )}
        now={0}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(`${label} · < 1 m ago`)).toBeInTheDocument()
  },
)

it('R3′ links a pending decision and removes the link when resolved — mutation omit pending link or retain resolved link turns red', () => {
  const props = {
    rows: buildParallelWork([agent], [], []),
    now: 0,
    onSelect: vi.fn(),
    onClose: vi.fn(),
  }
  const { rerender } = render(
    <ParallelWorkPanel
      {...props}
      items={[
        {
          id: 'card',
          kind: 'approval-request',
          agentRunId: 'agent',
          resolution: 'pending',
        },
      ]}
    />,
  )
  const pending =
    screen.queryByText('Waiting for your decision in the conversation →') !==
    null
  rerender(
    <ParallelWorkPanel
      {...props}
      items={[
        {
          id: 'card',
          kind: 'approval-request',
          agentRunId: 'agent',
          resolution: 'approved',
        },
      ]}
    />,
  )
  expect({
    pending,
    resolved:
      screen.queryByText('Waiting for your decision in the conversation →') !==
      null,
  }).toEqual({ pending: true, resolved: false })
})

it('L9 descendant count is collapsed-only and decorations are cached across ticks — mutations show expanded count or rescan every tick turn red', () => {
  const descendants = vi.spyOn(rowHelpers, 'descendantActivity')
  const decisions = vi.spyOn(workHelpers, 'pendingAgentDecision')
  const rows = buildParallelWork(
    [
      { ...agent, id: 'parent', spawnedByItemId: 'root', status: 'completed' },
      { ...agent, id: 'child', spawnedByItemId: 'spawn', status: 'running' },
    ],
    [],
    [{ id: 'spawn', agentRunId: 'parent' }],
  )
  const items: [] = []
  const input = { rows, items, now: 0, onSelect: vi.fn(), onClose: vi.fn() }
  const { rerender } = render(<ParallelWorkPanel {...input} />)
  const expandedCount = !!screen.queryByText(/descendants running/)
  const first = [descendants.mock.calls.length, decisions.mock.calls.length]
  rerender(<ParallelWorkPanel {...input} now={1000} />)
  const next = [descendants.mock.calls.length, decisions.mock.calls.length]
  rerender(
    <ParallelWorkPanel
      {...input}
      now={2000}
      collapsed={new Set(['agent:parent'])}
    />,
  )
  expect({
    expandedCount,
    stable: JSON.stringify(first) === JSON.stringify(next),
    collapsedCount: !!screen.queryByText('1 descendants running'),
  }).toEqual({ expandedCount: false, stable: true, collapsedCount: true })
})

it('T10 duplicate identity in a malformed branch cannot recurse forever — mutation remove render seen guard turns red', () => {
  const rows = buildParallelWork([agent, { ...agent, id: 'child' }], [], [])
  rows[1].parentId = 'agent'
  rows.push({ ...rows[0], parentId: 'child' })
  expect(() =>
    render(
      <ParallelWorkPanel
        rows={rows}
        now={0}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    ),
  ).not.toThrow()
})

it('M7 descendant scans are lazy and independent of streaming items — mutation sweep every row per token turns red', () => {
  const rows = buildParallelWork(
    [
      { ...agent, id: 'parent' },
      { ...agent, id: 'child', status: 'running' },
    ],
    [],
    [],
  )
  rows[1].parentId = 'parent'
  const scan = vi.spyOn(rowHelpers, 'descendantActivity')
  try {
    const input = { rows, now: 0, onSelect: vi.fn(), onClose: vi.fn() }
    const { rerender } = render(<ParallelWorkPanel {...input} />)
    const expanded = scan.mock.calls.length
    const collapsed = new Set(['agent:parent'])
    for (let i = 0; i < 20; i++)
      rerender(
        <ParallelWorkPanel
          {...input}
          collapsed={collapsed}
          items={[{ id: 'stream', kind: 'message', actor: 'assistant' }]}
        />,
      )
    expect({
      expanded,
      scans: scan.mock.calls.map(([, row]) => row.id),
    }).toEqual({
      expanded: 0,
      scans: ['parent'],
    })
  } finally {
    scan.mockRestore()
  }
})

it('RUN64 R2′ task labels distinguish sighting and missing time with ISO titles — mutation use start or now for sighting turns red', () => {
  const rows = buildParallelWork(
    [],
    [
      {
        taskId: 'seen',
        sessionId: 's',
        toolUseId: null,
        taskType: null,
        description: 'Seen command',
        status: 'running',
        startedAt: null,
        endedAt: null,
        observedAt: '2026-09-09T00:00:00Z',
        outputFile: null,
      },
      {
        taskId: 'legacy',
        sessionId: 's',
        toolUseId: null,
        taskType: null,
        description: 'Legacy command',
        status: 'running',
        startedAt: null,
        endedAt: null,
        observedAt: null,
        outputFile: null,
      },
    ],
    [],
  )
  render(
    <ParallelWorkPanel
      rows={rows}
      now={Date.parse('2026-09-09T00:04:00Z')}
      onSelect={vi.fn()}
      onClose={vi.fn()}
    />,
  )
  expect({
    seen: screen.queryByText('Running · seen 4 m ago')?.getAttribute('title'),
    legacy: screen
      .queryByText('Running · time not reported')
      ?.hasAttribute('title'),
  }).toEqual({ seen: '2026-09-09T00:00:00Z', legacy: false })
})

it('RUN64 round3 bucket uses the folded seen anchor — mutation restate ended-only newest in the view turns red', () => {
  const now = Date.parse('2026-09-09T12:00:00Z')
  render(
    <ParallelWorkPanel
      rows={buildParallelWork(
        [{ ...agent, status: 'completed', endedAt: '2026-09-09T08:00:00Z' }],
        [
          {
            taskId: 'seen',
            sessionId: 's',
            status: 'completed',
            description: 'Seen task',
            startedAt: null,
            endedAt: null,
            observedAt: '2026-09-09T09:00:00Z',
            toolUseId: null,
            taskType: null,
            outputFile: null,
          },
        ],
        [],
      )}
      now={now}
      onSelect={vi.fn()}
      onClose={vi.fn()}
    />,
  )
  expect(
    screen.queryByRole('button', { name: '2 older · newest 3 h ago' })
      ?.textContent,
  ).toBe('2 older · newest 3 h ago')
})

it('RUN64 round3 rendered children belong to the agent on an id collision — mutation reverse view parent precedence turns red', () => {
  const rows = buildParallelWork(
    [
      {
        ...agent,
        id: 'shared',
        description: 'Agent parent',
        status: 'running',
      },
      { ...agent, id: 'child', description: 'Child', status: 'running' },
    ],
    [
      {
        taskId: 'shared',
        sessionId: 's',
        status: 'running',
        description: 'Task parent',
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
  rows.find((row) => row.id === 'child')!.parentId = 'shared'
  render(
    <ParallelWorkPanel
      rows={rows}
      now={0}
      onSelect={vi.fn()}
      onClose={vi.fn()}
    />,
  )
  expect({
    agentParent: Boolean(
      screen.queryByRole('button', { name: 'Collapse Agent parent' }),
    ),
    taskParent: Boolean(
      screen.queryByRole('button', { name: 'Collapse Task parent' }),
    ),
  }).toEqual({ agentParent: true, taskParent: false })
})

it('RUN64 round3 computes one time per rendered row — mutation recompute the label turns red', () => {
  const time = vi.spyOn(workHelpers, 'parallelWorkTime')
  const now = Date.parse('2026-09-09T00:04:00Z')
  const rows = buildParallelWork([{ ...agent, status: 'running' }], [], [])
  render(
    <ParallelWorkPanel
      rows={rows}
      now={now}
      onSelect={vi.fn()}
      onClose={vi.fn()}
    />,
  )
  expect({
    calls: time.mock.calls,
    title: screen.getByText('Running · 4 m').title,
  }).toEqual({ calls: [[rows[0], now]], title: agent.startedAt })
})

it.each([
  ['running', 'border-blue-500/40 bg-blue-500/10'],
  ['completed', 'border-emerald-500/30 bg-emerald-500/[0.06]'],
  ['failed', 'border-red-500/40 bg-red-500/10'],
  ['stopped', 'border-amber-500/30 bg-amber-500/[0.06]'],
  ['unknown', 'border-border/50 bg-muted/30'],
] as const)(
  'MAR-3308 R1 a %s card wears its state with no selection memory at all — mutation key the tone on highlightedId turns red',
  (status, tone) => {
    const { container } = render(
      <ParallelWorkPanel
        rows={buildParallelWork([{ ...agent, status }], [], [])}
        now={Date.parse('2026-09-09T00:04:12Z')}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const card = container.querySelector('[data-work-id="agent:agent"]')!
    expect({
      tone: tone.split(' ').every((name) => card.classList.contains(name)),
      ring: card.className.includes('ring-'),
    }).toEqual({ tone: true, ring: false })
  },
)

it('MAR-3308 R2 the card you came back to keeps its state tone and adds a ring — mutation let the highlight replace the tone turns red', () => {
  const { container } = render(
    <ParallelWorkPanel
      rows={buildParallelWork(
        [
          { ...agent, status: 'completed' },
          { ...agent, id: 'other', status: 'running' },
        ],
        [],
        [],
      )}
      now={Date.parse('2026-09-09T00:04:12Z')}
      highlightedId="agent:agent"
      onSelect={vi.fn()}
      onClose={vi.fn()}
    />,
  )
  const classesOf = (key: string) =>
    container.querySelector(`[data-work-id="${key}"]`)!.className
  expect({
    returnedTone: classesOf('agent:agent').includes(
      'border-emerald-500/30 bg-emerald-500/[0.06]',
    ),
    returnedRing: classesOf('agent:agent').includes(
      'ring-1 ring-inset ring-blue-500/50',
    ),
    returnedNotBlueTint: classesOf('agent:agent').includes('bg-blue-500/10'),
    otherTone: classesOf('agent:other').includes(
      'border-blue-500/40 bg-blue-500/10',
    ),
    otherRing: classesOf('agent:other').includes('ring-'),
  }).toEqual({
    returnedTone: true,
    returnedRing: true,
    returnedNotBlueTint: false,
    otherTone: true,
    otherRing: false,
  })
})

/**
 * Tailwind emits a class only if it has SCANNED that exact text, so the tone
 * map's value being right at runtime proves nothing: `border-${colour}-500/40`
 * evaluates to the same string and emits no CSS at all — the card would lose
 * its colour in the packaged app with every test green (the shape that killed
 * the code-block buttons in MAR-2760). This canary reads the source Tailwind
 * reads and asserts each class appears there verbatim.
 */
it('MAR-3308 R1 every tone class is literal in the source Tailwind scans — mutation assemble a tone from parts turns red', () => {
  const source = readFileSync(
    resolve(__dirname, 'parallel-work.pure.ts'),
    'utf8',
  )
  const missing = Object.values(PARALLEL_WORK_CARD_TONE_CLASS)
    .flatMap((tone) => tone.split(' '))
    .filter((className) => !source.includes(className))
  expect(missing).toEqual([])
})
