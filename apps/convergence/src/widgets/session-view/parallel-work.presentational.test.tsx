import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { SessionAgentRun } from '@/shared/types/harness-evidence.types'
import { buildParallelWork } from '@/shared/lib/parallel-work.pure'
import * as rowHelpers from './parallel-work.pure'
import * as workHelpers from '@/shared/lib/parallel-work.pure'
import { ParallelWorkPanel } from './parallel-work.presentational'

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

it('R7 unknown elapsed is fixed and provisional identity stays out of the title — mutation advance unknown elapsed or show provider id turns red', () => {
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
      now={Date.parse('2026-09-10T00:00:00Z')}
      onSelect={vi.fn()}
      onClose={vi.fn()}
    />,
  )
  expect({
    title: Boolean(screen.queryByText('Subagent')),
    idInTitle: container.textContent?.includes('tool-provisional'),
    fixed: Boolean(
      screen.queryByText('Unknown · last seen 2026-09-09T00:00:12Z · 0:12'),
    ),
  }).toEqual({ title: true, idInTitle: false, fixed: true })
})

it.each([
  'Inspect routing',
  'Explore · haiku · depth 2',
  'Failed · 0:12',
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
    expect(screen.getByText(`${label} · 0:12`)).toBeInTheDocument()
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
  const expandedCount = !!screen.queryByText('1 descendants running')
  const first = [descendants.mock.calls.length, decisions.mock.calls.length]
  rerender(<ParallelWorkPanel {...input} now={1000} />)
  const next = [descendants.mock.calls.length, decisions.mock.calls.length]
  rerender(
    <ParallelWorkPanel {...input} now={2000} collapsed={new Set(['parent'])} />,
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
    const collapsed = new Set(['parent'])
    for (let i = 0; i < 20; i++)
      rerender(
        <ParallelWorkPanel
          {...input}
          collapsed={collapsed}
          items={[{ id: 'stream', kind: 'message', actor: 'assistant' }]}
        />,
      )
    expect({ expanded, scans: scan.mock.calls.map(([, id]) => id) }).toEqual({
      expanded: 0,
      scans: ['parent'],
    })
  } finally {
    scan.mockRestore()
  }
})
