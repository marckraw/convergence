import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EXECUTION_HOST_ENDPOINT_ID,
  executionHostEndpointDisplayName,
  isLocalExecutionHost,
  isRemoteExecutionHost,
  LOCAL_EXECUTION_HOST_ID,
  UNNAMED_EXECUTION_HOST_ENDPOINT_LABEL,
} from './execution-host.pure'

describe('execution host ids in the renderer', () => {
  it('treats only "local" as this machine', () => {
    expect(isLocalExecutionHost(LOCAL_EXECUTION_HOST_ID)).toBe(true)
    expect(isLocalExecutionHost(DEFAULT_EXECUTION_HOST_ENDPOINT_ID)).toBe(false)
    // The word that used to mean "the daemon" is now just another id
    // (MAR-2620); nothing may treat it as special.
    expect(isLocalExecutionHost('remote')).toBe(false)
    expect(isLocalExecutionHost('legacy-remote')).toBe(false)
  })

  it('reads an absent or blank host as local, the way every pre-remote row meant', () => {
    expect(isLocalExecutionHost(null)).toBe(true)
    expect(isLocalExecutionHost(undefined)).toBe(true)
    expect(isLocalExecutionHost('   ')).toBe(true)
  })

  it('is exactly the negation, so no third state can appear', () => {
    for (const id of ['local', 'default', 'remote', '', null, undefined]) {
      expect(isRemoteExecutionHost(id)).toBe(!isLocalExecutionHost(id))
    }
  })

  // The backend keys the Keychain account for the migrated Endpoint by this
  // exact id, so a drift here would have the settings form editing one machine
  // while its token belongs to another.
  it('agrees with the backend on the migrated endpoint id', () => {
    expect(DEFAULT_EXECUTION_HOST_ENDPOINT_ID).toBe('default')
    expect(LOCAL_EXECUTION_HOST_ID).toBe('local')
  })
})

describe('executionHostEndpointDisplayName', () => {
  it('uses the name he gave it, and says so when he gave none', () => {
    expect(executionHostEndpointDisplayName({ label: ' kuba-vps ' })).toBe(
      'kuba-vps',
    )
    expect(executionHostEndpointDisplayName({ label: '  ' })).toBe(
      UNNAMED_EXECUTION_HOST_ENDPOINT_LABEL,
    )
  })
})
