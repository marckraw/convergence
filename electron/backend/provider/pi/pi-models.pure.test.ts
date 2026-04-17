import { describe, expect, it } from 'vitest'
import {
  mapEffortToPiThinking,
  mapPiModel,
  mapPiModels,
} from './pi-models.pure'

describe('mapPiModel', () => {
  it('returns null for non-object input', () => {
    expect(mapPiModel(null)).toBeNull()
    expect(mapPiModel('string')).toBeNull()
    expect(mapPiModel(undefined)).toBeNull()
  })

  it('returns null when id or provider is missing', () => {
    expect(mapPiModel({ id: 'x' })).toBeNull()
    expect(mapPiModel({ provider: 'anthropic' })).toBeNull()
    expect(mapPiModel({ id: 'x', provider: null })).toBeNull()
  })

  it('composes id as "provider/modelId"', () => {
    const option = mapPiModel({
      id: 'claude-sonnet-4-6',
      name: 'Claude Sonnet 4.6',
      provider: 'anthropic',
      reasoning: true,
    })
    expect(option?.id).toBe('anthropic/claude-sonnet-4-6')
  })

  it('prefixes label with the vendor label', () => {
    expect(
      mapPiModel({
        id: 'gpt-5',
        name: 'GPT-5',
        provider: 'openai',
        reasoning: true,
      })?.label,
    ).toBe('OpenAI · GPT-5')
  })

  it('falls back to id when name is missing', () => {
    expect(
      mapPiModel({
        id: 'llama3.1:8b',
        provider: 'ollama',
      })?.label,
    ).toBe('Ollama · llama3.1:8b')
  })

  it('omits effort options for non-reasoning models', () => {
    const option = mapPiModel({
      id: 'claude-3-haiku-20240307',
      name: 'Claude Haiku 3',
      provider: 'anthropic',
      reasoning: false,
    })
    expect(option?.effortOptions).toEqual([])
    expect(option?.defaultEffort).toBeNull()
  })

  it('gives the standard effort ladder for reasoning models (no xhigh for non-openai)', () => {
    const option = mapPiModel({
      id: 'claude-opus-4-6',
      name: 'Claude Opus 4.6',
      provider: 'anthropic',
      reasoning: true,
    })
    expect(option?.effortOptions.map((e) => e.id)).toEqual([
      'none',
      'minimal',
      'low',
      'medium',
      'high',
    ])
    expect(option?.defaultEffort).toBe('medium')
  })

  it('adds xhigh to the ladder for openai reasoning models', () => {
    const option = mapPiModel({
      id: 'codex-max',
      name: 'Codex Max',
      provider: 'openai',
      reasoning: true,
    })
    expect(option?.effortOptions.map((e) => e.id)).toEqual([
      'none',
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
    ])
  })
})

describe('mapPiModels', () => {
  it('returns [] for non-array input', () => {
    expect(mapPiModels(null)).toEqual([])
    expect(mapPiModels({})).toEqual([])
  })

  it('drops malformed entries', () => {
    const result = mapPiModels([
      { id: 'a', provider: 'anthropic' },
      { id: 'b' },
      null,
      { provider: 'openai' },
      { id: 'c', provider: 'google' },
    ])
    expect(result.map((r) => r.id)).toEqual(['anthropic/a', 'google/c'])
  })
})

describe('mapEffortToPiThinking', () => {
  it('returns null for null effort', () => {
    expect(mapEffortToPiThinking(null)).toBeNull()
  })

  it('maps none to off', () => {
    expect(mapEffortToPiThinking('none')).toBe('off')
  })

  it('maps max to high (pi has no max level)', () => {
    expect(mapEffortToPiThinking('max')).toBe('high')
  })

  it('passes through supported levels', () => {
    expect(mapEffortToPiThinking('minimal')).toBe('minimal')
    expect(mapEffortToPiThinking('low')).toBe('low')
    expect(mapEffortToPiThinking('medium')).toBe('medium')
    expect(mapEffortToPiThinking('high')).toBe('high')
    expect(mapEffortToPiThinking('xhigh')).toBe('xhigh')
  })
})
