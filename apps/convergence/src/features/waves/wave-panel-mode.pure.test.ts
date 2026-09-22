import { expect, it } from 'vitest'
import {
  parseWavePanelMode,
  serializeWavePanelMode,
} from './wave-panel-mode.pure'

it('MAR-3189 R1, MAR-3292 R1: the three modes round-trip; anything else reads as compact', () => {
  // Mutation: drop the `folded` arm of the parse -> a folded person opens
  // the column again on every restart, red.
  for (const mode of ['compact', 'expanded', 'folded'] as const) {
    expect(parseWavePanelMode(serializeWavePanelMode(mode))).toBe(mode)
  }
  // Mutation: fall back to `expanded` -> red.
  expect(parseWavePanelMode('sideways')).toBe('compact')
  expect(parseWavePanelMode(null)).toBe('compact')
  // The two modes this app stored before Loom. A build that read them as
  // anything but the column would open on a panel shape that no longer
  // exists -- which is the whole reason the parse has a default at all.
  // Mutation: `raw === 'rail' ? 'folded' : ...` -> a person who collapsed the
  // old rail years ago upgrades straight into the folded column without ever
  // choosing it, red.
  expect(parseWavePanelMode('open')).toBe('compact')
  expect(parseWavePanelMode('rail')).toBe('compact')
})
