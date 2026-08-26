import { describe, expect, it } from 'vitest'
import type { ExecutionHostEndpoint } from '@/entities/execution-host'
import {
  isRemoteHostEligible,
  toggledExecutionHostId,
} from './remote-host-toggle.pure'

function endpoint(id: string, position = 0): ExecutionHostEndpoint {
  return {
    id,
    label: 'Remote daemon',
    baseUrl: `https://${id}.example.com`,
    position,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  }
}

describe('isRemoteHostEligible', () => {
  it('is eligible for project sessions on daemon-capable providers', () => {
    for (const providerId of ['claude-code', 'codex', 'cursor']) {
      expect(
        isRemoteHostEligible({
          endpoints: [endpoint('default')],
          providerId,
          contextKind: 'project',
        }),
      ).toBe(true)
    }
  })

  it('is ineligible without a configured daemon', () => {
    expect(
      isRemoteHostEligible({
        endpoints: [],
        providerId: 'claude-code',
        contextKind: 'project',
      }),
    ).toBe(false)
  })

  it('is ineligible for global sessions', () => {
    expect(
      isRemoteHostEligible({
        endpoints: [endpoint('default')],
        providerId: 'claude-code',
        contextKind: 'global',
      }),
    ).toBe(false)
  })

  it('is ineligible for providers without a daemon counterpart', () => {
    for (const providerId of ['pi', 'antigravity', 'shell']) {
      expect(
        isRemoteHostEligible({
          endpoints: [endpoint('default')],
          providerId,
          contextKind: 'project',
        }),
      ).toBe(false)
    }
  })
})

describe('toggledExecutionHostId', () => {
  // The toggle is a yes/no, but a session records which machine it ran on
  // (MAR-2620) — so the toggle has to resolve to an id, not to a boolean.
  it('is the first endpoint, which is the one the settings form edits', () => {
    expect(
      toggledExecutionHostId([endpoint('default'), endpoint('second', 1)]),
    ).toBe('default')
  })

  it('is null when no endpoint is configured, so nothing can be recorded', () => {
    expect(toggledExecutionHostId([])).toBeNull()
  })
})
