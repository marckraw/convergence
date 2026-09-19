import { describe, expect, it } from 'vitest'
import {
  loomBefore,
  loomBeforeOlder,
  loomBeforeOlderLine,
  LOOM_BEFORE_WINDOW_DAYS,
  LOOM_NO_WAVE_KEY,
  LOOM_NO_WAVE_TITLE,
  loomWaveKey,
} from './loom-before.pure'
import { loomSheetCounts, loomSheets, loomSheetTitle } from './loom-sheets.pure'
import { ledgerEntry } from './wave-rows.fixture'
import {
  waveLapLabel,
  waveRowAction,
  waveRowHostMarker,
  type WaveRow,
} from './wave-sections.pure'

/** The instant this file calls "now"; written down, never inherited. */
const NOW = Date.parse('2026-09-19T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

const doneRow = (
  identifier: string,
  wave: string | null,
  seenAt: string,
): WaveRow => {
  const entry = ledgerEntry({
    issueIdentifier: identifier,
    state: 'done',
    wave,
    seenAt,
  })
  return {
    entry,
    action: waveRowAction(entry),
    hostMarker: waveRowHostMarker(entry, NOW),
    crewName: null,
    lapLabel: waveLapLabel(entry.lap, null),
  }
}

const daysAgo = (days: number, ms = 0) =>
  new Date(NOW - days * DAY - ms).toISOString()

describe('MAR-3192 R1: the group is the row’s wave, nothing else', () => {
  it('two waves and an unwaved row make three groups', () => {
    const { groups } = loomBefore(
      [
        doneRow('EX-1', 'loom-view', daysAgo(1)),
        doneRow('EX-2', 'loom-view', daysAgo(2)),
        doneRow('EX-3', 'cursor-parity', daysAgo(3)),
        doneRow('EX-4', null, daysAgo(4)),
      ],
      NOW,
    )
    // Mutation: group by `seat` -> the fixture gives every row the same
    // seat, so one group, red.
    expect(groups.map((group) => [group.title, group.rows.length])).toEqual([
      ['loom-view', 2],
      ['cursor-parity', 1],
      [LOOM_NO_WAVE_TITLE, 1],
    ])
  })

  it('a wave literally named “No wave” is not the unwaved group', () => {
    const { groups } = loomBefore(
      [
        doneRow('EX-1', LOOM_NO_WAVE_TITLE, daysAgo(1)),
        doneRow('EX-2', null, daysAgo(2)),
      ],
      NOW,
    )
    // Mutation: key the unwaved group by its TITLE -> the two merge into one
    // heading and a reader cannot tell a real wave from the absence of one.
    expect(groups).toHaveLength(2)
    expect(groups.map((group) => group.key)).toEqual([
      loomWaveKey(LOOM_NO_WAVE_TITLE),
      LOOM_NO_WAVE_KEY,
    ])
    expect(groups.map((group) => group.wave)).toEqual([
      LOOM_NO_WAVE_TITLE,
      null,
    ])
  })
})

describe('MAR-3192 R2: the window is judged on the app’s own clock', () => {
  it('exactly fourteen days is shown; a millisecond more is not', () => {
    const edge = loomBefore(
      [
        doneRow('EX-IN', 'w', daysAgo(LOOM_BEFORE_WINDOW_DAYS)),
        doneRow('EX-OUT', 'w', daysAgo(LOOM_BEFORE_WINDOW_DAYS, 1)),
      ],
      NOW,
    )
    // Mutation: build a cut-off with `toLocaleDateString` and compare ISO
    // strings -> the boundary moves by the machine's zone, red here.
    // Mutation: no window at all -> `older` is 0 and EX-OUT is shown, red.
    expect(
      edge.groups[0]?.rows.map((row) => row.entry.issueIdentifier),
    ).toEqual(['EX-IN'])
    expect(edge.shown).toBe(1)
    expect(edge.older).toBe(1)
  })

  it('a row the app cannot date is shown, and does not claim to be newest', () => {
    const { groups, shown } = loomBefore(
      [
        doneRow('EX-OLDEST', 'w', 'garbage'),
        doneRow('EX-NEW', 'w', daysAgo(1)),
      ],
      NOW,
    )
    // Hiding what it cannot date would be the sheet claiming an age it does
    // not have. Mutation: drop the undatable row -> shown is 1, red.
    expect(shown).toBe(2)
    // ...but it sorts last rather than dragging its wave to the top.
    // Mutation: treat an unparseable date as `now` -> EX-OLDEST first, red.
    expect(groups[0]?.rows.map((row) => row.entry.issueIdentifier)).toEqual([
      'EX-NEW',
      'EX-OLDEST',
    ])
  })
})

describe('MAR-3192 R3: newest first, by the newest row', () => {
  it('a one-row wave that just finished outranks a bigger, older one', () => {
    const { groups } = loomBefore(
      [
        doneRow('EX-1', 'old-big', daysAgo(5)),
        doneRow('EX-2', 'old-big', daysAgo(6)),
        doneRow('EX-3', 'old-big', daysAgo(7)),
        doneRow('EX-4', 'fresh', daysAgo(1)),
      ],
      NOW,
    )
    // Mutation: order groups by size -> `old-big` first, and the thing that
    // just finished is buried under three older ones, red.
    expect(groups.map((group) => group.title)).toEqual(['fresh', 'old-big'])
    expect(groups[1]?.rows.map((row) => row.entry.issueIdentifier)).toEqual([
      'EX-1',
      'EX-2',
      'EX-3',
    ])
  })

  it('a tie breaks on the name, and the unwaved group goes last', () => {
    const at = daysAgo(1)
    const { groups } = loomBefore(
      [
        doneRow('EX-1', 'zulu', at),
        doneRow('EX-2', null, at),
        doneRow('EX-3', 'alpha', at),
      ],
      NOW,
    )
    expect(groups.map((group) => group.title)).toEqual([
      'alpha',
      'zulu',
      LOOM_NO_WAVE_TITLE,
    ])
  })
})

describe('MAR-3192 R4: the title counts what the sheet shows', () => {
  it('three shown and five older: the title says three', () => {
    const rows = [
      ...[1, 2, 3].map((n) =>
        ledgerEntry({
          issueIdentifier: `EX-NEW-${n}`,
          state: 'done',
          wave: 'w',
          seenAt: daysAgo(n),
        }),
      ),
      ...[1, 2, 3, 4, 5].map((n) =>
        ledgerEntry({
          issueIdentifier: `EX-OLD-${n}`,
          state: 'done',
          wave: 'w',
          seenAt: daysAgo(20 + n),
        }),
      ),
    ]
    const sheets = loomSheets(rows, NOW)
    // The partition is untouched: `before` still holds every finished row.
    expect(sheets.before).toHaveLength(8)

    // Mutation: count `sheets.before.length` -> the title says 8 over a
    // sheet holding 3, and no amount of scrolling reaches the other five.
    expect(loomSheetTitle('before', loomSheetCounts(sheets, NOW, []))).toBe(
      'Before · 3 done',
    )
    expect(loomBefore(sheets.before, NOW).older).toBe(5)
    expect(loomBeforeOlderLine(5)).toBe('5 older issues not shown')
  })

  it('one older issue is said in the singular; none is said not at all', () => {
    expect(loomBeforeOlderLine(1)).toBe('1 older issue not shown')
    expect(loomBeforeOlderLine(0)).toBeNull()
  })
})

describe('MAR-3234 R5: the older rows can be listed while Loom is searched', () => {
  it('the rows past the window, newest first -- exactly the rows `older` counts', () => {
    const rows = [
      doneRow('EX-1', 'loom-p2', new Date(NOW - 1 * DAY).toISOString()),
      doneRow('EX-2', 'loom-p2', new Date(NOW - 40 * DAY).toISOString()),
      doneRow('EX-3', null, new Date(NOW - 20 * DAY).toISOString()),
    ]
    const listed = loomBeforeOlder(rows, NOW)
    // Mutation: list the rows INSIDE the window -> EX-1, red.
    expect(listed.map((row) => row.entry.issueIdentifier)).toEqual([
      'EX-3',
      'EX-2',
    ])
    expect(listed).toHaveLength(loomBefore(rows, NOW).older)
  })
})
