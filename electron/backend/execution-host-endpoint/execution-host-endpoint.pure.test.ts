import { describe, expect, it } from 'vitest'
import {
  describeMissingExecutionHostEndpoint,
  isLocalExecutionHost,
  isRemoteExecutionHost,
  normalizeExecutionHostBaseUrl,
  normalizeExecutionHostEndpoints,
  parseExecutionHostId,
} from './execution-host-endpoint.pure'

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
})

describe('normalizeExecutionHostEndpoints', () => {
  it('defaults the id and label of the endpoint the settings form edits', () => {
    expect(
      normalizeExecutionHostEndpoints([{ baseUrl: 'https://daemon.test/' }]),
    ).toEqual([
      {
        id: 'default',
        label: 'Remote daemon',
        baseUrl: 'https://daemon.test',
        position: 0,
      },
    ])
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
      normalizeExecutionHostEndpoints([{ baseUrl: 'ftp://daemon.test' }]),
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
