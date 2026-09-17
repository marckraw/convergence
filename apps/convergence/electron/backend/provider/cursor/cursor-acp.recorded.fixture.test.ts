import { describe, expect, it } from 'vitest'
import { buildCursorAcpInitializeParams } from './cursor-acp-client'
import { CURSOR_ACP_SESSION_UPDATES } from './cursor-acp-contract.pure'
import {
  CURSOR_ACP_RECORDED_CANCEL_REQUEST_ERROR,
  CURSOR_ACP_RECORDED_INITIALIZE_RESULT,
  CURSOR_ACP_RECORDED_SESSION_UPDATE_KINDS,
} from './cursor-acp.recorded.fixture'

describe('cursor ACP recorded fixture vs contract', () => {
  it('pins the recorded update-kind gap until CP3 closes it', () => {
    const appKinds = new Set<string>(CURSOR_ACP_SESSION_UPDATES)
    const gap = CURSOR_ACP_RECORDED_SESSION_UPDATE_KINDS.filter(
      (kind) => !appKinds.has(kind),
    )

    expect(gap).toEqual(['user_message_chunk'])
  })

  it('matches the initialize protocolVersion the app sends', () => {
    expect(CURSOR_ACP_RECORDED_INITIALIZE_RESULT.protocolVersion).toBe(
      buildCursorAcpInitializeParams().protocolVersion,
    )
  })

  it('records cancel-as-request as JSON-RPC method-not-found', () => {
    expect(CURSOR_ACP_RECORDED_CANCEL_REQUEST_ERROR.code).toBe(-32601)
  })
})
