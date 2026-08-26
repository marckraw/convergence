import { describe, expect, it } from 'vitest'
import type { ExecutionHostEndpoint } from '@/entities/execution-host'
import {
  describeExecutionHostEndpointActionBlocks,
  describeExecutionHostEndpointRemoval,
  executionHostEndpointDisplayName,
  executionHostEndpointDrafts,
  getExecutionHostEndpointBaseUrlError,
  getExecutionHostRemoteBaseUrlError,
  hasExecutionHostEndpointErrors,
  nextExecutionHostEndpointId,
  normalizeExecutionHostBaseUrl,
  type ExecutionHostEndpointDraft,
} from './execution-host-settings.pure'

function endpoint(
  overrides: Partial<ExecutionHostEndpoint> = {},
): ExecutionHostEndpoint {
  return {
    id: 'default',
    label: 'kuba-vps',
    baseUrl: 'https://daemon.example.com',
    position: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

function draft(
  overrides: Partial<ExecutionHostEndpointDraft> = {},
): ExecutionHostEndpointDraft {
  return {
    id: 'default',
    label: 'kuba-vps',
    baseUrl: 'https://daemon.example.com',
    ...overrides,
  }
}

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

describe('normalizeExecutionHostBaseUrl', () => {
  // Mirrors the backend normalizer. A renderer that compared raw strings would
  // call a case difference an edit and block a test that would have worked.
  it('agrees with the stored form for casing and trailing slashes', () => {
    expect(normalizeExecutionHostBaseUrl('HTTPS://Daemon.Example.com/')).toBe(
      'https://daemon.example.com',
    )
    expect(
      normalizeExecutionHostBaseUrl('  https://daemon.example.com  '),
    ).toBe('https://daemon.example.com')
  })

  it('is null for anything that is not an HTTP(S) URL', () => {
    expect(normalizeExecutionHostBaseUrl('')).toBeNull()
    expect(normalizeExecutionHostBaseUrl('ftp://daemon')).toBeNull()
  })
})

describe('getExecutionHostEndpointBaseUrlError', () => {
  // The single-field era read blank as "unconfigure the remote host". With an
  // explicit Remove, blank is an unfinished row and must not save.
  it('rejects a blank URL and points at Remove', () => {
    expect(getExecutionHostEndpointBaseUrlError('  ')).toMatch(
      /remove this endpoint/,
    )
  })

  it('blocks Save while any row is unfinished, and only then', () => {
    expect(hasExecutionHostEndpointErrors([draft()])).toBe(false)
    expect(
      hasExecutionHostEndpointErrors([draft(), draft({ baseUrl: '' })]),
    ).toBe(true)
  })
})

describe('nextExecutionHostEndpointId', () => {
  // The Keychain account and CONVERGENCE_EXECUTION_HOST_DAEMON_TOKEN are keyed
  // to 'default' and to nothing else, so the first Endpoint has to claim it.
  it("gives the first endpoint 'default' so the stored token still resolves", () => {
    expect(nextExecutionHostEndpointId([], () => 'minted')).toBe('default')
  })

  it('mints a fresh id once default is taken, never sharing an account', () => {
    expect(nextExecutionHostEndpointId([draft()], () => 'minted')).toBe(
      'minted',
    )
  })

  it('keeps minting until the id is free', () => {
    const ids = ['default', 'taken', 'free']
    let index = 0
    expect(
      nextExecutionHostEndpointId([draft(), draft({ id: 'taken' })], () => {
        return ids[index++] ?? 'exhausted'
      }),
    ).toBe('free')
  })
})

describe('executionHostEndpointDrafts', () => {
  // Slice 1's stability guarantee: a session points at an id, so seeding the
  // form must carry ids through rather than reissue them.
  it('carries the stored id into the row that edits it', () => {
    expect(
      executionHostEndpointDrafts([
        endpoint({ id: 'default' }),
        endpoint({ id: 'kuba', label: 'kuba-vps', baseUrl: 'https://k.test' }),
      ]),
    ).toEqual([
      {
        id: 'default',
        label: 'kuba-vps',
        baseUrl: 'https://daemon.example.com',
      },
      { id: 'kuba', label: 'kuba-vps', baseUrl: 'https://k.test' },
    ])
  })
})

describe('executionHostEndpointDisplayName', () => {
  it('uses the name he gave it, and says so when he gave none', () => {
    expect(executionHostEndpointDisplayName({ label: ' kuba-vps ' })).toBe(
      'kuba-vps',
    )
    expect(executionHostEndpointDisplayName({ label: '  ' })).toBe(
      'Unnamed endpoint',
    )
  })
})

describe('describeExecutionHostEndpointActionBlocks', () => {
  it('lets a saved, unedited row do everything', () => {
    expect(
      describeExecutionHostEndpointActionBlocks({
        draft: draft(),
        saved: endpoint(),
      }),
    ).toEqual({ token: null, connection: null })
  })

  it('blocks both when the endpoint has never been saved', () => {
    const blocks = describeExecutionHostEndpointActionBlocks({
      draft: draft(),
      saved: null,
    })
    expect(blocks.token).toMatch(/does not exist yet/)
    expect(blocks.connection).toMatch(/does not exist yet/)
  })

  // The Keychain account is the id; the connection test is the address. An
  // edited URL changes only the second, so only the second may be blocked.
  it('blocks only the test when the typed URL is not the saved one', () => {
    const blocks = describeExecutionHostEndpointActionBlocks({
      draft: draft({ baseUrl: 'https://moved.example.com' }),
      saved: endpoint(),
    })
    expect(blocks.token).toBeNull()
    expect(blocks.connection).toBe(
      'Save to test the URL you typed — this endpoint still points at ' +
        'https://daemon.example.com.',
    )
  })

  it('does not call a re-typed identical URL an edit', () => {
    expect(
      describeExecutionHostEndpointActionBlocks({
        draft: draft({ baseUrl: 'HTTPS://Daemon.Example.com/' }),
        saved: endpoint(),
      }),
    ).toEqual({ token: null, connection: null })
  })
})

describe('describeExecutionHostEndpointRemoval', () => {
  it('is free only when the count is known to be zero', () => {
    expect(
      describeExecutionHostEndpointRemoval({
        label: 'kuba-vps',
        sessionCount: 0,
      }),
    ).toBeNull()
  })

  it('says how many sessions a removal strands', () => {
    expect(
      describeExecutionHostEndpointRemoval({
        label: 'kuba-vps',
        sessionCount: 1,
      }),
    ).toMatch(/^1 session runs on “kuba-vps”\./)
    expect(
      describeExecutionHostEndpointRemoval({
        label: 'kuba-vps',
        sessionCount: 4,
      }),
    ).toMatch(/^4 sessions run on “kuba-vps”\./)
  })

  // An unknown count is a cost, not an absence of one: reporting "no sessions"
  // because the count failed is exactly the lie this era exists to prevent.
  it('warns rather than going quiet when the count is unknown', () => {
    expect(
      describeExecutionHostEndpointRemoval({
        label: '',
        sessionCount: null,
      }),
    ).toMatch(/could not count the sessions that run on “Unnamed endpoint”/)
  })
})
