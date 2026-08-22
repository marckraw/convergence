import { describe, expect, it } from 'vitest'
import {
  evaluateHandshake,
  parseDaemonHealth,
} from './execution-host-handshake.pure'
import {
  DAEMON_HEALTH_FIXTURE_0_26_1,
  DAEMON_HEALTH_FIXTURE_GIT_SHA,
  DAEMON_HEALTH_FIXTURE_VERSION,
  daemonHealthFixtureWithoutDescriptor,
} from './execution-host-health.fixture'

function healthBody(overrides: Record<string, unknown>): unknown {
  return {
    ...(JSON.parse(DAEMON_HEALTH_FIXTURE_0_26_1) as Record<string, unknown>),
    ...overrides,
  }
}

/**
 * These files are copies of Emergence's handshake, not a dependency, so they
 * get their own proof here rather than inheriting one across repositories.
 * The fixture is the trace this slice was built against.
 */
describe('parseDaemonHealth', () => {
  it(`reads the verbatim /health of agents-daemon ${DAEMON_HEALTH_FIXTURE_VERSION}`, () => {
    const health = parseDaemonHealth(JSON.parse(DAEMON_HEALTH_FIXTURE_0_26_1))

    expect(health).not.toBeNull()
    expect(health?.version).toBe(DAEMON_HEALTH_FIXTURE_VERSION)
    expect(health?.gitSha).toBe(DAEMON_HEALTH_FIXTURE_GIT_SHA)
    expect(health?.apiVersion).toBe('v0')
    expect(health?.executionProtocolValid).toBe(true)
    expect(health?.executionProtocol?.version).toBe(1)
    expect(health?.executionProtocol?.capabilities).toHaveLength(17)
    expect(health?.providers).toEqual({
      claude: true,
      codex: true,
      cursor: false,
      gemini: false,
    })
    expect(health?.providerReadiness.claude).toEqual({
      installed: true,
      authenticated: true,
    })
  })

  it('refuses to read a body that is not a daemon', () => {
    expect(parseDaemonHealth({ providers: [] })).toBeNull()
    expect(parseDaemonHealth('ok')).toBeNull()
    expect(parseDaemonHealth(null)).toBeNull()
  })

  it('treats an absent executionProtocol as valid, an unreadable one as not', () => {
    const older = parseDaemonHealth(daemonHealthFixtureWithoutDescriptor())
    expect(older?.executionProtocolValid).toBe(true)
    expect(older?.executionProtocol).toBeNull()

    const newer = parseDaemonHealth(
      healthBody({ executionProtocol: { version: 2, capabilities: [] } }),
    )
    expect(newer?.executionProtocolValid).toBe(false)
  })
})

describe('evaluateHandshake', () => {
  const metaOk = { kind: 'ok' } as const

  it('reports the daemon version and its capabilities when everything lines up', () => {
    const result = evaluateHandshake(
      parseDaemonHealth(JSON.parse(DAEMON_HEALTH_FIXTURE_0_26_1)),
      null,
      metaOk,
    )

    expect(result.status).toBe('connected')
    expect(result.daemonVersion).toBe(DAEMON_HEALTH_FIXTURE_VERSION)
    expect(result.apiVersion).toBe('v0')
    expect(result.executionProtocolCapabilities).toContain('deltas.append.v1')
    expect(result.detail).toBeNull()
  })

  it('connects without capabilities when /health carries no descriptor', () => {
    const result = evaluateHandshake(
      parseDaemonHealth(daemonHealthFixtureWithoutDescriptor()),
      null,
      metaOk,
    )

    expect(result.status).toBe('connected')
    expect(result.daemonVersion).toBe(DAEMON_HEALTH_FIXTURE_VERSION)
    expect(result.executionProtocolCapabilities).toEqual([])
  })

  it('reports incompatible when the daemon speaks a protocol this build cannot read', () => {
    const result = evaluateHandshake(
      parseDaemonHealth(
        healthBody({ executionProtocol: { version: 2, capabilities: [] } }),
      ),
      null,
      metaOk,
    )

    expect(result.status).toBe('incompatible')
    // The version still comes through: an incompatible daemon must still be
    // identifiable, or there is nothing to act on.
    expect(result.daemonVersion).toBe(DAEMON_HEALTH_FIXTURE_VERSION)
  })

  it('reports incompatible for an API version outside the supported set', () => {
    expect(
      evaluateHandshake(
        parseDaemonHealth(healthBody({ apiVersion: 'v1' })),
        null,
        metaOk,
      ),
    ).toMatchObject({ status: 'incompatible' })
  })

  it('reports unreachable when there is no health at all', () => {
    expect(evaluateHandshake(null, 'connect ECONNREFUSED', metaOk)).toEqual({
      status: 'unreachable',
      daemonVersion: null,
      daemonGitSha: null,
      daemonBuildTime: null,
      apiVersion: null,
      uptimeSeconds: null,
      providers: {},
      providerReadiness: {},
      executionProtocolCapabilities: [],
      sessionDirectorySearch: false,
      transcriptSearch: false,
      detail: 'connect ECONNREFUSED',
    })
  })
})
