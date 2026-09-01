import { describe, expect, it } from 'vitest'
import {
  describeHandshakeStatus,
  readCapturedDaemonHandshake,
} from './hello-screen.pure'

describe('readCapturedDaemonHandshake', () => {
  /**
   * The consumability canary, as an assertion rather than a screenshot
   * (MAR-2737). It fails if the package stops being importable, if
   * `parseDaemonHealth` stops reading the captured body, or if the handshake
   * evaluator stops accepting an apiVersion this build supports.
   *
   * Mutation: point `parseDaemonHealth` at `{}` instead of the fixture and the
   * status falls to `unreachable`, turning both rows red.
   */
  it('reads the captured daemon through the client core', () => {
    const reading = readCapturedDaemonHandshake()
    expect(reading.headline).toBe('The captured daemon shook hands.')
    expect(reading.daemonVersion).toBe('0.26.1')
    expect(reading.apiVersion).toBe('v0')
    expect(reading.capabilities).toContain('projects.v1')
  })

  /** Sorted, so the list a reader compares between runs cannot reorder itself. */
  it('lists the capabilities in a stable order', () => {
    const { capabilities } = readCapturedDaemonHandshake()
    expect(capabilities).toEqual([...capabilities].sort())
  })
})

describe('describeHandshakeStatus', () => {
  /**
   * Every status gets its own sentence, and no failing status borrows the
   * connected one. Mutation: return the connected sentence for `incompatible`
   * and this goes red.
   */
  it('never reports a failure as a handshake', () => {
    const base = {
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
      detail: null,
    }
    const said = (['unauthorized', 'incompatible', 'unreachable'] as const).map(
      (status) => describeHandshakeStatus({ ...base, status }),
    )
    expect(said).toEqual([
      'The captured daemon refused the token.',
      'The captured daemon speaks a protocol this build cannot read.',
      'The captured daemon did not answer.',
    ])
    expect(said).not.toContain('The captured daemon shook hands.')
  })
})
