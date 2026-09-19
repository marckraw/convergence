import { expect, it } from 'vitest'
import {
  parseWavePanelMode,
  serializeWavePanelMode,
} from './wave-panel-mode.pure'

it('MAR-3189 R1: compact and expanded round-trip; anything else reads as compact', () => {
  for (const mode of ['compact', 'expanded'] as const) {
    expect(parseWavePanelMode(serializeWavePanelMode(mode))).toBe(mode)
  }
  // Mutation: fall back to `expanded` -> red.
  expect(parseWavePanelMode('sideways')).toBe('compact')
  expect(parseWavePanelMode(null)).toBe('compact')
  // The two modes this app stored before Loom. A build that read them as
  // anything but the column would open on a panel whose shape no longer
  // exists -- which is the whole reason the parse has a default at all.
  // Mutation: `raw === 'rail' ? 'expanded' : ...` -> red.
  expect(parseWavePanelMode('open')).toBe('compact')
  expect(parseWavePanelMode('rail')).toBe('compact')
})
