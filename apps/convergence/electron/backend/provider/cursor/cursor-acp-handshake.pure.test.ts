import { describe, expect, it } from 'vitest'
import { CURSOR_ACP_RECORDED_INITIALIZE_RESULT } from './cursor-acp.recorded.fixture'
import {
  CURSOR_ACP_SILENT_LOGIN_NOTE,
  formatCursorAcpProtocolVersionNote,
  parseCursorAcpHandshake,
  readCursorAcpLoginDecision,
} from './cursor-acp-handshake.pure'

describe('parseCursorAcpHandshake', () => {
  it('keeps what the live CLI answered at initialize', () => {
    const handshake = parseCursorAcpHandshake(
      CURSOR_ACP_RECORDED_INITIALIZE_RESULT,
    )

    expect(handshake).toEqual({
      protocolVersion: 1,
      loadSession: true,
      image: true,
      authMethodIds: ['cursor_login'],
    })
    expect(readCursorAcpLoginDecision(handshake)).toEqual({
      kind: 'proceed',
      note: null,
    })
  })

  it.each([
    ['null', null],
    ['a string', 'initialized'],
    ['an array', []],
    ['an empty object', {}],
    ['capabilities of the wrong type', { agentCapabilities: 'yes' }],
    [
      'prompt capabilities of the wrong type',
      { agentCapabilities: { promptCapabilities: 7 } },
    ],
    ['a non-finite protocol version', { protocolVersion: Number.NaN }],
  ])('reads %s as explicit unknowns rather than throwing', (_label, value) => {
    const handshake = parseCursorAcpHandshake(value)

    expect(handshake).toEqual({
      protocolVersion: null,
      loadSession: null,
      image: null,
      authMethodIds: null,
    })
    // Unknown is not refused: a result we could not read named no methods,
    // and the app proceeds exactly as it did before MAR-3145 (lap 2, F1).
    expect(readCursorAcpLoginDecision(handshake)).toEqual({
      kind: 'proceed',
      note: CURSOR_ACP_SILENT_LOGIN_NOTE,
    })
  })

  it('separates a CLI that named no auth methods from one that named none', () => {
    expect(parseCursorAcpHandshake({}).authMethodIds).toBeNull()
    expect(parseCursorAcpHandshake({ authMethods: [] }).authMethodIds).toEqual(
      [],
    )
  })

  it('keeps only well-formed auth method ids', () => {
    const handshake = parseCursorAcpHandshake({
      authMethods: [
        { id: 'cursor_login' },
        { id: '  spaced  ' },
        { id: '' },
        { name: 'no id' },
        'not an object',
        null,
      ],
    })

    expect(handshake.authMethodIds).toEqual(['cursor_login', 'spaced'])
  })

  it('reads capabilities the CLI denied as denied, not unknown', () => {
    const handshake = parseCursorAcpHandshake({
      protocolVersion: 2,
      agentCapabilities: {
        loadSession: false,
        promptCapabilities: { image: false },
      },
      authMethods: [{ id: 'other' }],
    })

    expect(handshake).toEqual({
      protocolVersion: 2,
      loadSession: false,
      image: false,
      authMethodIds: ['other'],
    })
  })
})

describe('readCursorAcpLoginDecision (MAR-3145 R2, corrected lap 2)', () => {
  it('refuses only a list that names other methods and not ours', () => {
    expect(
      readCursorAcpLoginDecision(
        parseCursorAcpHandshake({
          authMethods: [{ id: 'other' }, { id: 'another' }],
        }),
      ),
    ).toEqual({
      kind: 'refuse',
      message:
        'Cursor offers no login method Convergence knows (offered: other, another). Update Convergence or the Cursor CLI.',
    })
  })

  it.each([
    ['no authMethods array at all', { protocolVersion: 1 }],
    ['an empty authMethods array', { protocolVersion: 1, authMethods: [] }],
  ])('proceeds with one note when the CLI named %s', (_label, result) => {
    expect(readCursorAcpLoginDecision(parseCursorAcpHandshake(result))).toEqual(
      {
        kind: 'proceed',
        note: 'Cursor named no login methods; trying cursor_login.',
      },
    )
  })

  it('proceeds silently when our method is among the offered ones', () => {
    expect(
      readCursorAcpLoginDecision(
        parseCursorAcpHandshake({
          authMethods: [{ id: 'other' }, { id: 'cursor_login' }],
        }),
      ),
    ).toEqual({ kind: 'proceed', note: null })
  })
})

describe('formatCursorAcpProtocolVersionNote', () => {
  it('names both versions when they differ', () => {
    expect(
      formatCursorAcpProtocolVersionNote(
        parseCursorAcpHandshake({ protocolVersion: 3 }),
      ),
    ).toBe(
      'Cursor ACP protocol version 3 differs from the version Convergence speaks (1); continuing.',
    )
  })

  it.each([
    ['the versions agree', { protocolVersion: 1 }],
    ['the CLI named no version', {}],
  ])('stays silent when %s', (_label, result) => {
    expect(
      formatCursorAcpProtocolVersionNote(parseCursorAcpHandshake(result)),
    ).toBeNull()
  })
})
