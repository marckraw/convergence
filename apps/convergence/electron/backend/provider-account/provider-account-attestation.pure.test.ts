import { describe, expect, it } from 'vitest'
import {
  attestAccountIdentity,
  isAttestationDue,
} from './provider-account-attestation.pure'

const ENROLLED = { email: 'a@example.com', orgId: 'org-a' }

describe('attestAccountIdentity', () => {
  it('verifies an account that still serves the identity it was enrolled with', () => {
    expect(
      attestAccountIdentity({
        enrolled: ENROLLED,
        observed: { email: 'a@example.com', orgId: 'org-a', plan: 'max' },
      }),
    ).toEqual({ outcome: 'verified', status: 'connected', detail: null })
  })

  it('disables an account serving somebody else rather than spending it', () => {
    const verdict = attestAccountIdentity({
      enrolled: ENROLLED,
      observed: { email: 'b@example.com', orgId: 'org-b', plan: 'max' },
    })

    expect(verdict.outcome).toBe('identity-mismatch')
    expect(verdict.status).toBe('unavailable')
    expect(verdict.detail).toMatch(/a@example\.com/)
    expect(verdict.detail).toMatch(/b@example\.com/)
  })

  it('catches a release that quietly serves the default account', () => {
    // The failure mode the undocumented variable makes possible: the mechanism
    // stops working, the default account serves the turn, and the account
    // directory records whose credential actually answered.
    expect(
      attestAccountIdentity({
        enrolled: ENROLLED,
        observed: {
          email: 'default-account@example.com',
          orgId: 'org-default',
          plan: 'max',
        },
      }).status,
    ).toBe('unavailable')
  })

  it('catches an organization swap even when the email still matches', () => {
    expect(
      attestAccountIdentity({
        enrolled: ENROLLED,
        observed: {
          email: 'a@example.com',
          orgId: 'org-somewhere-else',
          plan: null,
        },
      }).outcome,
    ).toBe('identity-mismatch')
  })

  it('leaves the status alone when nothing could be read', () => {
    // An unreadable file is not evidence that the credential changed, and
    // disabling a working account on filesystem noise is its own outage.
    const verdict = attestAccountIdentity({
      enrolled: ENROLLED,
      observed: null,
    })

    expect(verdict.outcome).toBe('unreadable')
    expect(verdict.status).toBeNull()
  })

  it('does not judge an account that was enrolled without an identity', () => {
    const verdict = attestAccountIdentity({
      enrolled: { email: null, orgId: null },
      observed: { email: 'a@example.com', orgId: 'org-a', plan: null },
    })

    expect(verdict.outcome).toBe('identity-unknown')
    expect(verdict.status).toBeNull()
  })

  it('compares only the fields the enrolment actually captured', () => {
    expect(
      attestAccountIdentity({
        enrolled: { email: 'a@example.com', orgId: null },
        observed: { email: 'a@example.com', orgId: 'org-new', plan: null },
      }).outcome,
    ).toBe('verified')
  })
})

describe('isAttestationDue', () => {
  const base = {
    currentVersion: '2.1.220',
    lastVersion: '2.1.220',
    lastCheckedAt: 1_000_000,
    now: 1_000_000,
    intervalMs: 24 * 60 * 60 * 1000,
  }

  it('is due when it has never run', () => {
    expect(isAttestationDue({ ...base, lastCheckedAt: null })).toBe(true)
  })

  it('is due the moment the Claude version changes', () => {
    // The trigger that matters: a release renaming or ignoring the
    // undocumented variable arrives exactly here.
    expect(isAttestationDue({ ...base, currentVersion: '2.2.0' })).toBe(true)
  })

  it('is due once the interval has elapsed', () => {
    expect(
      isAttestationDue({ ...base, now: base.lastCheckedAt + base.intervalMs }),
    ).toBe(true)
  })

  it('is not due for an unchanged version inside the interval', () => {
    expect(
      isAttestationDue({ ...base, now: base.lastCheckedAt + 60_000 }),
    ).toBe(false)
  })

  it('treats an unknown version as unchanged rather than re-checking forever', () => {
    expect(
      isAttestationDue({
        ...base,
        currentVersion: null,
        lastVersion: null,
        now: base.lastCheckedAt + 60_000,
      }),
    ).toBe(false)
  })
})
