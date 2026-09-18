import { expect, it } from 'vitest'
import {
  isWaveColumnHidden,
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

it('MAR-3097 lap 2, B: the column steps aside only while Mission Control shows Waves', () => {
  // Mutation: never hide -> red.
  expect(
    isWaveColumnHidden({
      missionControlActive: true,
      missionControlMode: 'waves',
    }),
  ).toBe(true)
  expect(
    isWaveColumnHidden({
      missionControlActive: true,
      missionControlMode: 'canvas',
    }),
  ).toBe(false)
  // A stale mode from an earlier visit does not hide it outside Mission Control.
  expect(
    isWaveColumnHidden({
      missionControlActive: false,
      missionControlMode: 'waves',
    }),
  ).toBe(false)
})
