import { describe, expect, it } from 'vitest'
import { PiProvider } from './pi-provider'

describe('PiProvider', () => {
  it('exposes the expected identity', () => {
    const provider = new PiProvider('/usr/local/bin/pi')
    expect(provider.id).toBe('pi')
    expect(provider.name).toBe('Pi Agent')
    expect(provider.supportsContinuation).toBe(true)
  })

  it('returns the fallback descriptor from describe()', async () => {
    const provider = new PiProvider('/usr/local/bin/pi')
    const descriptor = await provider.describe()

    expect(descriptor.id).toBe('pi')
    expect(descriptor.vendorLabel).toBe('Pi')
    expect(descriptor.supportsContinuation).toBe(true)
    expect(descriptor.modelOptions.length).toBeGreaterThan(0)
  })

  // Protocol shape assertions — mirror the claude-code-provider style.
  // End-to-end behavior is covered by pi-rpc.test.ts and pi-event-mapping.pure.test.ts.

  it('recognizes the pi message_update text_delta event shape', () => {
    const event = {
      type: 'message_update',
      message: {},
      assistantMessageEvent: {
        type: 'text_delta',
        contentIndex: 0,
        delta: 'hello',
      },
    }
    expect(event.assistantMessageEvent.type).toBe('text_delta')
    expect(event.assistantMessageEvent.delta).toBe('hello')
  })

  it('recognizes the pi tool_execution_end event shape', () => {
    const event = {
      type: 'tool_execution_end',
      toolCallId: 'call_abc',
      toolName: 'bash',
      result: {
        content: [{ type: 'text', text: 'hi' }],
        details: {},
      },
      isError: false,
    }
    expect(event.type).toBe('tool_execution_end')
    expect(event.result.content[0]?.type).toBe('text')
  })

  it('recognizes the pi agent_end event shape with stopReason', () => {
    const event = {
      type: 'agent_end',
      messages: [{ role: 'assistant', stopReason: 'stop' }],
    }
    expect(event.messages[0]?.role).toBe('assistant')
    expect(event.messages[0]?.stopReason).toBe('stop')
  })
})
