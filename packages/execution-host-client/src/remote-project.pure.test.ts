import { describe, expect, it } from 'vitest'
import {
  advertisesRemoteProjects,
  decodeRemoteProjects,
  remoteProjectCatalogFromOutcome,
  remoteProjectsCapability,
  REMOTE_PROJECTS_CAPABILITY,
} from './remote-project.pure'
import type { EndpointHandshakeResult } from './execution-host-handshake.types'
import { DAEMON_HEALTH_FIXTURE_0_26_1 } from './execution-host-health.fixture'
import {
  evaluateHandshake,
  parseDaemonHealth,
} from './execution-host-handshake.pure'

function handshakeFrom(capabilities: string[]): EndpointHandshakeResult {
  return {
    status: 'connected',
    daemonVersion: null,
    daemonGitSha: null,
    daemonBuildTime: null,
    apiVersion: 'v0',
    uptimeSeconds: null,
    providers: {},
    providerReadiness: {},
    executionProtocolCapabilities: capabilities,
    sessionDirectorySearch: false,
    transcriptSearch: false,
    detail: null,
  }
}

describe('advertisesRemoteProjects', () => {
  it('reads projects.v1 out of the real daemon /health capture', () => {
    const health = parseDaemonHealth(JSON.parse(DAEMON_HEALTH_FIXTURE_0_26_1))
    expect(health).not.toBeNull()
    const handshake = evaluateHandshake(health!, null, { kind: 'ok' })
    expect(advertisesRemoteProjects(handshake)).toBe(true)
  })

  it('is false for a machine that advertises other capabilities', () => {
    expect(
      advertisesRemoteProjects(handshakeFrom(['rooms.v1', 'push.v1'])),
    ).toBe(false)
  })

  it('is false for a daemon that said nothing readable', () => {
    expect(advertisesRemoteProjects(null)).toBe(false)
  })

  it('names the capability the daemon actually advertises', () => {
    expect(REMOTE_PROJECTS_CAPABILITY).toBe('projects.v1')
  })
})

describe('remoteProjectsCapability', () => {
  // The difference `advertisesRemoteProjects` cannot carry, and the reason the
  // start door and the invalidation both ask for it: a machine that answered
  // and left `projects.v1` out has made a claim, and a machine that said
  // nothing readable has not (MAR-2689 round 5).
  //
  // Mutation: collapse `unknown` into `withheld` (return `'withheld'` for a
  // null handshake), and the null case goes red.
  it('separates a machine that withheld the capability from one that said nothing', () => {
    expect(remoteProjectsCapability(handshakeFrom(['rooms.v1']))).toBe(
      'withheld',
    )
    expect(remoteProjectsCapability(null)).toBe('unknown')
  })

  it('reads the real daemon capture as advertising', () => {
    const health = parseDaemonHealth(JSON.parse(DAEMON_HEALTH_FIXTURE_0_26_1))
    const handshake = evaluateHandshake(health!, null, { kind: 'ok' })
    expect(remoteProjectsCapability(handshake)).toBe('advertised')
  })
})

describe('decodeRemoteProjects', () => {
  function projectsOf(value: unknown) {
    const decoded = decodeRemoteProjects(value)
    expect(decoded.status).toBe('listing')
    return decoded.status === 'listing' ? decoded.projects : []
  }

  it('reads a listing wrapped in a projects key', () => {
    expect(
      projectsOf({
        projects: [
          {
            id: 'new-blok',
            name: 'new-blok',
            workingDirectory: '/srv/projects/new-blok',
            origin: 'https://github.com/marckraw/new-blok.git',
          },
        ],
      }),
    ).toEqual([
      {
        id: 'new-blok',
        name: 'new-blok',
        workingDirectory: '/srv/projects/new-blok',
        origin: 'https://github.com/marckraw/new-blok.git',
      },
    ])
  })

  it('reads a bare array listing', () => {
    expect(
      projectsOf([{ id: 'p1', name: 'One', workingDirectory: '/srv/one' }]),
    ).toEqual([
      { id: 'p1', name: 'One', workingDirectory: '/srv/one', origin: null },
    ])
  })

  it('carries no origin when the daemon does not report one yet', () => {
    const [project] = projectsOf([
      { id: 'p1', name: 'One', workingDirectory: '/srv/one' },
    ])
    expect(project?.origin).toBeNull()
  })

  it('keeps a project the daemon added an unknown field to', () => {
    expect(
      projectsOf([
        {
          id: 'p1',
          name: 'One',
          workingDirectory: '/srv/one',
          somethingNew: { nested: true },
        },
      ]),
    ).toHaveLength(1)
  })

  it('drops an entry with no id or no working directory', () => {
    expect(
      projectsOf([
        { name: 'no id', workingDirectory: '/srv/one' },
        { id: 'no-dir', name: 'no dir' },
        { id: '', name: 'blank id', workingDirectory: '/srv/two' },
        { id: 'ok', name: 'ok', workingDirectory: '/srv/three' },
      ]),
    ).toEqual([
      { id: 'ok', name: 'ok', workingDirectory: '/srv/three', origin: null },
    ])
  })

  it('falls back to the id when the daemon named nothing', () => {
    const [project] = projectsOf([{ id: 'p1', workingDirectory: '/srv/one' }])
    expect(project?.name).toBe('p1')
  })

  it('refuses a body that is not a listing, rather than calling it empty', () => {
    // The whole point of the discriminated result: `{error:"wrong version"}`
    // is not "this machine has no Projects". Mutation: return
    // `{ status: 'listing', projects: [] }` for a non-listing body, and every
    // row here goes red.
    for (const body of [null, 'nope', 42, { error: 'not found' }]) {
      const decoded = decodeRemoteProjects(body)
      expect(decoded.status).toBe('malformed')
      expect(
        decoded.status === 'malformed' ? decoded.reason : '',
      ).not.toHaveLength(0)
    }
  })

  it('still reads a listing that is merely empty', () => {
    // The other side of the same line: a machine that answered and has none
    // must not be reported as unreadable.
    expect(projectsOf({ projects: [] })).toEqual([])
    expect(projectsOf([])).toEqual([])
  })
})

describe('remoteProjectCatalogFromOutcome', () => {
  it('keeps the three outcomes three different answers', () => {
    // One mapping for all three, because they are three states of one fact and
    // an empty projects array is what every one of them looks like from the
    // outside. Spelled out at three exits, they drifted: an unreadable body
    // once left as "this machine has no Projects" (MAR-2689).
    //
    // Mutation: return the same `{ supported: false }` shell for any outcome,
    // and every row here goes red.
    expect(remoteProjectCatalogFromOutcome({ kind: 'unsupported' })).toEqual({
      supported: false,
      projects: [],
      unreachableReason: null,
    })
    expect(
      remoteProjectCatalogFromOutcome({
        kind: 'listed',
        projects: [
          { id: 'a', name: 'a', workingDirectory: '/srv/a', origin: null },
        ],
      }),
    ).toEqual({
      supported: true,
      projects: [
        { id: 'a', name: 'a', workingDirectory: '/srv/a', origin: null },
      ],
      unreachableReason: null,
    })
    expect(
      remoteProjectCatalogFromOutcome({ kind: 'failed', reason: 'no answer' }),
    ).toEqual({
      supported: true,
      projects: [],
      unreachableReason: 'no answer',
    })
  })

  it('never reports a failure as a machine without Projects', () => {
    // The line the strip reads. `supported: false` is a claim about the
    // machine; a read that failed disproved no capability, and reporting one as
    // the other states an absence the daemon never claimed.
    //
    // Mutation: map `failed` to `supported: false`, and this goes red.
    const failed = remoteProjectCatalogFromOutcome({
      kind: 'failed',
      reason: 'its Projects listing was not a list of Projects.',
    })
    expect(failed.supported).toBe(true)
    expect(failed.unreachableReason).not.toBeNull()
  })
})
