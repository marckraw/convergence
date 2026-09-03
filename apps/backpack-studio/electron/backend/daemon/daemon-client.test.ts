import { beforeEach, describe, expect, it } from 'vitest'
import { RemoteExecutionHostError } from '@convergence/execution-host-client'
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

/**
 * The reconnect loop's two failures, both of them about giving up (MAR-2770).
 *
 * Neither is reachable through the stub daemon: one needs a host that answers
 * 200 and closes without saying anything, the other needs the REAL backoff
 * timer rather than the injected one every other test uses. Both are written
 * by hand for exactly that reason.
 */
describe('DaemonClient.followSession, when the host will not serve', () => {
  const handlers = {
    onEnvelope: () => Promise.resolve(),
    onDroppedFrame: () => {},
  }

  /**
   * A host that opens the stream and closes it with nothing in it.
   *
   * The budget used to reset on a successful OPEN, so this loop never ended:
   * open, read nothing, wait a second, open again — forever, against a machine
   * plainly not serving this session. An attempt counts as having worked when
   * an envelope arrives, not when a socket does.
   *
   * Mutation: reset `attempt` after `openEventStream` succeeds and this never
   * rejects — the test times out instead of passing -> red.
   */
  it('spends its budget on streams that say nothing', async () => {
    let opens = 0
    // The escape hatch is the point: a budget that never runs out is an
    // infinite loop, and a canary that proves it by hanging proves it slowly
    // and in the wrong colour. The abort bounds the mutated code so it FAILS
    // this assertion rather than the suite's patience.
    const abort = new AbortController()
    const client = new DaemonClient({
      baseUrl: 'https://daemon.test',
      token: 'tok-secret',
      wait: () => Promise.resolve(),
      maxStreamAttempts: 3,
      fetchFn: (() => {
        opens += 1
        if (opens > 10) abort.abort()
        return Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                controller.close()
              },
            }),
            { status: 200 },
          ),
        )
      }) as unknown as typeof fetch,
    })

    await expect(
      client.followSession('c-1', 0, handlers, abort.signal),
    ).rejects.toBeInstanceOf(RemoteExecutionHostError)
    expect(opens).toBe(3)
  }, 5_000)

  /**
   * Quitting during a backoff must not wait for it. The cap is thirty seconds,
   * and shutdown waits for the writes each follow still owes — so an
   * unabortable wait held the whole app shut for up to half a minute.
   *
   * The REAL timer, deliberately: the injected `wait` every other test passes
   * resolves immediately, so it cannot tell an abortable wait from one that is
   * merely fast. The first backoff is one second; the abort lands well inside
   * it.
   *
   * Mutation: `await this.wait(reconnectDelayMs(attempt))` in place of
   * `waitForRetry` and this takes the full second -> red.
   */
  it('gives up its backoff the moment the caller aborts', async () => {
    const client = new DaemonClient({
      baseUrl: 'https://daemon.test',
      token: 'tok-secret',
      maxStreamAttempts: 5,
      fetchFn: (() =>
        Promise.reject(new Error('nothing is listening'))) as typeof fetch,
    })

    const abort = new AbortController()
    const started = Date.now()
    const following = client.followSession('c-1', 0, handlers, abort.signal)
    setTimeout(() => abort.abort(), 20)
    await following

    expect(Date.now() - started).toBeLessThan(800)
  }, 5_000)
})
