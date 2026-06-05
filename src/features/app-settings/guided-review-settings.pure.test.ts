import { describe, expect, it } from 'vitest'
import { getGuidedReviewRemoteBaseUrlError } from './guided-review-settings.pure'

describe('guided review settings helpers', () => {
  it('does not require a daemon URL when guided review runs locally', () => {
    expect(getGuidedReviewRemoteBaseUrlError('local', '')).toBeNull()
  })

  it('requires a daemon URL when guided review runs remotely', () => {
    expect(getGuidedReviewRemoteBaseUrlError('remote', '')).toBe(
      'Remote daemon base URL is required.',
    )
  })

  it('accepts http and https daemon URLs', () => {
    expect(
      getGuidedReviewRemoteBaseUrlError('remote', 'https://daemon.example.com'),
    ).toBeNull()
    expect(
      getGuidedReviewRemoteBaseUrlError('remote', 'http://127.0.0.1:7800'),
    ).toBeNull()
  })

  it('rejects non-http daemon URLs', () => {
    expect(
      getGuidedReviewRemoteBaseUrlError('remote', 'file:///tmp/daemon'),
    ).toBe('Remote daemon base URL must be a valid HTTP(S) URL.')
  })
})
