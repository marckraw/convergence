import { expect, it } from 'vitest'
import {
  isWaveColumnHidden,
  parseWavePanelMode,
  serializeWavePanelMode,
} from './wave-panel-mode.pure'

it('MAR-3097 R4: open and rail round-trip; anything unknown reads as open', () => {
  for (const mode of ['open', 'rail'] as const) {
    expect(parseWavePanelMode(serializeWavePanelMode(mode))).toBe(mode)
  }
  // Mutation: fall back to `rail` -> red.
  expect(parseWavePanelMode('sideways')).toBe('open')
  expect(parseWavePanelMode(null)).toBe('open')
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
