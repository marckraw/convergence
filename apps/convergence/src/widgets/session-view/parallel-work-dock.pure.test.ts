import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MIN_CONVERSATION_WIDTH,
  PARALLEL_WORK_PANEL_WIDTH,
  SIDE_PANEL_WIDTH,
  parallelDockMode,
} from './parallel-work-dock.pure'

const AT_BOUND = PARALLEL_WORK_PANEL_WIDTH + MIN_CONVERSATION_WIDTH

describe('parallelDockMode (MAR-3426 R1) — mutation ignore otherDockedWidths turns red', () => {
  it.each([
    ['wide with nothing else docked', 1700, [0, 0], 'dock'],
    ['wide but the PR and Space panels are open', 1400, [320, 320], 'overlay'],
    ['wide with the PR panel open, room still left', 1700, [320, 0], 'dock'],
    ['narrow', 900, [0, 0], 'overlay'],
    ['exactly at the bound', AT_BOUND, [0, 0], 'dock'],
    ['one pixel under the bound', AT_BOUND - 1, [0, 0], 'overlay'],
    ['exactly at the bound with a panel open', AT_BOUND + 320, [320], 'dock'],
  ] as const)('%s', (_, rowWidth, otherDockedWidths, expected) => {
    expect(
      parallelDockMode({
        rowWidth,
        panelWidth: PARALLEL_WORK_PANEL_WIDTH,
        otherDockedWidths,
        minConversationWidth: MIN_CONVERSATION_WIDTH,
      }),
    ).toBe(expected)
  })
})

// The row pays for the PR and Space panels by this constant, so it must stay
// the width they render at. A class change there without one here turns red.
it.each([
  'pull-request-panel.presentational.tsx',
  'space-context-panel.presentational.tsx',
])('SIDE_PANEL_WIDTH is the w-80 the %s aside renders at', (file) => {
  const source = readFileSync(resolve(__dirname, file), 'utf8')
  const aside = /<aside[\s\S]*?className="([^"]*)"/.exec(source)?.[1] ?? ''
  expect({
    w80: aside.split(/\s+/).includes('w-80'),
    px: SIDE_PANEL_WIDTH,
  }).toEqual({
    w80: true,
    px: 80 * 4,
  })
})
