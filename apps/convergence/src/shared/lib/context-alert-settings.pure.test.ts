import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONTEXT_ALERT,
  formatTokenCap,
  parseContextAlertSettings,
} from './context-alert-settings.pure'

describe('parseContextAlertSettings', () => {
  it('defaults a missing group', () => {
    expect(parseContextAlertSettings(undefined)).toEqual(DEFAULT_CONTEXT_ALERT)
    expect(parseContextAlertSettings(null)).toEqual(DEFAULT_CONTEXT_ALERT)
    expect(parseContextAlertSettings('75%')).toEqual(DEFAULT_CONTEXT_ALERT)
  })

  it('keeps a null token cap', () => {
    expect(
      parseContextAlertSettings({ enabled: true, percent: 80, tokens: null }),
    ).toEqual({ enabled: true, percent: 80, tokens: null })
  })

  it('repairs an out-of-range percent', () => {
    expect(
      parseContextAlertSettings({ enabled: true, percent: 0, tokens: 400000 })
        .percent,
    ).toBe(75)
    expect(
      parseContextAlertSettings({ enabled: true, percent: 100, tokens: 400000 })
        .percent,
    ).toBe(75)
    expect(
      parseContextAlertSettings({
        enabled: true,
        percent: Number.NaN,
        tokens: 400000,
      }).percent,
    ).toBe(75)
  })

  it('rounds a fractional percent to an integer', () => {
    expect(
      parseContextAlertSettings({ enabled: true, percent: 74.6, tokens: null })
        .percent,
    ).toBe(75)
  })

  it('repairs a non-numeric token cap', () => {
    expect(
      parseContextAlertSettings({
        enabled: true,
        percent: 75,
        tokens: 'lots' as unknown as number,
      }).tokens,
    ).toBe(400000)
  })

  it('repairs a token cap below the floor', () => {
    expect(
      parseContextAlertSettings({ enabled: true, percent: 75, tokens: 999 })
        .tokens,
    ).toBe(400000)
    expect(
      parseContextAlertSettings({ enabled: true, percent: 75, tokens: 1000 })
        .tokens,
    ).toBe(1000)
  })

  it('repairs a non-boolean enabled to on', () => {
    expect(
      parseContextAlertSettings({
        enabled: 'yes' as unknown as boolean,
        percent: 75,
        tokens: null,
      }).enabled,
    ).toBe(true)
  })

  it('repairs one field without discarding the others', () => {
    expect(
      parseContextAlertSettings({ enabled: false, percent: 900, tokens: null }),
    ).toEqual({ enabled: false, percent: 75, tokens: null })
  })
})

describe('formatTokenCap', () => {
  it('says a round cap in thousands', () => {
    expect(formatTokenCap(400000)).toBe('400k')
    expect(formatTokenCap(1000)).toBe('1k')
    expect(formatTokenCap(1000000)).toBe('1000k')
  })

  it('keeps one decimal for a cap that is not a round thousand', () => {
    expect(formatTokenCap(152500)).toBe('152.5k')
  })

  it('leaves a sub-thousand figure as it is', () => {
    expect(formatTokenCap(750)).toBe('750')
  })
})
