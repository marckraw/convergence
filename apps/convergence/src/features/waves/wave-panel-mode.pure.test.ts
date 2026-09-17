import { expect, it } from 'vitest'
import {
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
