import { describe, expect, it } from 'vitest'
import { isRemoteHostEligible } from './remote-host-toggle.pure'

describe('isRemoteHostEligible', () => {
  it('is eligible for project sessions on daemon-capable providers', () => {
    for (const providerId of ['claude-code', 'codex', 'cursor']) {
      expect(
        isRemoteHostEligible({
          remoteBaseUrl: 'https://daemon.example.com',
          providerId,
          contextKind: 'project',
        }),
      ).toBe(true)
    }
  })

  it('is ineligible without a configured daemon', () => {
    expect(
      isRemoteHostEligible({
        remoteBaseUrl: null,
        providerId: 'claude-code',
        contextKind: 'project',
      }),
    ).toBe(false)
  })

  it('is ineligible for global sessions', () => {
    expect(
      isRemoteHostEligible({
        remoteBaseUrl: 'https://daemon.example.com',
        providerId: 'claude-code',
        contextKind: 'global',
      }),
    ).toBe(false)
  })

  it('is ineligible for providers without a daemon counterpart', () => {
    for (const providerId of ['pi', 'antigravity', 'shell']) {
      expect(
        isRemoteHostEligible({
          remoteBaseUrl: 'https://daemon.example.com',
          providerId,
          contextKind: 'project',
        }),
      ).toBe(false)
    }
  })
})
