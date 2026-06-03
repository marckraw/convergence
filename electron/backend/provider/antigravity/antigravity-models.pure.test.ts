import { describe, expect, it } from 'vitest'
import {
  buildFallbackAntigravityModelOptions,
  resolveAntigravityModelLabel,
} from './antigravity-models.pure'

describe('antigravity-models', () => {
  it('resolves UI model and effort to canonical Antigravity labels', () => {
    expect(
      resolveAntigravityModelLabel({
        modelId: 'gemini-3.1-pro',
        effortId: 'low',
      }),
    ).toBe('Gemini 3.1 Pro (low)')
    expect(
      resolveAntigravityModelLabel({
        modelId: 'gemini-3.1-pro',
        effortId: 'high',
      }),
    ).toBe('Gemini 3.1 Pro (high)')
    expect(
      resolveAntigravityModelLabel({
        modelId: 'claude-opus-4.6-thinking',
        effortId: 'high',
      }),
    ).toBe('Claude Opus 4.6 (Thinking)')
  })

  it('falls back to the default official label when effort is omitted', () => {
    expect(
      resolveAntigravityModelLabel({
        modelId: 'gemini-3.1-pro',
        effortId: null,
      }),
    ).toBe('Gemini 3.1 Pro (high)')
    expect(resolveAntigravityModelLabel({ modelId: 'gemini-3.5-flash' })).toBe(
      'Gemini 3.5 Flash',
    )
  })

  it('returns null for unknown models', () => {
    expect(resolveAntigravityModelLabel({ modelId: 'missing' })).toBeNull()
  })

  it('builds model options that preserve the Convergence model + effort UI', () => {
    const options = buildFallbackAntigravityModelOptions()

    expect(options.map((option) => option.id)).toEqual([
      'gemini-3.1-pro',
      'gemini-3.5-flash',
      'gemini-3-flash',
      'claude-sonnet-4.6-thinking',
      'claude-opus-4.6-thinking',
      'gpt-oss-120b',
    ])
    expect(
      options
        .find((option) => option.id === 'gemini-3.1-pro')
        ?.effortOptions.map((option) => option.id),
    ).toEqual(['low', 'high'])
    expect(
      options.find((option) => option.id === 'claude-sonnet-4.6-thinking')
        ?.effortOptions,
    ).toEqual([{ id: 'high', label: 'Thinking' }])
  })
})
