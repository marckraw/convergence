import { describe, expect, it } from 'vitest'
import { CURSOR_ACP_RECORDED_INITIALIZE_RESULT } from './cursor-acp.recorded.fixture'
import {
  cursorAcpHandshakeOffersLogin,
  formatCursorAcpMissingLoginMethodMessage,
  formatCursorAcpProtocolVersionNote,
  parseCursorAcpHandshake,
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
    expect(cursorAcpHandshakeOffersLogin(handshake)).toBe(true)
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
    expect(cursorAcpHandshakeOffersLogin(handshake)).toBe(false)
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

describe('formatCursorAcpMissingLoginMethodMessage', () => {
  it('names what the CLI offered', () => {
    expect(
      formatCursorAcpMissingLoginMethodMessage(
        parseCursorAcpHandshake({
          authMethods: [{ id: 'other' }, { id: 'another' }],
        }),
      ),
    ).toBe(
      'Cursor offers no login method Convergence knows (offered: other, another). Update Convergence or the Cursor CLI.',
    )
  })

  it.each([
    ['an empty list', { authMethods: [] }],
    ['no list at all', {}],
  ])('says "none" for %s', (_label, result) => {
    expect(
      formatCursorAcpMissingLoginMethodMessage(parseCursorAcpHandshake(result)),
    ).toBe(
      'Cursor offers no login method Convergence knows (offered: none). Update Convergence or the Cursor CLI.',
    )
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
