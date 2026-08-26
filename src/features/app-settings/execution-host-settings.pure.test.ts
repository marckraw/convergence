import { describe, expect, it } from 'vitest'
import type { ExecutionHostEndpoint } from '@/entities/execution-host'
import {
  describeExecutionHostEndpointActionBlocks,
  describeExecutionHostEndpointRemoval,
  describeExecutionHostEndpointRemovalBlock,
  executionHostEndpointDrafts,
  executionHostSessionCounts,
  getExecutionHostEndpointBaseUrlError,
  getExecutionHostRemoteBaseUrlError,
  hasExecutionHostEndpointErrors,
  describeOrphanedExecutionHostEnvironmentOverride,
  nextExecutionHostEndpointId,
  normalizeExecutionHostBaseUrl,
  visibleExecutionHostConnectionResult,
  type CountedExecutionHostSessions,
  type ExecutionHostEndpointDraft,
} from './execution-host-settings.pure'
import type { RemoteExecutionHostConnectionResult } from '@/entities/app-settings'

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
  /**
   * The trimming here is deliberate and stays (MAR-2642).
   *
   * The IPC boundary refuses an endpoint id rather than trimming it, and this
   * is not the same rule read differently. An id is a Keychain account, an IPC
   * argument is machine-supplied, and repairing one silently answers a request
   * that named a different machine — so it is refused by name in
   * `electron/main/execution-host-credentials.ipc.test.ts`. A base URL is typed
   * by a person who is standing right there and sees the field, and a paste
   * that carries a trailing space is their intent, not a different daemon.
   */
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
  it('mints a fresh id, never sharing a Keychain account', () => {
    expect(nextExecutionHostEndpointId([draft()], () => 'minted')).toBe(
      'minted',
    )
  })

  /**
   * The hole this closed. `'default'` used to be claimed by whichever row asked
   * while no row held it — but "not currently taken" is not "never used". Remove
   * the Endpoint that owned it and the very next Add inherited its identity: its
   * Keychain account, its `CONVERGENCE_EXECUTION_HOST_DAEMON_TOKEN`, and every
   * session that recorded it.
   */
  it("never hands out 'default', not even when no row holds it", () => {
    expect(nextExecutionHostEndpointId([], () => 'minted')).toBe('minted')
  })

  it("never hands out 'default' after the endpoint that had it is removed", () => {
    const afterRemovingDefault: ExecutionHostEndpointDraft[] = []
    expect(
      nextExecutionHostEndpointId(afterRemovingDefault, () => 'minted'),
    ).not.toBe('default')
  })

  it('keeps minting until the id is free', () => {
    const ids = ['taken', 'free']
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
  function counted(
    byEndpointId: Record<string, number>,
  ): CountedExecutionHostSessions {
    return executionHostSessionCounts(
      Object.entries(byEndpointId).map(([executionHostId, sessions]) => ({
        executionHostId,
        sessions,
      })),
    )
  }

  it('is free only when the count arrived and said zero', () => {
    expect(
      describeExecutionHostEndpointRemoval({
        label: 'kuba-vps',
        endpointId: 'kuba',
        counts: counted({ kuba: 0 }),
      }),
    ).toBeNull()
  })

  it('says how many sessions a removal strands', () => {
    expect(
      describeExecutionHostEndpointRemoval({
        label: 'kuba-vps',
        endpointId: 'kuba',
        counts: counted({ kuba: 1 }),
      }),
    ).toMatch(/^1 session runs on “kuba-vps”\./)
    expect(
      describeExecutionHostEndpointRemoval({
        label: 'kuba-vps',
        endpointId: 'kuba',
        counts: counted({ kuba: 4, other: 9 }),
      }),
    ).toMatch(/^4 sessions run on “kuba-vps”\./)
  })

  // An unknown count is a cost, not an absence of one: reporting "no sessions"
  // because the count failed is exactly the lie this era exists to prevent.
  it('warns rather than going quiet when the count failed', () => {
    expect(
      describeExecutionHostEndpointRemoval({
        label: '',
        endpointId: 'kuba',
        counts: { status: 'failed' },
      }),
    ).toMatch(/could not count the sessions that run on “Unnamed endpoint”/)
  })

  /**
   * Endpoint ids are the user's own, and these three are the ones a bare
   * object gets wrong: `counts['toString']` answers with an inherited function
   * rather than a missing count, and `counts['__proto__'] = n` goes to the
   * prototype setter and is dropped. The third prototype-pollution bug in this
   * codebase, so the storage is a Map rather than the symptom being patched.
   */
  it('counts endpoints named after Object.prototype members', () => {
    // Built from pairs, not an object literal: `{ __proto__: 3 }` sets the
    // prototype instead of a key, so a fixture written that way would test
    // nothing and pass.
    const counts = executionHostSessionCounts([
      { executionHostId: 'toString', sessions: 2 },
      { executionHostId: '__proto__', sessions: 3 },
      { executionHostId: 'constructor', sessions: 4 },
    ])
    expect(
      describeExecutionHostEndpointRemoval({
        label: 'toString',
        endpointId: 'toString',
        counts,
      }),
    ).toMatch(/^2 sessions run on “toString”\./)
    expect(
      describeExecutionHostEndpointRemoval({
        label: 'proto',
        endpointId: '__proto__',
        counts,
      }),
    ).toMatch(/^3 sessions run on “proto”\./)
    expect(
      describeExecutionHostEndpointRemoval({
        label: 'constructor',
        endpointId: 'constructor',
        counts,
      }),
    ).toMatch(/^4 sessions run on “constructor”\./)
  })

  it('reports an endpoint the count never mentioned as free', () => {
    expect(
      describeExecutionHostEndpointRemoval({
        label: 'kuba-vps',
        endpointId: 'kuba',
        counts: counted({ local: 12 }),
      }),
    ).toBeNull()
  })
})

describe('describeExecutionHostEndpointRemovalBlock', () => {
  // A removal is priced by a count. Before the count lands there is no price,
  // and "no price yet" must not be spent as "free" — that is the stale-zero
  // hole, and it is why Remove waits rather than guessing.
  it('holds Remove while the count is still in flight', () => {
    expect(
      describeExecutionHostEndpointRemovalBlock({
        label: 'kuba-vps',
        counts: { status: 'counting' },
      }),
    ).toMatch(/Still counting the sessions that run on “kuba-vps”/)
  })

  // A failed count will not arrive by waiting, and blocking forever would make
  // the Endpoint unremovable. That one is a warning to acknowledge instead.
  it('does not hold Remove when the count failed, only when it is pending', () => {
    expect(
      describeExecutionHostEndpointRemovalBlock({
        label: 'kuba-vps',
        counts: { status: 'failed' },
      }),
    ).toBeNull()
    expect(
      describeExecutionHostEndpointRemovalBlock({
        label: 'kuba-vps',
        counts: executionHostSessionCounts([]),
      }),
    ).toBeNull()
  })
})

describe('visibleExecutionHostConnectionResult', () => {
  const result: RemoteExecutionHostConnectionResult = {
    ok: true,
    state: 'connected',
    baseUrl: 'https://daemon.example.com',
    message: 'Connected. 2 providers available.',
    providers: [],
    daemon: null,
  }

  it('shows the answer while it is still about the address and the token that dialled', () => {
    expect(
      visibleExecutionHostConnectionResult({
        attempt: {
          baseUrl: 'https://daemon.example.com',
          tokenGeneration: 2,
          result,
        },
        baseUrl: 'https://daemon.example.com/',
        tokenGeneration: 2,
      }),
    ).toBe(result)
  })

  // The era's own constraint, inside its own settings panel: a green
  // "Connected" under an address that was retyped is a claim about a machine
  // nobody tested.
  it('hides the answer the moment the address it describes changes', () => {
    expect(
      visibleExecutionHostConnectionResult({
        attempt: {
          baseUrl: 'https://daemon.example.com',
          tokenGeneration: 0,
          result,
        },
        baseUrl: 'https://moved.example.com',
        tokenGeneration: 0,
      }),
    ).toBeNull()
  })

  /**
   * The same staleness in the other dimension. A test authenticates with one
   * token, so a token that has since been replaced or removed leaves the answer
   * describing a handshake nothing would repeat — the address is only half of
   * what an answer is about.
   */
  it('hides the answer the moment the token that dialled is replaced', () => {
    expect(
      visibleExecutionHostConnectionResult({
        attempt: {
          baseUrl: 'https://daemon.example.com',
          tokenGeneration: 0,
          result,
        },
        baseUrl: 'https://daemon.example.com',
        tokenGeneration: 1,
      }),
    ).toBeNull()
  })

  // A result that lands after the token changed is stale on arrival, which is
  // the same comparison rather than a second rule about timing.
  it('hides an answer that arrives after the token it used was replaced', () => {
    const arrivedLate = {
      baseUrl: 'https://daemon.example.com',
      tokenGeneration: 3,
      result,
    }
    expect(
      visibleExecutionHostConnectionResult({
        attempt: arrivedLate,
        baseUrl: 'https://daemon.example.com',
        tokenGeneration: 4,
      }),
    ).toBeNull()
  })

  it('hides it while the address is unfinished rather than matching null to null', () => {
    expect(
      visibleExecutionHostConnectionResult({
        attempt: { baseUrl: null, tokenGeneration: 0, result },
        baseUrl: 'not a url',
        tokenGeneration: 0,
      }),
    ).toBeNull()
  })

  it('has nothing to show before a test has run', () => {
    expect(
      visibleExecutionHostConnectionResult({
        attempt: null,
        baseUrl: 'https://daemon.example.com',
        tokenGeneration: 0,
      }),
    ).toBeNull()
  })
})

describe('describeOrphanedExecutionHostEnvironmentOverride', () => {
  const OVERRIDE = {
    configured: true,
    envKey: 'CONVERGENCE_EXECUTION_HOST_DAEMON_TOKEN',
    endpointId: 'default',
  }

  it('says nothing when the variable is not set', () => {
    expect(
      describeOrphanedExecutionHostEnvironmentOverride({
        override: { ...OVERRIDE, configured: false },
        savedEndpoints: [],
      }),
    ).toBeNull()
    // Nor before Convergence has managed to ask.
    expect(
      describeOrphanedExecutionHostEnvironmentOverride({
        override: null,
        savedEndpoints: [],
      }),
    ).toBeNull()
  })

  it('says nothing while the endpoint it serves still exists', () => {
    expect(
      describeOrphanedExecutionHostEnvironmentOverride({
        override: OVERRIDE,
        savedEndpoints: [endpoint({ id: 'default' })],
      }),
    ).toBeNull()
  })

  /**
   * The visible consequence of "Add always mints" (MAR-2642). Refusing to hand
   * `'default'` to a new machine is right — it would inherit the override's
   * credential along with the id — but it leaves the override set, serving an
   * Endpoint that no longer exists, doing nothing. A dead credential nobody
   * mentions is exactly the invisible state this era exists to stop.
   */
  it('says so plainly when nothing carries the id it serves', () => {
    const message = describeOrphanedExecutionHostEnvironmentOverride({
      override: OVERRIDE,
      savedEndpoints: [endpoint({ id: 'kuba' })],
    })

    expect(message).toContain('CONVERGENCE_EXECUTION_HOST_DAEMON_TOKEN')
    expect(message).toContain('default')
    expect(message).toContain('authenticates nothing')
  })

  it('says so on a machine that has no endpoints at all', () => {
    expect(
      describeOrphanedExecutionHostEnvironmentOverride({
        override: OVERRIDE,
        savedEndpoints: [],
      }),
    ).toContain('authenticates nothing')
  })
})
