import { describe, expect, it } from 'vitest'
import {
  createFavoriteModelKeySet,
  createFavoriteModelOrderMap,
  modelPickerFavoriteKey,
  toggleFavoriteModel,
} from './model-picker-dialog.pure'

describe('model picker favorite helpers', () => {
  it('creates stable provider/model keys', () => {
    expect(modelPickerFavoriteKey('codex', 'gpt-5.4')).toBe('codex\0gpt-5.4')
  })

  it('creates key sets for favorite lookup', () => {
    const keys = createFavoriteModelKeySet([
      { providerId: 'codex', modelId: 'gpt-5.4' },
      { providerId: 'claude-code', modelId: 'opus' },
    ])

    expect(keys.has(modelPickerFavoriteKey('codex', 'gpt-5.4'))).toBe(true)
    expect(keys.has(modelPickerFavoriteKey('codex', 'gpt-5.3'))).toBe(false)
  })

  it('creates order maps from favorite order', () => {
    const order = createFavoriteModelOrderMap([
      { providerId: 'claude-code', modelId: 'opus' },
      { providerId: 'codex', modelId: 'gpt-5.4' },
    ])

    expect(order.get(modelPickerFavoriteKey('claude-code', 'opus'))).toBe(0)
    expect(order.get(modelPickerFavoriteKey('codex', 'gpt-5.4'))).toBe(1)
  })

  it('toggles favorite membership while preserving existing order', () => {
    const favorites = [{ providerId: 'codex', modelId: 'gpt-5.4' }]

    expect(
      toggleFavoriteModel(favorites, {
        providerId: 'claude-code',
        modelId: 'opus',
      }),
    ).toEqual([
      { providerId: 'codex', modelId: 'gpt-5.4' },
      { providerId: 'claude-code', modelId: 'opus' },
    ])

    expect(
      toggleFavoriteModel(favorites, {
        providerId: 'codex',
        modelId: 'gpt-5.4',
      }),
    ).toEqual([])
  })
})
