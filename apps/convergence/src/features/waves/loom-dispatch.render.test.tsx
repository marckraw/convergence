import { planAutoDispatch } from '../../../electron/backend/tracker/auto-dispatch.pure'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { LoomSheetView } from './loom-sheet.presentational'
import { LoomStackView } from './loom-stack.presentational'
import { LoomStripView } from './loom-strip.presentational'
import * as sheetsModule from './loom-sheets.pure'
import { ledgerEntry } from './wave-rows.fixture'
import type { DispatchPlan } from '@/shared/types/tracker.types'
import type { LoomStackProps } from './loom-stack.types'

const now = Date.parse('2026-09-21T12:34:00.000Z')
const entry = ledgerEntry({
  issueIdentifier: 'MAR-1',
  state: 'assigned',
  fact: {
    logicalStatus: null,
    branchName: null,
    updatedAt: null,
    groomed: true,
    grounded: true,
    dispatch: true,
  },
})
const sheets = sheetsModule.loomSheets([entry], now)
// A real horse fixture, with the same identity join as the live renderer.
const horse = {
  key: 'crew-1:opus',
  crewId: 'crew-1',
  crewName: null,
  seat: 'opus',
  kind: 'resident' as const,
  runtime: 'idle' as const,
  hostLabel: 'This Mac',
  hostMarker: null,
  sessionId: 'session-opus',
  openable: true,
  held: null,
  heldFrom: null,
  conversationMissing: false,
  returned: null,
}
const base = {
  sheets,
  now,
  horses: [horse],
  qaExpanded: false,
  onToggleQa: () => {},
  inertReason: () => null,
  onOpen: () => {},
}
const plan: DispatchPlan = {
  plannedAt: new Date(now).toISOString(),
  warnings: [],
  order: { opus: [entry.issueId] },
  words: { [entry.issueId]: { kind: 'seat-busy', why: 'turn' } },
}
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('R8 rendered Next', () => {
  it('without a plan retains ready text and the original footer', () => {
    render(<LoomSheetView {...base} sheet="next" />)
    expect(screen.getByText('1 · ready')).toBeTruthy()
    expect(
      screen.getByText(
        'Order: priority, then issue number · running work stays in Now',
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/nothing is sent yet/)).toBeNull()
  })
  it('with a plan renders its sentence and planned-time footer', () => {
    render(<LoomSheetView {...base} sheet="next" dispatchPlan={plan} />)
    expect(screen.getByText('seat busy · turn running')).toBeTruthy()
    expect(
      screen.getByText(
        'Order: priority, then first labeled for dispatch · running work stays in Now',
      ),
    ).toBeTruthy()
    expect(
      screen.getByText(
        /Planned \d\d:\d\d · nothing is sent yet — auto-dispatch is not built/,
      ),
    ).toBeTruthy()
    expect(screen.queryByText('1 · ready')).toBeNull()
  })
  it('R8b stack title, sheet and visually unchanged strip all consume the planned counts', () => {
    const counts = vi.spyOn(sheetsModule, 'loomSheetCounts')
    const props: LoomStackProps = {
      ...base,
      dispatchPlan: plan,
      open: 'next',
      onSelectSheet: () => {},
      onOpenGuide: () => {},
      header: { kind: 'quiet' } as LoomStackProps['header'],
      subline: { text: 'crew', picker: null },
      search: null,
      field: {
        value: '',
        onChange: () => {},
        onClear: () => {},
        onApply: () => {},
        revealed: false,
        onToggleReveal: () => {},
        onShortcut: () => {},
      },
    }
    const stack = render(<LoomStackView {...props} />)
    expect(screen.getByText('Next · 0 ready · 1 preparing')).toBeTruthy()
    expect(screen.getByText('seat busy · turn running')).toBeTruthy()
    expect(counts.mock.calls.length).toBeGreaterThanOrEqual(2)
    for (const call of counts.mock.calls) expect(call[3]).toBe(plan)
    stack.unmount()
    counts.mockClear()
    render(
      <LoomStripView
        {...base}
        dispatchPlan={plan}
        outage={false}
        onExpand={() => {}}
      />,
    )
    expect(screen.getByLabelText('Next: 1')).toBeTruthy()
    expect(counts).toHaveBeenCalled()
    for (const call of counts.mock.calls) expect(call[3]).toBe(plan)
    expect(
      sheetsModule.loomSheetCounts(sheets, now, [horse], null).nextReady,
    ).toBe(1)
    expect(
      sheetsModule.loomSheetCounts(sheets, now, [horse], plan).nextReady,
    ).toBe(0)
  })
})

it.each([
  ['dirty', '/Users/marc/lane', 'lane has uncommitted changes · ~/lane'],
  ['unpushed', '/home/marc/lane', 'lane has unpushed commits · ~/lane'],
  ['unknown', null, 'lane not checked'],
  [
    'unset',
    null,
    "this seat's worktree path is not set — set it in the seat's settings",
  ],
] as const)(
  'Item A renders lane %s with its judged path',
  (state, path, sentence) => {
    const dispatchPlan = planAutoDispatch({
      plannedAt: plan.plannedAt,
      entries: [entry],
      firstSeen: new Map(),
      seats: [
        {
          batonName: 'fable',
          sessionId: 'm',
          role: 'mastermind',
          wipLimit: 1,
          availability: 'idle',
          lane: 'clean',
          lanePath: null,
          wire: null,
        },
        {
          batonName: entry.seat,
          sessionId: 's',
          role: 'horse',
          wipLimit: 1,
          availability: 'idle',
          lane: state,
          lanePath: path,
          wire: { id: 'wire', opener: null },
        },
      ],
    })
    render(<LoomSheetView {...base} sheet="next" dispatchPlan={dispatchPlan} />)
    expect(screen.getByText(sentence)).toBeTruthy()
  },
)
