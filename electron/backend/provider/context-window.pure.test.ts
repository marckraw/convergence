import { describe, expect, it } from 'vitest'
import {
  createUnavailableContextWindow,
  deriveClaudeContextWindow,
  deriveClaudeEstimatedContextWindow,
  deriveCodexContextWindow,
} from './context-window.pure'

describe('context-window.pure', () => {
  it('derives codex context state from provider token usage', () => {
    expect(
      deriveCodexContextWindow({
        last: {
          inputTokens: 32000,
          cachedInputTokens: 8000,
        },
        modelContextWindow: 200000,
      }),
    ).toEqual({
      availability: 'available',
      source: 'provider',
      usedTokens: 40000,
      windowTokens: 200000,
      usedPercentage: 20,
      remainingPercentage: 80,
    })
  })

  it('returns null when codex token usage is incomplete', () => {
    expect(
      deriveCodexContextWindow({
        last: {
          cachedInputTokens: 8000,
        },
        modelContextWindow: 200000,
      }),
    ).toBeNull()
  })

  it('derives claude context state when headless events contain context_window', () => {
    expect(
      deriveClaudeContextWindow({
        context_window: {
          used_percentage: 42,
          remaining_percentage: 58,
          used_tokens: 84000,
          window_size_tokens: 200000,
        },
      }),
    ).toEqual({
      availability: 'available',
      source: 'provider',
      usedTokens: 84000,
      windowTokens: 200000,
      usedPercentage: 42,
      remainingPercentage: 58,
    })
  })

  it('derives an estimated claude context state from turn usage', () => {
    expect(
      deriveClaudeEstimatedContextWindow(
        {
          message: {
            model: 'claude-opus-4-6',
            usage: {
              input_tokens: 1200,
              cache_creation_input_tokens: 300,
              cache_read_input_tokens: 8500,
            },
          },
        },
        'opus',
      ),
    ).toEqual({
      availability: 'available',
      source: 'estimated',
      usedTokens: 10000,
      windowTokens: 200000,
      usedPercentage: 5,
      remainingPercentage: 95,
    })
  })

  it('creates a provider-unavailable fallback state', () => {
    expect(
      createUnavailableContextWindow('Provider does not report context usage.'),
    ).toEqual({
      availability: 'unavailable',
      source: 'provider',
      reason: 'Provider does not report context usage.',
    })
  })
})
