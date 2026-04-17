import { describe, expect, it } from 'vitest'
import {
  derivePiContextWindow,
  extractLastAssistantStopReason,
  extractToolCallFromEnd,
  extractToolResultText,
} from './pi-event-mapping.pure'

describe('derivePiContextWindow', () => {
  it('returns available window from contextUsage with explicit percent', () => {
    const window = derivePiContextWindow({
      contextUsage: { tokens: 60000, contextWindow: 200000, percent: 30 },
    })

    expect(window).toEqual({
      availability: 'available',
      source: 'provider',
      usedTokens: 60000,
      windowTokens: 200000,
      usedPercentage: 30,
      remainingPercentage: 70,
    })
  })

  it('computes percent from tokens/contextWindow when percent missing', () => {
    const window = derivePiContextWindow({
      contextUsage: { tokens: 50000, contextWindow: 200000 },
    })

    expect(window).toMatchObject({
      availability: 'available',
      usedTokens: 50000,
      windowTokens: 200000,
      usedPercentage: 25,
      remainingPercentage: 75,
    })
  })

  it('clamps used tokens to the window size', () => {
    const window = derivePiContextWindow({
      contextUsage: { tokens: 250000, contextWindow: 200000, percent: 100 },
    })

    expect(window).toMatchObject({
      usedTokens: 200000,
      windowTokens: 200000,
      usedPercentage: 100,
      remainingPercentage: 0,
    })
  })

  it('returns null when contextUsage is missing', () => {
    expect(derivePiContextWindow({})).toBeNull()
    expect(derivePiContextWindow(null)).toBeNull()
    expect(derivePiContextWindow({ contextUsage: null })).toBeNull()
  })

  it('returns null when tokens or contextWindow is not a finite number', () => {
    expect(
      derivePiContextWindow({
        contextUsage: { tokens: null, contextWindow: 200000 },
      }),
    ).toBeNull()

    expect(
      derivePiContextWindow({
        contextUsage: { tokens: 1000, contextWindow: 0 },
      }),
    ).toBeNull()
  })
})

describe('extractToolResultText', () => {
  it('joins text content blocks with newlines', () => {
    const text = extractToolResultText({
      content: [
        { type: 'text', text: 'line one' },
        { type: 'text', text: 'line two' },
      ],
    })

    expect(text).toBe('line one\nline two')
  })

  it('skips non-text content items', () => {
    const text = extractToolResultText({
      content: [
        { type: 'text', text: 'hello' },
        { type: 'image', data: '...' },
      ],
    })

    expect(text).toBe('hello')
  })

  it('returns empty string for missing or malformed content', () => {
    expect(extractToolResultText(null)).toBe('')
    expect(extractToolResultText({})).toBe('')
    expect(extractToolResultText({ content: 'not-an-array' })).toBe('')
  })
})

describe('extractLastAssistantStopReason', () => {
  it('returns stop reason from the last assistant message', () => {
    const reason = extractLastAssistantStopReason({
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', stopReason: 'toolUse' },
        { role: 'assistant', stopReason: 'stop' },
      ],
    })

    expect(reason).toBe('stop')
  })

  it('returns null when no assistant message exists', () => {
    expect(
      extractLastAssistantStopReason({
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).toBeNull()
  })

  it('returns null when stopReason is unknown', () => {
    expect(
      extractLastAssistantStopReason({
        messages: [{ role: 'assistant', stopReason: 'weird' }],
      }),
    ).toBeNull()
  })

  it('returns null when messages is missing', () => {
    expect(extractLastAssistantStopReason({})).toBeNull()
    expect(extractLastAssistantStopReason(null)).toBeNull()
  })
})

describe('extractToolCallFromEnd', () => {
  it('extracts id, name, and stringified arguments', () => {
    const result = extractToolCallFromEnd({
      assistantMessageEvent: {
        type: 'toolcall_end',
      },
      toolCall: {
        id: 'call_1',
        name: 'bash',
        arguments: { command: 'ls' },
      },
    })

    expect(result).toEqual({
      id: 'call_1',
      name: 'bash',
      input: '{"command":"ls"}',
    })
  })

  it('passes through string arguments unchanged', () => {
    const result = extractToolCallFromEnd({
      toolCall: { id: 'c', name: 'raw', arguments: 'already-a-string' },
    })

    expect(result.input).toBe('already-a-string')
  })

  it('falls back to toolCallId when toolCall is missing', () => {
    const result = extractToolCallFromEnd({
      toolCallId: 'call_2',
    })

    expect(result).toEqual({ id: 'call_2', name: 'tool', input: '' })
  })
})
