import { describe, expect, it } from 'vitest'
import {
  buildCodexClientInfo,
  CODEX_UNKNOWN_APP_VERSION,
} from './codex-client-info.pure'

describe('buildCodexClientInfo', () => {
  it('reports the real app version', () => {
    expect(buildCodexClientInfo('0.45.2')).toEqual({
      name: 'convergence',
      title: 'Convergence',
      version: '0.45.2',
    })
  })

  it('trims whitespace around the version', () => {
    expect(buildCodexClientInfo('  1.2.3  ').version).toBe('1.2.3')
  })

  it('falls back when the app version is unavailable', () => {
    expect(buildCodexClientInfo(null).version).toBe(CODEX_UNKNOWN_APP_VERSION)
    expect(buildCodexClientInfo(undefined).version).toBe(
      CODEX_UNKNOWN_APP_VERSION,
    )
    expect(buildCodexClientInfo('   ').version).toBe(CODEX_UNKNOWN_APP_VERSION)
  })
})
