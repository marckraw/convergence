import { describe, expect, it } from 'vitest'
import {
  CONVERSATION_NAME_RESERVED,
  HEADER_GAP,
  HEADER_PADDING_X,
  HEADER_TWO_ROW_BELOW,
  HEADER_YIELD_ORDER,
  IDENTITY_INNER_GAP,
  PROJECT_NAME_MIN,
  headerLayout,
  headerLayoutKey,
  headerYieldPriority,
  identityWidths,
  parseHeaderLayoutKey,
  type HeaderItem,
  type HeaderYieldId,
} from './conversation-header.pure'

const identity = (projectNatural = 90, nameNatural = 260): HeaderItem => {
  const widths = identityWidths({ projectNatural, nameNatural })
  return {
    id: 'identity',
    width: widths.width,
    minWidth: widths.minWidth,
    priority: 0,
    pinned: true,
    group: 'identity',
  }
}
const control = (id: HeaderYieldId, width: number): HeaderItem => ({
  id,
  width,
  priority: headerYieldPriority(id),
  pinned: false,
  group: 'control',
})
const status = (id: string, width: number): HeaderItem => ({
  id,
  width,
  priority: 0,
  pinned: true,
  group: 'status',
})
const stop: HeaderItem = {
  id: 'stop',
  width: 28,
  priority: 0,
  pinned: true,
  group: 'stop',
}
const more: HeaderItem = {
  id: 'more',
  width: 28,
  priority: 0,
  pinned: true,
  group: 'more',
}

/**
 * The code header in DOM order with realistic measured widths: DOM order is
 * NOT the yield order, which is what makes the order test mean something.
 */
function codeHeader(
  options: {
    running?: boolean
    remote?: boolean
    worktreeRemoved?: boolean
    harnessAlert?: boolean
    parallelRunning?: boolean
  } = {},
): HeaderItem[] {
  return [
    identity(),
    options.parallelRunning
      ? status('parallel-work', 118)
      : control('parallel-work', 96),
    control('view', 110),
    status('attention', 72),
    ...(options.remote ? [status('remote', 68)] : []),
    status('activity', 140),
    ...(options.worktreeRemoved ? [status('worktree-removed', 116)] : []),
    options.harnessAlert ? status('harness', 220) : control('harness', 150),
    control('agent-meter', 120),
    control('wires', 64),
    control('session-details', 104),
    control('project-actions', 118),
    control('open', 70),
    control('pull-request', 28),
    control('terminal', 28),
    control('pin', 40),
    ...(options.running ? [stop] : []),
    more,
  ]
}

const scenarios: Array<[string, HeaderItem[]]> = [
  ['idle', codeHeader()],
  ['running', codeHeader({ running: true, parallelRunning: true })],
  ['remote running', codeHeader({ running: true, remote: true })],
  ['harness alert', codeHeader({ harnessAlert: true, running: true })],
  ['worktree removed', codeHeader({ worktreeRemoved: true })],
  [
    'chat',
    [
      identity(40, 180),
      control('parallel-work', 96),
      control('view', 110),
      status('attention', 72),
      status('activity', 140),
      { ...more, onlyWithOverflow: true },
    ],
  ],
]

const byId = (items: HeaderItem[]) =>
  new Map(items.map((item) => [item.id, item]))

/** A row's width with the identity at the least it may be given. */
function rowWidth(items: HeaderItem[], ids: string[]): number {
  const map = byId(items)
  const drawn = ids.map((id) => map.get(id)!).filter((item) => item.width > 0)
  if (drawn.length === 0) return 0
  return (
    drawn.reduce((sum, item) => sum + (item.minWidth ?? item.width), 0) +
    HEADER_GAP * (drawn.length - 1)
  )
}

const widths = Array.from({ length: 2400 - 320 + 1 }, (_, i) => 320 + i)

describe('identityWidths (R1)', () => {
  it('reserves the conversation name and lets the project truncate first', () => {
    const widths = identityWidths({ projectNatural: 300, nameNatural: 400 })
    expect(widths.nameMin).toBe(CONVERSATION_NAME_RESERVED)
    expect(widths.projectMin).toBe(PROJECT_NAME_MIN)
    expect(widths.minWidth).toBe(
      PROJECT_NAME_MIN + IDENTITY_INNER_GAP + CONVERSATION_NAME_RESERVED,
    )
  })

  it('never reserves more than a short name needs', () => {
    const widths = identityWidths({ projectNatural: 20, nameNatural: 30 })
    expect(widths).toMatchObject({
      projectMin: 20,
      nameMin: 30,
      width: 50 + IDENTITY_INNER_GAP,
    })
  })
})

describe('headerLayout', () => {
  it('draws everything on one row when the header has not been measured', () => {
    for (const width of [null, 0]) {
      const layout = headerLayout({ width, items: codeHeader() })
      expect(layout.overflow).toEqual([])
      expect(layout.rows).toHaveLength(1)
      expect(layout.visible).toEqual(codeHeader().map((item) => item.id))
    }
  })

  it('R2 yields controls in HEADER_YIELD_ORDER as the header narrows, never in DOM order — mutation yield in DOM order turns red', () => {
    for (const [name, items] of scenarios) {
      const present = new Set(
        items
          .filter((item) => !item.pinned && item.width > 0)
          .map((item) => item.id),
      )
      const expected = HEADER_YIELD_ORDER.filter((id) => present.has(id))
      const firstYielded: string[] = []
      let previous = new Set<string>()
      for (const width of [...widths].reverse()) {
        const overflow = new Set(headerLayout({ width, items }).overflow)
        // Nested: narrowing the header never brings a control back.
        for (const id of previous)
          expect(overflow.has(id), `${name} @${width}: ${id}`).toBe(true)
        for (const id of HEADER_YIELD_ORDER)
          if (overflow.has(id) && !previous.has(id)) firstYielded.push(id)
        previous = overflow
      }
      expect(firstYielded, name).toEqual(expected)
    }
  })

  it('R2 never yields a pinned item, at any width', () => {
    for (const [name, items] of scenarios) {
      const pinned = items.filter(
        (item) => item.pinned && !item.onlyWithOverflow,
      )
      for (const width of widths) {
        const layout = headerLayout({ width, items })
        for (const item of pinned) {
          expect(layout.overflow, `${name} @${width}`).not.toContain(item.id)
          expect(layout.visible, `${name} @${width}`).toContain(item.id)
        }
      }
    }
  })

  it('R3 no drawn row is wider than the header, from 320 to 2,400 px — mutation skip the width check for pinned items turns red', () => {
    for (const [name, items] of scenarios) {
      for (const width of widths) {
        const layout = headerLayout({ width, items })
        for (const row of layout.rows)
          expect(
            rowWidth(items, row),
            `${name} @${width}: ${row.join(',')}`,
          ).toBeLessThanOrEqual(width - HEADER_PADDING_X)
      }
    }
  })

  it('R4 every control is either drawn or in More, never dropped', () => {
    for (const [name, items] of scenarios) {
      const controls = items.filter((item) => !item.pinned && item.width > 0)
      for (const width of widths) {
        const layout = headerLayout({ width, items })
        for (const item of controls)
          expect(
            layout.visible.includes(item.id) ||
              layout.overflow.includes(item.id),
            `${name} @${width}: ${item.id}`,
          ).toBe(true)
      }
    }
  })

  it('R5 below the bound, row 1 is identity + Stop + More and row 2 is the status group — mutation wrap everything turns red', () => {
    const items = codeHeader({ running: true, remote: true })
    for (const width of [320, 400, HEADER_TWO_ROW_BELOW - 1]) {
      const layout = headerLayout({ width, items })
      expect(layout.rows[0], `@${width}`).toEqual(['identity', 'stop', 'more'])
      expect(layout.rows.slice(1).flat(), `@${width}`).toEqual([
        'attention',
        'remote',
        'activity',
      ])
      expect(layout.rows.length).toBeGreaterThan(1)
      expect(layout.overflow).toEqual(
        items.filter((item) => item.group === 'control').map((item) => item.id),
      )
    }
  })

  it('R5 at and above the bound, with room for the status group, it is one row', () => {
    const layout = headerLayout({
      width: HEADER_TWO_ROW_BELOW,
      items: codeHeader({ running: true }),
    })
    expect(layout.rows).toHaveLength(1)
  })

  it('R5 a status group too wide for one row wraps onto more status rows, never into row 1', () => {
    const items = codeHeader({
      running: true,
      parallelRunning: true,
      harnessAlert: true,
    })
    const layout = headerLayout({ width: 320, items })
    expect(layout.rows[0]).toEqual(['identity', 'stop', 'more'])
    expect(layout.rows.slice(1).flat()).toEqual([
      'parallel-work',
      'attention',
      'activity',
      'harness',
    ])
  })

  it('keeps a More that only lists yielded controls away until something yields', () => {
    const chat = scenarios.find(([name]) => name === 'chat')![1]
    expect(headerLayout({ width: 2400, items: chat }).visible).not.toContain(
      'more',
    )
    const narrow = headerLayout({ width: 650, items: chat })
    expect(narrow.overflow.length).toBeGreaterThan(0)
    expect(narrow.visible).toContain('more')
  })

  it('never lists a control that draws nothing in More', () => {
    const items = [identity(), control('wires', 0), control('open', 70), more]
    const layout = headerLayout({ width: 330, items })
    expect(layout.overflow).toEqual(['open'])
  })
})

describe('headerLayoutKey', () => {
  it('round-trips a layout, and equal layouts share one key', () => {
    const layout = headerLayout({ width: 400, items: codeHeader() })
    const key = headerLayoutKey(layout)
    expect(parseHeaderLayoutKey(key)).toEqual(layout)
    expect(
      headerLayoutKey(headerLayout({ width: 401, items: codeHeader() })),
    ).toBe(key)
  })
})
