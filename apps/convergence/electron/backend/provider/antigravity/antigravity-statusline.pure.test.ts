import { describe, expect, it } from 'vitest'
import {
  mapAntigravityContextWindow,
  parseAntigravityStatusLineJson,
  parseAntigravityStatusLinePayload,
} from './antigravity-statusline.pure'

describe('antigravity-statusline', () => {
  it('parses safe fields and omits account identifiers', () => {
    const snapshot = parseAntigravityStatusLinePayload({
      conversation_id: '2aebf1c5-0872-4ad5-958a-c4e26f9fb96b',
      email: 'person@example.com',
      model: {
        id: 'Gemini 3.5 Flash (Medium)',
        display_name: 'Gemini 3.5 Flash (Medium)',
      },
      product: 'antigravity',
      version: '1.0.4',
      plan_tier: 'Google AI Pro',
      agent_state: 'idle',
      context_window: {
        total_input_tokens: 156,
        total_output_tokens: 31,
        context_window_size: 1048576,
        used_percentage: 0.0624,
        remaining_percentage: 99.9376,
        current_usage: {
          input_tokens: 19398,
          output_tokens: 31,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      },
    })

    expect(snapshot).toEqual({
      conversationId: '2aebf1c5-0872-4ad5-958a-c4e26f9fb96b',
      model: {
        id: 'Gemini 3.5 Flash (Medium)',
        displayName: 'Gemini 3.5 Flash (Medium)',
      },
      product: 'antigravity',
      version: '1.0.4',
      planTier: 'Google AI Pro',
      agentState: 'idle',
      contextWindow: {
        totalInputTokens: 156,
        totalOutputTokens: 31,
        contextWindowSize: 1048576,
        usedPercentage: 0.0624,
        remainingPercentage: 99.9376,
        currentUsage: {
          inputTokens: 19398,
          outputTokens: 31,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
        },
      },
    })
    expect(snapshot).not.toHaveProperty('email')
  })

  it('parses JSON lines and ignores invalid JSON', () => {
    expect(
      parseAntigravityStatusLineJson(
        '{"conversation_id":"abc","agent_state":"working"}',
      ),
    )?.toMatchObject({ conversationId: 'abc', agentState: 'working' })
    expect(parseAntigravityStatusLineJson('not json')).toBeNull()
  })

  it('maps context window telemetry to the shared provider context shape', () => {
    const snapshot = parseAntigravityStatusLinePayload({
      context_window: {
        total_input_tokens: 100,
        total_output_tokens: 25,
        context_window_size: 1000,
        used_percentage: 12.5,
        remaining_percentage: 87.5,
      },
    })

    expect(
      mapAntigravityContextWindow(snapshot?.contextWindow ?? null),
    ).toEqual({
      availability: 'available',
      source: 'provider',
      usedTokens: 125,
      windowTokens: 1000,
      usedPercentage: 12.5,
      remainingPercentage: 87.5,
    })
  })

  it('returns an unavailable context when telemetry is missing', () => {
    expect(mapAntigravityContextWindow(null)).toEqual({
      availability: 'unavailable',
      source: 'provider',
      reason:
        'Antigravity status-line telemetry did not include context window data.',
    })
  })
})
