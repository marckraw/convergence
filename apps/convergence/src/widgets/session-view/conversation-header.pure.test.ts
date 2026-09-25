import { describe, expect, it } from 'vitest'
// Every expected value here is a literal (MAR-3427 A): a test that read the
// constant it checks would stay green when the constant changed.
import {
  headerLayout,
  headerLayoutKey,
  headerYieldPriority,
  identityStyles,
  identityWidths,
  interactionKeepsFocusWhereItIs,
  parseHeaderLayoutKey,
  parallelWorkInRow,
  type IdentityNameStyle,
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
 * The code header in DOM order with realistic measured widths (MAR-3429 CH4):
 * the live status on the left, then the groups View, Details, Project, then
 * Stop and More. DOM order is NOT the yield order, which is what makes the
 * order test mean something.
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
    // Parallel work is in the row only while it runs (CH4 R2), and then it is
    // live status.
    ...(options.parallelRunning ? [status('parallel-work', 118)] : []),
    status('attention', 72),
    ...(options.remote ? [status('remote', 68)] : []),
    // The status items at their real maximums (MAR-3427 C): the activity chip
    // is `max-w-[12rem]`, the harness chip `max-w-[15rem]`.
    status('activity', 192),
    ...(options.worktreeRemoved ? [status('worktree-removed', 116)] : []),
    // The harness is in the row only while it alerts (CH4 R3).
    ...(options.harnessAlert ? [status('harness', 240)] : []),
    control('view', 64),
    control('details', 76),
    control('project', 88),
    ...(options.running ? [stop] : []),
    more,
  ]
}

/**
 * The yield order, first to go first, for a header with every group: Project,
 * then View, then Details (CH4 R8).
 */
const FULL_ORDER = ['project', 'view', 'details']

/** Each scenario with the order its controls must yield in, as a literal. */
const expectedOrder: Record<string, string[]> = {
  idle: FULL_ORDER,
  running: FULL_ORDER,
  'remote running': FULL_ORDER,
  'harness alert': FULL_ORDER,
  'worktree removed': FULL_ORDER,
  chat: ['view'],
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
      control('view', 64),
      status('attention', 72),
      status('activity', 192),
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
    6 * (drawn.length - 1)
  )
}

const widths = Array.from({ length: 2400 - 320 + 1 }, (_, i) => 320 + i)

describe('identityWidths (R1)', () => {
  it('reserves the conversation name and lets the project truncate first', () => {
    const widths = identityWidths({ projectNatural: 300, nameNatural: 400 })
    expect(widths.nameMin).toBe(120)
    expect(widths.projectMin).toBe(40)
    // 40 of project, 20 of separator and gaps, 120 of name.
    expect(widths.minWidth).toBe(180)
  })

  it('never reserves more than a short name needs', () => {
    const widths = identityWidths({ projectNatural: 20, nameNatural: 30 })
    expect(widths).toMatchObject({
      projectMin: 20,
      nameMin: 30,
      width: 70,
    })
  })

  it('MAR-3427 I counts no project part for a conversation without a project', () => {
    expect(identityWidths({ projectNatural: null, nameNatural: 400 })).toEqual({
      width: 280,
      minWidth: 120,
      projectMin: 0,
      nameMin: 120,
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

  it('R2 yields controls in the one fixed order as the header narrows, never in DOM order — mutation yield in DOM order turns red', () => {
    for (const [name, items] of scenarios) {
      const expected = expectedOrder[name]
      // What yields at each narrowing step, in steps. Controls that yield at
      // the same width must be the next ones in the expected order, as a set:
      // the layout alone cannot say which of them went first.
      const steps: string[][] = []
      let previous = new Set<string>()
      for (const width of [...widths].reverse()) {
        const overflow = new Set(headerLayout({ width, items }).overflow)
        // Nested: narrowing the header never brings a control back.
        for (const id of previous)
          expect(overflow.has(id), `${name} @${width}: ${id}`).toBe(true)
        const fresh = [...overflow].filter((id) => !previous.has(id))
        if (fresh.length > 0) steps.push(fresh)
        previous = overflow
      }
      let at = 0
      for (const step of steps) {
        expect(
          [...step].sort(),
          `${name}: step ${steps.indexOf(step)}`,
        ).toEqual(expected.slice(at, at + step.length).sort())
        at += step.length
      }
      expect(at, name).toBe(expected.length)
      // The order is observed, not assumed: each group leaves on its own.
      expect(steps.length, name).toBe(expected.length)
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
          ).toBeLessThanOrEqual(width - 32)
      }
    }
  })

  it('R3 the row is measured exactly: 32 px of padding and one 6 px gap between items', () => {
    // identity 70 + gap + control 450 + gap + More 28 = 560, plus 32 padding.
    const items = [identity(20, 30), control('project', 450), more]
    expect(headerLayout({ width: 592, items }).overflow).toEqual([])
    expect(headerLayout({ width: 591, items }).overflow).toEqual(['project'])
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
    for (const width of [320, 400, 559]) {
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

  it('R5 the bound is 560 px: one row at 560, two at 559, for a status group that fits either way', () => {
    const items = codeHeader({ running: true })
    expect(headerLayout({ width: 560, items }).rows).toHaveLength(1)
    // At 559 the pinned row would still fit (524 of 527 px): only the bound
    // puts the status on its own row.
    expect(headerLayout({ width: 559, items }).rows).toEqual([
      ['identity', 'stop', 'more'],
      ['attention', 'activity'],
    ])
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
    const narrow = headerLayout({ width: 600, items: chat })
    expect(narrow.overflow.length).toBeGreaterThan(0)
    expect(narrow.visible).toContain('more')
  })

  it('never lists a control that draws nothing in More', () => {
    const items = [identity(), control('view', 0), control('project', 70), more]
    const layout = headerLayout({ width: 330, items })
    expect(layout.overflow).toEqual(['project'])
  })
})

/**
 * The browser's flex shrink, for one identity row laid out at `available` px:
 * each name starts at its natural width capped by its `max-width` (a
 * `calc(100% - Npx)` resolves against the identity), and the overflow is taken
 * from the names that shrink, in proportion to shrink factor x width, none
 * below its `min-width`. This reads the styles `identityStyles` hands the
 * spans -- the same ones the header applies -- so it proves what they do.
 */
function flexIdentity(
  available: number,
  names: { natural: number; style: IdentityNameStyle }[],
  fixed: number,
): number[] {
  const cap = (style: IdentityNameStyle) => {
    const match = style.maxWidth?.match(/^calc\(100% - (\d+(?:\.\d+)?)px\)$/)
    if (style.maxWidth !== undefined && !match)
      throw new Error(`unreadable max-width ${style.maxWidth}`)
    return match ? available - Number(match[1]) : Infinity
  }
  const widths = names.map(({ natural, style }) =>
    Math.max(style.minWidth, Math.min(natural, cap(style))),
  )
  const frozen = names.map(({ style }, index) =>
    style.flexShrink === 0 ? true : widths[index] <= style.minWidth,
  )
  let overflow =
    fixed + widths.reduce((sum, width) => sum + width, 0) - available
  while (overflow > 1e-9) {
    const weight = names.reduce(
      (sum, { style }, index) =>
        frozen[index] ? sum : sum + style.flexShrink * widths[index],
      0,
    )
    if (weight === 0) break
    let taken = 0
    names.forEach(({ style }, index) => {
      if (frozen[index]) return
      const share = (overflow * style.flexShrink * widths[index]) / weight
      const next = Math.max(style.minWidth, widths[index] - share)
      taken += widths[index] - next
      if (next === style.minWidth) frozen[index] = true
      widths[index] = next
    })
    overflow -= taken
    if (taken === 0) break
  }
  return widths
}

describe('MAR-3427 B the identity shares a squeeze', () => {
  // The reader's Chromium probe: a 215 px project and a 219.81 px name.
  const projectNatural = 215
  const nameNatural = 219.81
  const widths = identityWidths({ projectNatural, nameNatural })
  const styles = identityStyles(widths, { projectNatural })
  const layout = (available: number) => {
    const [project, name] = flexIdentity(
      available,
      [
        { natural: projectNatural, style: styles.project! },
        { natural: nameNatural, style: styles.name },
      ],
      20,
    )
    return { project, name }
  }

  it('the conversation name keeps every pixel until the project is at its 40 px floor — mutation restore the shrink-[999] / shrink split turns red', () => {
    // 380 px: the reader's case. The project gives the whole squeeze.
    const reader = layout(380)
    expect(reader.name).toBe(219.81)
    expect(reader.project).toBeCloseTo(140.19, 6)

    // Just above the floor: still all from the project.
    const edge = layout(40 + 20 + 219.81 + 0.5)
    expect(edge.name).toBe(219.81)
    expect(edge.project).toBeCloseTo(40.5, 6)

    // Past it: the project holds its 40 px, the name takes the rest.
    const past = layout(260)
    expect(past.project).toBe(40)
    expect(past.name).toBe(200)
  })

  it('applies the styles that say so: the name does not flex-shrink and is capped at what the project floor leaves', () => {
    expect(styles).toEqual({
      project: { minWidth: 40, flexShrink: 1 },
      name: { minWidth: 120, flexShrink: 0, maxWidth: 'calc(100% - 60px)' },
    })
    const chat = identityStyles(
      identityWidths({ projectNatural: 80, nameNatural: 150, leading: 22 }),
      { projectNatural: 80, leading: 22 },
    )
    expect(chat.name.maxWidth).toBe('calc(100% - 82px)')
  })

  it('a conversation without a project is the one name, and shrinks to its reserve', () => {
    const alone = identityStyles(
      identityWidths({ projectNatural: null, nameNatural: 300 }),
      { projectNatural: null },
    )
    expect(alone).toEqual({
      project: null,
      name: { minWidth: 120, flexShrink: 1 },
    })
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

describe('MAR-3429 CH4', () => {
  it('R5 the pin mark takes its room beside the name: counted in the identity, and the name is capped short of it — mutation leave trailing out turns red', () => {
    const plain = identityWidths({ projectNatural: 90, nameNatural: 100 })
    const pinned = identityWidths({
      projectNatural: 90,
      nameNatural: 100,
      trailing: 18,
    })
    expect(pinned.width - plain.width).toBe(18)
    expect(pinned.minWidth - plain.minWidth).toBe(18)
    expect(
      identityStyles(pinned, { projectNatural: 90, trailing: 18 }).name
        .maxWidth,
    ).toBe('calc(100% - 78px)')
  })

  it('R2 Parallel work reads its running count, or its unknown count, and nothing when neither', () => {
    const counts = (running: number, unknown: number) => ({
      running,
      unknown,
      failed: 4,
      stopped: 9,
    })
    expect(parallelWorkInRow(counts(2, 1))).toBe('Parallel work · 2')
    expect(parallelWorkInRow(counts(0, 3))).toBe('Parallel work · 3 unknown')
    expect(parallelWorkInRow(counts(0, 0))).toBeNull()
    expect(parallelWorkInRow(undefined)).toBeNull()
  })
})

describe('interactionKeepsFocusWhereItIs (MAR-3429 CH4 lap 2 C)', () => {
  const outside = (init: Partial<MouseEvent>) => ({
    detail: { originalEvent: init as Event },
  })

  it('keeps focus where it is for a right-click or ctrl-click outside, and only then — mutation return false turns red', () => {
    expect(interactionKeepsFocusWhereItIs(outside({ button: 2 }))).toBe(true)
    expect(
      interactionKeepsFocusWhereItIs(outside({ button: 0, ctrlKey: true })),
    ).toBe(true)
    expect(interactionKeepsFocusWhereItIs(outside({ button: 0 }))).toBe(false)
    expect(
      interactionKeepsFocusWhereItIs(outside({ button: 1, ctrlKey: true })),
    ).toBe(false)
    // A focus moving outside is no pointer at all.
    expect(interactionKeepsFocusWhereItIs(outside({}))).toBe(false)
  })
})
