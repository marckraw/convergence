import { describe, expect, it } from 'vitest'
import { getExecutionHostRemoteBaseUrlError } from './execution-host-settings.pure'

describe('getExecutionHostRemoteBaseUrlError', () => {
  it('allows an empty value because the remote host is optional', () => {
    expect(getExecutionHostRemoteBaseUrlError('')).toBeNull()
    expect(getExecutionHostRemoteBaseUrlError('   ')).toBeNull()
  })

  it('accepts http and https URLs', () => {
    expect(
      getExecutionHostRemoteBaseUrlError('https://daemon.example.com'),
    ).toBeNull()
    expect(
      getExecutionHostRemoteBaseUrlError('http://127.0.0.1:7800'),
    ).toBeNull()
  })

  it('rejects non-HTTP URLs and garbage', () => {
    expect(getExecutionHostRemoteBaseUrlError('ftp://daemon')).toMatch(
      /HTTP\(S\)/,
    )
    expect(getExecutionHostRemoteBaseUrlError('not a url')).toMatch(/HTTP\(S\)/)
  })
})
