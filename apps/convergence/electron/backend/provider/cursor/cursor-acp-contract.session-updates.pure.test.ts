import { describe, expect, it } from 'vitest'
import { classifyCursorAcpMessage } from './cursor-acp-contract.pure'
import { CURSOR_ACP_RECORDED_USER_MESSAGE_CHUNK } from './cursor-acp.recorded.fixture'

describe('cursor ACP session update classification', () => {
  it('classifies user_message_chunk as a known kind, not unknown', () => {
    const kind = classifyCursorAcpMessage({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'cursor-session-1',
        update: CURSOR_ACP_RECORDED_USER_MESSAGE_CHUNK,
      },
    })

    expect(kind).toBe('user-message-chunk')
    expect(kind).not.toBe('unknown')
  })
})
