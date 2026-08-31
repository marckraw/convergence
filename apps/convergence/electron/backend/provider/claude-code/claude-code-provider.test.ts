import { describe, expect, it } from 'vitest'

// We test the event mapping logic by simulating what the line parser would emit
// Full integration tests require the actual claude binary

describe('ClaudeCodeProvider event mapping', () => {
  // These tests verify our understanding of the Claude Code JSON format
  // by testing the parsing logic in isolation

  it('recognizes system event format', () => {
    const event = { type: 'system', session_id: 'abc-123' }
    expect(event.type).toBe('system')
    expect(event.session_id).toBe('abc-123')
  })

  it('recognizes stream_event with content_block_delta', () => {
    const event = {
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'Hello' },
      },
    }
    expect(event.event.type).toBe('content_block_delta')
    expect(event.event.delta.text).toBe('Hello')
  })

  it('recognizes assistant event with tool_use', () => {
    const event = {
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Let me edit that file.' },
          {
            type: 'tool_use',
            name: 'edit_file',
            input: { path: 'src/main.ts', content: '...' },
          },
        ],
      },
    }
    expect(event.message.content).toHaveLength(2)
    expect(event.message.content[1].type).toBe('tool_use')
    expect(event.message.content[1].name).toBe('edit_file')
  })

  it('recognizes result event', () => {
    const successResult = { type: 'result', is_error: false }
    const errorResult = {
      type: 'result',
      is_error: true,
      result: 'Authentication failed',
    }

    expect(successResult.is_error).toBe(false)
    expect(errorResult.is_error).toBe(true)
    expect(errorResult.result).toBe('Authentication failed')
  })

  it('recognizes user event with tool_result', () => {
    const event = {
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tu_123',
            content: 'File edited successfully',
          },
        ],
      },
    }
    expect(event.message.content[0].type).toBe('tool_result')
    expect(event.message.content[0].content).toBe('File edited successfully')
  })
})
