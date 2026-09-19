import { describe, expect, it } from 'vitest'
import {
  loomGroundingWords,
  loomPlan,
  loomPlanLeft,
  loomPlanLeftLine,
  loomUtcDay,
  LOOM_GROUNDING_FRESH_DAYS,
} from './loom-plan.pure'
import { loomSheetCounts, loomSheets, loomSheetTitle } from './loom-sheets.pure'
import { ledgerEntry } from './wave-rows.fixture'
import {
  waveLapLabel,
  waveRowAction,
  waveRowHostMarker,
  type WaveRow,
} from './wave-sections.pure'
import type { WorkLedgerEntry, WorkLedgerState } from '@/entities/work-ledger'

/** The day and instant this file calls "today"; written down, not inherited. */
const TODAY = '2026-09-19'
const NOW = Date.parse(`${TODAY}T12:00:00.000Z`)

interface Facts {
  groomed?: boolean
  grounded?: boolean
  groomMe?: boolean
}

const planEntry = (
  identifier: string,
  state: WorkLedgerState,
  facts: Facts = {},
  groundedAt: string | null = null,
): WorkLedgerEntry =>
  ledgerEntry({
    issueIdentifier: identifier,
    state,
    seat: null,
    sessionId: null,
    groundedAt,
    fact: {
      logicalStatus: null,
      branchName: null,
      updatedAt: null,
      ...facts,
    },
  })

const row = (entry: WorkLedgerEntry): WaveRow => ({
  entry,
  action: waveRowAction(entry),
  hostMarker: waveRowHostMarker(entry, NOW),
  crewName: null,
  lapLabel: waveLapLabel(entry.lap, null),
})

const planRow = (
  identifier: string,
  state: WorkLedgerState,
  facts: Facts = {},
  groundedAt: string | null = null,
): WaveRow => row(planEntry(identifier, state, facts, groundedAt))

const stageKeys = (rows: WaveRow[]) =>
  loomPlan(rows, TODAY).stages.map((stage) => stage.key)

describe('MAR-3194 R1: the stage comes from the state, then the labels', () => {
  it('every combination of state and labels has exactly one destination', () => {
    const states: WorkLedgerState[] = ['assigned', 'stopped', 'unassigned']
    const flags = [false, true]
    const rows: WaveRow[] = []
    const expected: { id: string; stage: string }[] = []

    for (const state of states) {
      for (const groomed of flags) {
        for (const grounded of flags) {
          for (const groomMe of flags) {
            const id = `EX-${state}-${+groomed}${+grounded}${+groomMe}`
            rows.push(planRow(id, state, { groomed, grounded, groomMe }))
            const stage =
              state === 'unassigned'
                ? 'left'
                : state === 'stopped'
                  ? 'regroom'
                  : !groomed
                    ? 'define'
                    : !grounded
                      ? 'ground'
                      : 'assign'
            expected.push({ id, stage })
          }
        }
      }
    }

    const plan = loomPlan(rows, TODAY)
    const placed = new Map<string, string[]>()
    for (const stage of plan.stages) {
      for (const stageRow of stage.rows) {
        const seen = placed.get(stageRow.entry.issueIdentifier) ?? []
        seen.push(stage.key)
        placed.set(stageRow.entry.issueIdentifier, seen)
      }
    }

    for (const { id, stage } of expected) {
      // Mutation: ask `grounded` before `groomed` -> every
      // grounded-but-ungroomed row lands in Assign instead of Define, red.
      // Mutation: count `unassigned` as Define -> red on the left rows.
      expect(placed.get(id) ?? ['left']).toEqual([stage])
    }

    // The partition holds: nothing is in two stages, nothing vanishes.
    expect(plan.preparing + plan.left).toBe(rows.length)
    expect(placed.size).toBe(plan.preparing)
    expect(plan.left).toBe(8)
  })

  it('a grounded issue nobody groomed still needs defining', () => {
    expect(
      stageKeys([planRow('EX-1', 'assigned', { grounded: true })]),
    ).toEqual(['define'])
  })

  it('a row written before LV1 has no label facts and needs defining', () => {
    // `readFact` leaves the keys absent on old rows; absent is not groomed.
    expect(stageKeys([planRow('EX-OLD', 'assigned')])).toEqual(['define'])
  })

  it('the stages keep their order however the rows arrive', () => {
    const rows = [
      planRow('EX-STOP', 'stopped'),
      planRow('EX-ASSIGN', 'assigned', { groomed: true, grounded: true }),
      planRow('EX-DEFINE', 'assigned'),
      planRow('EX-GROUND', 'assigned', { groomed: true }),
    ]
    // Mutation: order the stages by size, or by first appearance -> red.
    expect(stageKeys(rows)).toEqual(['define', 'ground', 'assign', 'regroom'])
  })
})

describe('MAR-3194 R2: each row says what it lacks', () => {
  const actionOf = (rows: WaveRow[]) =>
    loomPlan(rows, TODAY).stages.flatMap((stage) =>
      stage.rows.map((stageRow) => stage.key + ':' + String(stageRow.action)),
    )

  it('says the missing step, and says groom-me back when it was asked', () => {
    // Mutation: leave `action` at `waveRowAction`'s null -> every case red.
    expect(
      actionOf([
        planRow('EX-1', 'assigned', { groomMe: true }),
        planRow('EX-2', 'assigned'),
        planRow('EX-3', 'assigned', { groomed: true }),
        planRow('EX-4', 'assigned', { groomed: true, grounded: true }, TODAY),
      ]),
    ).toEqual([
      'define:groom-me',
      'define:not groomed',
      'ground:not grounded',
      'assign:no horse assigned · grounded today',
    ])
  })

  it('a stopped lap keeps the verb the STOP gave it', () => {
    const stopped = planRow('EX-STOP', 'stopped')
    expect(stopped.action).toBe('re-groom (Fable)')
    expect(actionOf([stopped])).toEqual(['regroom:re-groom (Fable)'])
  })

  it('the shared row is copied, never rewritten', () => {
    const original = planRow('EX-1', 'assigned')
    const before = original.action
    loomPlan([original], TODAY)
    expect(original.action).toBe(before)
  })
})

describe('MAR-3194 R4: grounding age names both clocks', () => {
  it('reads the age in days, and expires it after a week', () => {
    const cases: [string | null, string][] = [
      [TODAY, 'grounded today'],
      ['2026-09-18', 'grounded 1 day ago'],
      ['2026-09-14', 'grounded 5 days ago'],
      ['2026-09-12', 'grounded 7 days ago'],
      ['2026-09-11', 'grounding expired · 8 days'],
      [null, 'grounding date not recorded'],
      // A person east of UTC, writing after their local midnight.
      ['2026-09-20', 'grounded today'],
    ]
    for (const [groundedAt, words] of cases) {
      // Mutation: drop the max(0, ...) -> the tomorrow case reads
      // `grounded -1 days ago`, red. Mutation: `>=` for the expiry -> day
      // seven reads expired, red.
      expect(loomGroundingWords(groundedAt, TODAY)).toBe(words)
    }
    expect(LOOM_GROUNDING_FRESH_DAYS).toBe(7)
  })

  it('a date the app cannot read is not given an age', () => {
    expect(loomGroundingWords('yesterday', TODAY)).toBe(
      'grounding date not recorded',
    )
    expect(loomGroundingWords('2026-09-19T12:00:00.000Z', TODAY)).toBe(
      'grounding date not recorded',
    )
  })

  it('the day is the app’s own UTC day, not a local one', () => {
    // 01:30 UTC on the 19th is still the 18th in New York; the sheet's day
    // is the app's, and it is read from the clock the panel already ticks.
    expect(loomUtcDay(Date.parse('2026-09-19T01:30:00.000Z'))).toBe(
      '2026-09-19',
    )
    expect(loomUtcDay(NOW)).toBe(TODAY)
  })
})

describe('MAR-3194 R5: the title counts preparation; what left is words', () => {
  it('three in preparation and four gone: the title says three', () => {
    const rows = [
      planEntry('EX-1', 'assigned'),
      planEntry('EX-2', 'assigned', { groomed: true }),
      planEntry('EX-3', 'assigned', { groomed: true, grounded: true }),
      planEntry('EX-G1', 'unassigned'),
      planEntry('EX-G2', 'unassigned'),
      planEntry('EX-G3', 'unassigned'),
      planEntry('EX-G4', 'unassigned'),
    ]
    const sheets = loomSheets(rows, NOW)
    // The partition is untouched: Plan still holds all seven rows.
    expect(sheets.plan).toHaveLength(7)

    const plan = loomPlan(sheets.plan, TODAY)
    expect([plan.preparing, plan.left]).toEqual([3, 4])
    // Mutation: title from `sheets.plan.length` -> `Plan · 7 in
    // preparation` over a sheet drawing three, red.
    expect(loomSheetTitle('plan', loomSheetCounts(sheets, NOW, []))).toBe(
      'Plan · 3 in preparation',
    )
    expect(loomPlanLeftLine(plan.left)).toBe('4 issues left the loop')
  })

  it('one is said in the singular; none is said not at all', () => {
    expect(loomPlanLeftLine(1)).toBe('1 issue left the loop')
    expect(loomPlanLeftLine(0)).toBeNull()
    expect(loomPlanLeftLine(-1)).toBeNull()
  })
})

describe('MAR-3234 R5: the rows that left can be listed while Loom is searched', () => {
  it('the rows `left` counts, and only those', () => {
    const rows = [
      planRow('EX-1', 'assigned'),
      planRow('EX-2', 'unassigned'),
      planRow('EX-3', 'stopped'),
      planRow('EX-4', 'unassigned'),
    ]
    const listed = loomPlanLeft(rows)
    // Mutation: list the stopped row too -> EX-3 joins, red.
    expect(listed.map((one) => one.entry.issueIdentifier)).toEqual([
      'EX-2',
      'EX-4',
    ])
    expect(listed).toHaveLength(loomPlan(rows, TODAY).left)
  })
})
