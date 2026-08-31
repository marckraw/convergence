import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EXECUTION_HOST_ENDPOINT_ID,
  describeMissingExecutionHostEndpoint,
  isExecutionHostEndpointId,
  isLocalExecutionHost,
  isRemoteExecutionHost,
  normalizeExecutionHostBaseUrl,
  normalizeExecutionHostEndpoints,
  parseExecutionHostId,
  removedExecutionHostEndpointIds,
  requireExecutionHostEndpointId,
} from './execution-host-endpoint.pure'

/**
 * Ids that must never reach `security` (MAR-2642).
 *
 * The Keychain account for an Endpoint is its id, and it travels inside a
 * command `security -i` reads a line at a time. The first of these is the one
 * that matters most: a newline is a second keychain command, aimed at whatever
 * the rest of the line says. The others are quieter — an id with a space or a
 * quote in it names a different account than the one the session recorded, and
 * the sweep's listing cannot even see a quoted account to collect it.
 */
const HOSTILE_ENDPOINT_IDS = [
  'kuba\ndelete-generic-password -a default -s convergence.execution-host-daemon',
  'kuba vps',
  'kuba"vps',
  'kuba\\vps',
  "kuba'vps",
  'kuba\tvps',
  'kuba;vps',
  'kuba/vps',
  'kuba.vps',
  '',
  'k'.repeat(65),
]

describe('execution host ids', () => {
  it('treats only "local" as this machine', () => {
    expect(isLocalExecutionHost('local')).toBe(true)
    expect(isLocalExecutionHost('default')).toBe(false)
    expect(isLocalExecutionHost('legacy-remote')).toBe(false)
    // The word that used to mean "the daemon" is now just another id, and it
    // resolves to nothing (MAR-2620).
    expect(isLocalExecutionHost('remote')).toBe(false)
  })

  it('is exactly the negation, so no third state can appear', () => {
    for (const id of ['local', 'default', 'remote', '', null, undefined]) {
      expect(isRemoteExecutionHost(id)).toBe(!isLocalExecutionHost(id))
    }
  })

  it('reads an absent or blank host as local', () => {
    // Every row written before execution hosts existed meant this machine.
    expect(parseExecutionHostId(null)).toBe('local')
    expect(parseExecutionHostId(undefined)).toBe('local')
    expect(parseExecutionHostId('   ')).toBe('local')
    expect(parseExecutionHostId(' daemon-a ')).toBe('daemon-a')
  })

  it('names the endpoint that went missing', () => {
    // The id has to be in the message: "not configured" alone would leave the
    // user guessing which of their machines the session meant.
    expect(describeMissingExecutionHostEndpoint('daemon-b')).toContain(
      '"daemon-b"',
    )
  })
})

describe('normalizeExecutionHostBaseUrl', () => {
  it('strips trailing slashes and rejects non-HTTP schemes', () => {
    expect(normalizeExecutionHostBaseUrl('https://daemon.test/')).toBe(
      'https://daemon.test',
    )
    expect(normalizeExecutionHostBaseUrl('  http://daemon.test  ')).toBe(
      'http://daemon.test',
    )
    expect(normalizeExecutionHostBaseUrl('ftp://daemon.test')).toBeNull()
    expect(normalizeExecutionHostBaseUrl('not a url')).toBeNull()
    expect(normalizeExecutionHostBaseUrl('')).toBeNull()
    expect(normalizeExecutionHostBaseUrl(null)).toBeNull()
  })

  // The two canaries below guard the line `daemonConfigurationFingerprint`
  // rests on (MAR-2689 round 10). That fingerprint joins the base URL and the
  // token with a NUL, and only the FIRST half has to be NUL-free for the join
  // to stay injective — the token's bytes are never inspected (MAR-2642 stores
  // them as hex so that anything a daemon issues, past `setToken`'s trim and
  // empty-value refusal, stays storable). The base URL is NUL-free because this
  // normalizer returns the WHATWG parser's serialization rather than the text
  // it was handed, so the guarantee lives here and nowhere else.
  it('serializes a NUL in the path, so a stored base URL never carries one', () => {
    // Mutation: `return trimmed` instead of `parsed.href.replace(...)` — the
    // parser still validates, but its serialization is thrown away and the raw
    // NUL survives into storage → red on the first assert.
    const normalized = normalizeExecutionHostBaseUrl(
      'https://daemon.test/x\u0000y',
    )

    expect(normalized).toBe('https://daemon.test/x%00y')
    expect(normalized?.includes('\u0000')).toBe(false)
  })

  it('refuses a host that carries a NUL rather than storing it', () => {
    // Mutation: `catch { return trimmed }` instead of `catch { return null }`
    // — the parser's refusal is swallowed and the raw NUL is stored → red.
    expect(
      normalizeExecutionHostBaseUrl('https://dae\u0000mon.test/'),
    ).toBeNull()
  })
})

describe('normalizeExecutionHostEndpoints', () => {
  it('keeps the id it was given and names an unnamed endpoint', () => {
    expect(
      normalizeExecutionHostEndpoints([
        { id: 'kuba', baseUrl: 'https://daemon.test/' },
      ]),
    ).toEqual([
      {
        id: 'kuba',
        label: 'Remote daemon',
        baseUrl: 'https://daemon.test',
        position: 0,
      },
    ])
  })

  /**
   * A blank id used to fall back to `'default'` (MAR-2642). That is not a spare
   * id: it is the one the single-host era's sessions recorded and the Keychain
   * account its token is filed under, so filling it in hands a machine that
   * never had it both. Refusing makes the wrong form unavailable rather than
   * making the fallback smarter.
   */
  it('refuses an endpoint that carries no id of its own', () => {
    expect(() =>
      normalizeExecutionHostEndpoints([
        { id: '   ', baseUrl: 'https://daemon.test' },
      ]),
    ).toThrow(/must carry its own id/)
  })

  it('numbers positions by the order it was given', () => {
    expect(
      normalizeExecutionHostEndpoints([
        { id: 'a', baseUrl: 'https://a.test' },
        { id: 'b', baseUrl: 'https://b.test' },
      ]).map((endpoint) => [endpoint.id, endpoint.position]),
    ).toEqual([
      ['a', 0],
      ['b', 1],
    ])
  })

  it('rejects a base URL it cannot normalize instead of dropping the endpoint', () => {
    // Silently storing zero endpoints would tell the user their daemon is
    // simply unconfigured, when what actually happened is that they typoed.
    expect(() =>
      normalizeExecutionHostEndpoints([
        { id: 'kuba', baseUrl: 'ftp://daemon.test' },
      ]),
    ).toThrow('Remote execution host base URL must be an HTTP(S) URL.')
  })

  it('refuses to let an endpoint call itself local', () => {
    expect(() =>
      normalizeExecutionHostEndpoints([
        { id: 'local', baseUrl: 'https://daemon.test' },
      ]),
    ).toThrow(/cannot be an execution host endpoint/)
  })

  it('refuses duplicate ids, because a session must resolve to one machine', () => {
    expect(() =>
      normalizeExecutionHostEndpoints([
        { id: 'a', baseUrl: 'https://a.test' },
        { id: 'a', baseUrl: 'https://b.test' },
      ]),
    ).toThrow('Duplicate execution host endpoint id: a')
  })
})

describe('removedExecutionHostEndpointIds', () => {
  const stored = [{ id: 'kuba' }, { id: 'backpack' }]

  it('names the endpoints a save drops and no others', () => {
    expect(
      removedExecutionHostEndpointIds(stored, [
        { id: 'backpack', baseUrl: 'https://backpack.test' },
      ]),
    ).toEqual(['kuba'])
  })

  // An edit keeps the id, so it keeps the Keychain account and the token.
  // Removal is the only gesture that destroys a credential.
  it('treats a relabelled, re-addressed endpoint as the same machine', () => {
    expect(
      removedExecutionHostEndpointIds(stored, [
        { id: 'kuba', label: 'kuba-box', baseUrl: 'https://moved.test' },
        { id: 'backpack', baseUrl: 'https://backpack.test' },
      ]),
    ).toEqual([])
  })

  it('names every endpoint when the save stores none', () => {
    expect(removedExecutionHostEndpointIds(stored, [])).toEqual([
      'kuba',
      'backpack',
    ])
  })

  /**
   * It asks the normalizer which ids survive rather than reading them off the
   * input, so a list that will not normalize throws here — before the caller
   * has destroyed anything. A save the user is about to see refused must not
   * have taken a token from a machine that is still there.
   */
  it('refuses a list that will not normalize rather than pricing it', () => {
    expect(() =>
      removedExecutionHostEndpointIds(stored, [
        { id: 'backpack', baseUrl: 'ftp://backpack.test' },
      ]),
    ).toThrow('Remote execution host base URL must be an HTTP(S) URL.')
  })
})

describe('an endpoint id, where one enters the system', () => {
  /**
   * The account is not a key in this database alone: `setToken` puts it inside
   * a command that `security -i` parses, and the parse is line-based. A
   * newline is therefore not a strange character in a name — it is the end of
   * one command and the start of another, run against the same keychain with
   * the same authority.
   */
  it('refuses an id that could start a second keychain command', () => {
    for (const id of HOSTILE_ENDPOINT_IDS) {
      expect(isExecutionHostEndpointId(id)).toBe(false)
      expect(() => requireExecutionHostEndpointId(id)).toThrow(/is not usable/)
    }
  })

  /** Named, so the machine being turned away can be identified. */
  it('says which id it refused', () => {
    expect(() => requireExecutionHostEndpointId('kuba\nrm')).toThrow(
      /"kuba\\nrm"/,
    )
  })

  /**
   * Never sanitised, and this is the case that shows why. ` kuba ` repaired to
   * `kuba` is not a tidier version of the same Endpoint: it is a different
   * Keychain account than the caller named, so the token would be filed where
   * nothing reads it while every session that recorded the original still
   * points at an id no row holds.
   */
  it('refuses an id it could have quietly trimmed into a different one', () => {
    expect(() => requireExecutionHostEndpointId(' kuba ')).toThrow()
    expect(() =>
      normalizeExecutionHostEndpoints([
        { id: ' kuba ', baseUrl: 'https://daemon.test' },
      ]),
    ).toThrow(/is not usable/)
  })

  it('still accepts every id this app actually mints', () => {
    // A minted UUID, the migrated id the single-host era's token is filed
    // under, and the shapes a hand-written endpoint could reasonably take.
    for (const id of [
      '0b7f4a5e-6c2d-4c1e-9a3f-0d5e8b1c2a34',
      DEFAULT_EXECUTION_HOST_ENDPOINT_ID,
      'kuba-vps',
      'backpack_automations',
      'A1',
      'k'.repeat(64),
    ]) {
      expect(isExecutionHostEndpointId(id)).toBe(true)
      expect(requireExecutionHostEndpointId(id)).toBe(id)
      expect(
        normalizeExecutionHostEndpoints([
          { id, baseUrl: 'https://daemon.test' },
        ])[0].id,
      ).toBe(id)
    }
  })

  it('refuses a hostile id at the settings save, not only at the wire', () => {
    expect(() =>
      normalizeExecutionHostEndpoints([
        { id: HOSTILE_ENDPOINT_IDS[0], baseUrl: 'https://daemon.test' },
      ]),
    ).toThrow(/is not usable/)
  })
})
