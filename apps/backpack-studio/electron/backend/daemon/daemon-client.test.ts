import { beforeEach, describe, expect, it } from 'vitest'
import {
  createStubDaemon,
  type StubDaemon,
} from '@convergence/execution-host-client'
import { DaemonClient } from './daemon-client'

/**
 * The handshake, against the package's stub daemon (MAR-2770).
 *
 * The stub serves the `/health` body captured verbatim from the machine Studio
 * is aimed at, so this is also the consumability canary MAR-2737 asked for, in
 * its strongest form: not a captured body read through the parser, but the real
 * two-probe handshake this app performs at launch, over the real wire shapes.
 */
let daemon: StubDaemon

const client = (): DaemonClient =>
  new DaemonClient({
    baseUrl: 'https://daemon.test',
    token: 'tok-secret',
    fetchFn: daemon.fetchFn,
    healthProbeTimeoutMs: 1_000,
  })

beforeEach(() => {
  daemon = createStubDaemon()
})

describe('DaemonClient.handshake', () => {
  it('reads the real daemon body through the client core', async () => {
    const handshake = await client().handshake()
    expect(handshake.status).toBe('connected')
    expect(handshake.daemonVersion).toBe('0.26.1')
    expect(handshake.apiVersion).toBe('v0')
    expect(Object.keys(handshake.providers).sort()).toEqual([
      'claude',
      'codex',
      'cursor',
      'gemini',
    ])
  })

  /**
   * `/health` is unauthenticated, so the token has no business being sent to
   * it. A credential offered where it is not required is a credential in one
   * more log than it needed to be.
   *
   * Mutation: add an `Authorization` header to the `/health` probe -> red.
   */
  it('does not offer the token to the unauthenticated route', async () => {
    await client().handshake()
    expect(daemon.healthRequests).toEqual([{ authorization: null }])
  })

  /**
   * The authenticated probe is the only call that says whether the token is any
   * good. A handshake that skipped it and reported `{ kind: 'ok' }` would claim
   * a credential works when nobody had asked it to.
   *
   * Mutation: pass `{ kind: 'ok' }` to `evaluateHandshake` instead of probing
   * -> red.
   */
  it('calls the daemon a refuser when it rejects the token', async () => {
    daemon.setMetaStatus(401)
    const handshake = await client().handshake()
    expect(handshake.status).toBe('unauthorized')
  })

  it('calls a daemon that answers nothing unreachable, and says why', async () => {
    daemon.setHealthBody(null)
    const handshake = await client().handshake()
    expect(handshake.status).toBe('unreachable')
    expect(handshake.detail).toContain('404')
  })

  /**
   * A proxy that swallows the route by hanging must not take the launch with
   * it: the probe is capped, and the cap reports unreachable rather than
   * never resolving.
   */
  it('gives up on a daemon that hangs', async () => {
    daemon.setHealthHangs(true)
    const handshake = await client().handshake()
    expect(handshake.status).toBe('unreachable')
  })
})
