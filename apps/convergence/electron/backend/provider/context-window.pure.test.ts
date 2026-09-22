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

  it("derives an estimated claude context state from the last assistant message's usage", () => {
    expect(
      deriveClaudeEstimatedContextWindow(
        {
          type: 'assistant',
          message: {
            model: 'claude-opus-4-6',
            usage: {
              input_tokens: 1200,
              cache_creation_input_tokens: 300,
              cache_read_input_tokens: 8500,
              output_tokens: 2500,
            },
          },
        },
        'opus',
      ),
    ).toEqual({
      availability: 'available',
      source: 'estimated',
      // The SDK's definition of the context: the last main-thread response's
      // input + cache_read + cache_creation + output tokens.
      usedTokens: 12500,
      windowTokens: 1_000_000,
      usedPercentage: 1,
      remainingPercentage: 99,
    })
  })

  it("refuses a result event, whose root usage is the turn's summed usage", () => {
    // The real record behind MAR-3332: session_turns seq 1295 stored a turn
    // sum of 1,062,462 while the context was ~125k.
    expect(
      deriveClaudeEstimatedContextWindow(
        {
          type: 'result',
          subtype: 'success',
          usage: {
            input_tokens: 354,
            cache_creation_input_tokens: 43_072,
            cache_read_input_tokens: 1_019_036,
          },
        },
        'fable',
      ),
    ).toBeNull()
  })

  it("refuses a subagent assistant event, whose usage is the subagent's context", () => {
    expect(
      deriveClaudeEstimatedContextWindow(
        {
          type: 'assistant',
          parent_tool_use_id: 'toolu_task_1',
          message: {
            model: 'claude-opus-5',
            usage: {
              input_tokens: 12,
              cache_creation_input_tokens: 20_000,
              cache_read_input_tokens: 380_000,
            },
          },
        },
        'fable',
      ),
    ).toBeNull()
  })

  it('keeps the last assistant request as the context when a turn ends', () => {
    // The exact expression claude-code-provider.ts runs on every stream event,
    // keeping the last non-null answer as the session's context window.
    const readContextWindow = (event: unknown) =>
      deriveClaudeContextWindow(event) ??
      deriveClaudeEstimatedContextWindow(event, 'fable')

    const turn = [
      {
        type: 'assistant',
        message: {
          model: 'claude-opus-5',
          usage: {
            input_tokens: 32,
            cache_creation_input_tokens: 4_127,
            cache_read_input_tokens: 120_863,
          },
        },
      },
      {
        // A Task subagent's request, forwarded mid-turn with a LARGER context
        // than the main thread's (12 + 20,000 + 380,000 = 400,012).
        type: 'assistant',
        parent_tool_use_id: 'toolu_task_1',
        message: {
          model: 'claude-opus-5',
          usage: {
            input_tokens: 12,
            cache_creation_input_tokens: 20_000,
            cache_read_input_tokens: 380_000,
          },
        },
      },
      {
        type: 'result',
        subtype: 'success',
        usage: {
          input_tokens: 354,
          cache_creation_input_tokens: 43_072,
          cache_read_input_tokens: 1_019_036,
        },
      },
    ]

    let contextWindow = null
    for (const event of turn) {
      contextWindow = readContextWindow(event) ?? contextWindow
    }

    expect(contextWindow).toEqual({
      availability: 'available',
      source: 'estimated',
      usedTokens: 125_022,
      windowTokens: 1_000_000,
      usedPercentage: 13,
      remainingPercentage: 87,
    })
  })

  it('estimates the 1M context window for claude-opus-5', () => {
    expect(
      deriveClaudeEstimatedContextWindow(
        {
          message: {
            model: 'claude-opus-5',
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
      windowTokens: 1_000_000,
      usedPercentage: 1,
      remainingPercentage: 99,
    })
  })

  it('estimates the 1M context window for claude-opus-5-5', () => {
    expect(
      deriveClaudeEstimatedContextWindow(
        {
          message: {
            model: 'claude-opus-5-5',
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
      windowTokens: 1_000_000,
      usedPercentage: 1,
      remainingPercentage: 99,
    })
  })

  it('estimates current 1M-capable claude model context windows', () => {
    expect(
      deriveClaudeEstimatedContextWindow(
        {
          message: {
            model: 'claude-sonnet-5',
            usage: {
              input_tokens: 1200,
              cache_creation_input_tokens: 300,
              cache_read_input_tokens: 8500,
            },
          },
        },
        'sonnet',
      ),
    ).toEqual({
      availability: 'available',
      source: 'estimated',
      usedTokens: 10000,
      windowTokens: 1_000_000,
      usedPercentage: 1,
      remainingPercentage: 99,
    })
  })

  it('keeps the same tier when a claude session switches from fable to opus', () => {
    const usage = {
      usage: {
        input_tokens: 1200,
        cache_creation_input_tokens: 300,
        cache_read_input_tokens: 8500,
      },
    }

    const onFable = deriveClaudeEstimatedContextWindow(usage, 'fable')

    expect(onFable).toEqual({
      availability: 'available',
      source: 'estimated',
      usedTokens: 10000,
      windowTokens: 1_000_000,
      usedPercentage: 1,
      remainingPercentage: 99,
    })
    expect(deriveClaudeEstimatedContextWindow(usage, 'opus')).toEqual(onFable)
  })

  it('keeps versioned pre-5 opus ids on the 200k tier', () => {
    expect(
      deriveClaudeEstimatedContextWindow(
        {
          message: {
            model: 'claude-opus-4-5',
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
      windowTokens: 200_000,
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
