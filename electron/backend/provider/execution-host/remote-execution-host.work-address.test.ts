import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type Database from 'better-sqlite3'
import {
  executionHostRegistryFor,
  seedExecutionHostEndpoint,
  TEST_EXECUTION_HOST_ENDPOINT_ID,
} from '../../execution-host-endpoint/execution-host-endpoint.fixture'
import {
  closeDatabase,
  getDatabase,
  resetDatabase,
} from '../../database/database'
import { SessionService } from '../../session/session.service'
import { ProviderRegistry } from '../provider-registry'
import {
  createStubDaemon,
  type StubDaemon,
} from './execution-host-daemon.fixture'
import {
  DAEMON_HEALTH_FIXTURE_0_26_1,
  daemonHealthFixtureWithoutDescriptor,
} from './execution-host-health.fixture'
import { LocalExecutionHost } from './local-execution-host'
import { RemoteExecutionHost } from './remote-execution-host'
import { EXECUTION_HOST_NEVER_SENT_START_REQUEST_FIELDS } from './execution-host-wire-mapping.pure'
import type { SessionStartConfig } from '../provider.types'
import { makeSessionPreEraRemote } from '../../session/session-work-address.fixture'

const PROJECT_ID = 'project-work-address'

const REMOTE_PROJECTS = {
  projects: [
    {
      id: 'new-blok',
      name: 'new-blok',
      workingDirectory: '/srv/projects/new-blok',
      origin: 'https://github.com/marckraw/new-blok.git',
    },
  ],
}

/**
 * Where a remote session says it works, proved against the daemon's own wire
 * (MAR-2689).
 *
 * Deliberately end to end — a real `SessionService` over a real database,
 * starting on a real `RemoteExecutionHost` against the stub daemon — because
 * the claim is about the bytes that reach `POST /v0/execution/sessions`. The
 * daemon refuses a Project working directory and a target repository together
 * with an HTTP 400, so the only assertion worth making is on the body it
 * actually receives. A test that read the local start config, or a fixture of
 * the wire mapping, would pass on the exact shape that fails on the far side.
 */
describe('a remote start carries the place the session recorded', () => {
  let db: Database.Database
  let stub: StubDaemon
  let service: SessionService
  let host: RemoteExecutionHost
  let tempDir: string

  beforeEach(async () => {
    db = getDatabase()
    tempDir = mkdtempSync(join(tmpdir(), 'convergence-work-address-'))
    const repoPath = join(tempDir, 'repo')
    mkdirSync(repoPath)
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES (?, 'remote', ?)",
    ).run(PROJECT_ID, repoPath)
    seedExecutionHostEndpoint(db)

    stub = createStubDaemon()
    stub.setProjects(REMOTE_PROJECTS)
    service = new SessionService(
      db,
      new LocalExecutionHost(new ProviderRegistry()),
      join(tempDir, 'global-sessions'),
    )
    host = new RemoteExecutionHost({
      connection: {
        resolveConnection: async () => ({
          baseUrl: 'http://daemon.test',
          token: 'test-token',
        }),
      },
      fetch: stub.fetchFn,
      reconnect: { maxAttempts: 1, wait: async () => {} },
    })
    await host.refreshProviders()
    service.setRemoteExecutionHosts(
      executionHostRegistryFor({ [TEST_EXECUTION_HOST_ENDPOINT_ID]: host }),
    )
    service.setRemoteWorkspaceSourceResolver(() => ({
      repository: 'https://github.com/acme/legacy.git',
    }))
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  function createRemoteSession(
    workAddress: Parameters<typeof service.create>[0]['workAddress'],
  ): string {
    return service.create({
      projectId: PROJECT_ID,
      workspaceId: null,
      providerId: 'claude-code',
      model: 'sonnet',
      effort: null,
      name: 'remote session',
      executionHost: TEST_EXECUTION_HOST_ENDPOINT_ID,
      workAddress,
    }).id
  }

  /**
   * A row from before the column existed: remote, backfilled `unknown` by the
   * migration, and unreachable through `create` by design. Written straight to
   * the table for exactly that reason -- the service refuses to mint one, which
   * is the point of the test above.
   */
  function preEraRemoteSession(): string {
    const id = service.create({
      projectId: PROJECT_ID,
      workspaceId: null,
      providerId: 'claude-code',
      model: 'sonnet',
      effort: null,
      name: 'pre-era session',
    }).id
    makeSessionPreEraRemote(db, id, TEST_EXECUTION_HOST_ENDPOINT_ID)
    return id
  }

  function countSessions(): number {
    return (
      db.prepare('SELECT COUNT(*) AS count FROM sessions').get() as {
        count: number
      }
    ).count
  }

  function startBody(): {
    config: Record<string, unknown>
    workspace?: unknown
    automation?: unknown
  } {
    const body = stub.startRequests[0]
    expect(body).toBeDefined()
    return body as {
      config: Record<string, unknown>
      workspace?: unknown
      automation?: unknown
    }
  }

  it('sends the Project directory and no workspace in Project mode', async () => {
    const id = createRemoteSession({
      mode: 'project',
      projectId: 'new-blok',
      workingDirectory: '/srv/projects/new-blok',
      label: 'Project new-blok',
    })
    await service.start(id, { text: 'hello' })

    const body = startBody()
    expect(body.config.workingDirectory).toBe('/srv/projects/new-blok')
    expect('workspace' in body).toBe(false)
  })

  it('sends the repository and no working directory in Repository mode', async () => {
    const id = createRemoteSession({
      mode: 'repository',
      repository: 'https://github.com/marckraw/new-blok.git',
      label: 'marckraw/new-blok',
    })
    await service.start(id, { text: 'hello' })

    const body = startBody()
    expect(body.workspace).toEqual({
      repository: 'https://github.com/marckraw/new-blok.git',
    })
    expect('workingDirectory' in body.config).toBe(false)
  })

  it('sends the repository the strip stated, never the session project origin', async () => {
    const id = createRemoteSession({
      mode: 'repository',
      repository: 'https://github.com/marckraw/new-blok.git',
      label: 'marckraw/new-blok',
    })
    await service.start(id, { text: 'hello' })

    // The resolver in `beforeEach` answers with a *different* repository — the
    // silent derivation this slice replaces. A start that fell back to it would
    // clone the project the session was born in, which is the incident.
    expect(startBody().workspace).not.toEqual({
      repository: 'https://github.com/acme/legacy.git',
    })
  })

  it('falls back to the project origin only for a row that recorded no place', async () => {
    const id = preEraRemoteSession()
    await service.start(id, { text: 'hello' })

    expect(startBody().workspace).toEqual({
      repository: 'https://github.com/acme/legacy.git',
    })
  })

  it('builds no automation block on any remote start', async () => {
    const id = createRemoteSession({
      mode: 'repository',
      repository: 'https://github.com/marckraw/new-blok.git',
      label: 'marckraw/new-blok',
    })
    await service.start(id, { text: 'hello' })

    const body = startBody() as unknown as Record<string, unknown>
    for (const field of EXECUTION_HOST_NEVER_SENT_START_REQUEST_FIELDS) {
      expect(Object.hasOwn(body, field)).toBe(false)
    }
  })

  it('records the place a session was born with', () => {
    const id = createRemoteSession({
      mode: 'project',
      projectId: 'new-blok',
      workingDirectory: '/srv/projects/new-blok',
      label: 'Project new-blok',
    })
    expect(service.getById(id)?.workAddress).toEqual({
      mode: 'project',
      projectId: 'new-blok',
      workingDirectory: '/srv/projects/new-blok',
      label: 'Project new-blok',
    })
  })

  it('refuses to be born on a daemon without a place, rather than guessing one', () => {
    // The innermost of the three doors. `?? UNKNOWN_WORK_ADDRESS` here is what
    // let a session start with no place and fall through to the legacy
    // derivation above -- which is how a daemon came to clone Convergence
    // itself (MAR-2689).
    //
    // Mutation: restore `input.workAddress ?? UNKNOWN_WORK_ADDRESS` at create,
    // and both rows go red.
    const before = countSessions()
    expect(() => createRemoteSession(undefined)).toThrow(/where it works/)
    // `unknown` is refused as firmly as absence: it belongs to rows the
    // migration backfilled and nothing in this app may mint one.
    expect(() => createRemoteSession({ mode: 'unknown' })).toThrow(
      /where it works/,
    )
    expect(countSessions()).toBe(before)
  })

  it('refuses a place stated with nothing in it, and leaves no row', () => {
    // The same question the decoder asks, through the same predicate. A typed
    // caller reaches `create` without passing the IPC door at all, so a blank
    // clone URL, a blank daemon directory or a blank label would otherwise be
    // born here: a remote row that names nowhere and shows nothing on the strip
    // (MAR-2689 round 2).
    //
    // Mutation: let `namesAConcreteWorkPlace` accept any string again, and
    // every row here goes red -- together with the decoder's.
    const before = countSessions()
    for (const address of [
      { mode: 'repository' as const, repository: '', label: 'marckraw/repo' },
      { mode: 'repository' as const, repository: '  ', label: 'marckraw/repo' },
      {
        mode: 'repository' as const,
        repository: 'https://github.com/marckraw/new-blok.git',
        label: ' ',
      },
      {
        mode: 'project' as const,
        projectId: '',
        workingDirectory: '/srv/projects/new-blok',
        label: 'Project new-blok',
      },
      {
        mode: 'project' as const,
        projectId: 'new-blok',
        workingDirectory: '',
        label: 'Project new-blok',
      },
      {
        mode: 'project' as const,
        projectId: 'new-blok',
        workingDirectory: '/srv/projects/new-blok',
        label: '\t',
      },
    ]) {
      expect(() => createRemoteSession(address)).toThrow(/where it works/)
    }
    expect(countSessions()).toBe(before)
  })

  it('records nothing for a local session', () => {
    const id = service.create({
      projectId: PROJECT_ID,
      workspaceId: null,
      providerId: 'claude-code',
      model: 'sonnet',
      effort: null,
      name: 'local session',
    }).id
    expect(service.getById(id)?.workAddress).toBeNull()
  })

  it('refuses a Project the machine no longer lists, naming it', async () => {
    // The machine answers about its Projects first -- the refusal is only
    // allowed once this host has heard from the configuration in force.
    await host.describeProjectCatalog()

    const id = createRemoteSession({
      mode: 'project',
      projectId: 'retired',
      workingDirectory: '/srv/projects/retired',
      label: 'Project retired',
    })

    await expect(service.start(id, { text: 'hello' })).rejects.toThrow(
      /\/srv\/projects\/retired/,
    )
    expect(stub.startRequests).toHaveLength(0)
  })

  it('does not refuse a Project when the machine has not been asked', async () => {
    const id = createRemoteSession({
      mode: 'project',
      projectId: 'unheard-of',
      workingDirectory: '/srv/projects/unheard-of',
      label: 'Project unheard-of',
    })
    await service.start(id, { text: 'hello' })

    // Unknown is never reported as gone: the daemon stays the final authority
    // for a listing this host never read.
    expect(startBody().config.workingDirectory).toBe('/srv/projects/unheard-of')
  })
})

describe('describeProjectCatalog', () => {
  let stub: StubDaemon
  let host: RemoteExecutionHost

  function buildHost(): RemoteExecutionHost {
    return new RemoteExecutionHost({
      connection: {
        resolveConnection: async () => ({
          baseUrl: 'http://daemon.test',
          token: 'test-token',
        }),
      },
      fetch: stub.fetchFn,
      reconnect: { maxAttempts: 1, wait: async () => {} },
    })
  }

  beforeEach(() => {
    stub = createStubDaemon()
    stub.setProjects(REMOTE_PROJECTS)
    host = buildHost()
  })

  it('lists the Projects of a machine that advertises projects.v1', async () => {
    await expect(host.describeProjectCatalog()).resolves.toEqual({
      supported: true,
      projects: [
        {
          id: 'new-blok',
          name: 'new-blok',
          workingDirectory: '/srv/projects/new-blok',
          origin: 'https://github.com/marckraw/new-blok.git',
        },
      ],
      unreachableReason: null,
    })
  })

  it('asks nothing of a machine that does not advertise projects.v1', async () => {
    stub.setHealthBody(
      JSON.stringify({
        ...daemonHealthFixtureWithoutDescriptor(),
      }),
    )
    const catalog = await buildHost().describeProjectCatalog()

    expect(catalog).toEqual({
      supported: false,
      projects: [],
      unreachableReason: null,
    })
    expect(stub.projectsRequests).toBe(0)
  })

  it('says why a machine that advertises Projects could not list them', async () => {
    stub.setProjectsStatus(503)
    const catalog = await host.describeProjectCatalog()

    expect(catalog.supported).toBe(true)
    expect(catalog.projects).toEqual([])
    expect(catalog.unreachableReason).not.toBeNull()
  })

  it('reports a machine that could not be reached at all', async () => {
    stub.setMetaStatus(500)
    const catalog = await buildHost().describeProjectCatalog()

    expect(catalog.projects).toEqual([])
    expect(catalog.unreachableReason).not.toBeNull()
  })

  it('says a machine answered unreadably rather than that it has none', async () => {
    // HTTP 200 with a body that is not a listing -- an older or mismatched
    // daemon. Reported as an empty listing, this told him the machine has no
    // Projects, which it never said (MAR-2689; the same class as "a dead daemon
    // must not look alive").
    //
    // Mutation: map a malformed body back to a successful empty listing in
    // `describeProjectCatalog`, and this goes red.
    stub.setProjects({ error: 'wrong version' })
    const catalog = await host.describeProjectCatalog()

    expect(catalog.supported).toBe(true)
    expect(catalog.projects).toEqual([])
    expect(catalog.unreachableReason).toContain('not a list of Projects')
  })

  it('lets a machine that answered with none be exactly that', async () => {
    // The other side of the line above: an empty listing is an answer, and must
    // not be dressed up as a failure.
    stub.setProjects({ projects: [] })
    await expect(host.describeProjectCatalog()).resolves.toEqual({
      supported: true,
      projects: [],
      unreachableReason: null,
    })
  })

  /** A start config that names a Project directory and no workspace. */
  function startInDirectory(workingDirectory: string): SessionStartConfig {
    return {
      sessionId: `session-${workingDirectory}`,
      workingDirectory,
      initialMessage: 'hello',
      model: 'sonnet',
      effort: null,
      continuationToken: null,
    }
  }

  it('never lets a slower Projects read overwrite a newer one', async () => {
    // Two reads of the same machine overlap and the OLDER one lands last.
    // StrictMode double-runs the effect in development and any Settings edit
    // makes it happen in anger; without a generation the stale list won, and a
    // start in a directory the machine does list was refused as "no longer
    // listed" (MAR-2689).
    //
    // Mutation: drop the `ifCurrent` guard around the Projects commit (write
    // `this.projectsOutcome` unconditionally), and this goes red.
    let releaseFirst: () => void = () => {}
    const firstLanded = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    stub.setProjectsResponder(async (call) => {
      if (call === 1) {
        await firstLanded
        return {
          projects: [{ id: 'old', name: 'old', workingDirectory: '/srv/old' }],
        }
      }
      return {
        projects: [{ id: 'new', name: 'new', workingDirectory: '/srv/new' }],
      }
    })

    const older = host.describeProjectCatalog()
    // The newer read lands first, in full.
    await host.describeProjectCatalog()
    releaseFirst()
    await older

    // The newer machine listing is the one in force, so its directory runs...
    expect(() => {
      host.start('claude', startInDirectory('/srv/new')).dispose?.()
    }).not.toThrow()
    // ...and the older answer's does not.
    expect(() => host.start('claude', startInDirectory('/srv/old'))).toThrow(
      /no longer lists/,
    )
  })

  it('never hands an overtaken Projects read its own answer back', async () => {
    // The commit and the return are one decision. `ifCurrent` kept the older
    // listing out of the cache and then the method handed that same listing to
    // its caller anyway -- and the renderer commits by *source*, not by request
    // order, so the older return landed last and the strip offered a Project
    // the cache no longer holds. `assertWorkPlaceRunnable` then refused what
    // the strip had just offered (MAR-2689 round 2).
    //
    // Two overlapping calls must be commits of the same value in any order,
    // which is what makes a renderer generation unnecessary.
    //
    // Mutation: return this attempt's own `outcome` unconditionally from
    // `commitProjectsOutcome`, and this goes red.
    let releaseFirst: () => void = () => {}
    const firstLanded = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    stub.setProjectsResponder(async (call) => {
      if (call === 1) {
        await firstLanded
        return {
          projects: [{ id: 'old', name: 'old', workingDirectory: '/srv/old' }],
        }
      }
      return {
        projects: [{ id: 'new', name: 'new', workingDirectory: '/srv/new' }],
      }
    })

    const older = host.describeProjectCatalog()
    const newer = await host.describeProjectCatalog()
    releaseFirst()
    const overtaken = await older

    expect(newer.projects.map((project) => project.id)).toEqual(['new'])
    expect(overtaken).toEqual(newer)
  })

  it('never lets an overtaken failure replace a newer answer', async () => {
    // The sibling case, and the one the malformed branch could not even reach:
    // it returned before the commit decision was taken. A daemon answering
    // `{"error":"wrong version"}` to the overtaken read turned a newer, good
    // listing into "this machine has no Projects, and here is why" -- a false
    // failure over an answer that had already landed (MAR-2689 round 2).
    //
    // Mutation: return this attempt's own `outcome` unconditionally from
    // `commitProjectsOutcome`, so the overtaken read reports its own failure
    // over a newer listing, and this goes red.
    let releaseFirst: () => void = () => {}
    const firstLanded = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    stub.setProjectsResponder(async (call) => {
      if (call === 1) {
        await firstLanded
        return { error: 'wrong version' }
      }
      return {
        projects: [{ id: 'new', name: 'new', workingDirectory: '/srv/new' }],
      }
    })

    const older = host.describeProjectCatalog()
    await host.describeProjectCatalog()
    releaseFirst()
    const overtaken = await older

    expect(overtaken.projects.map((project) => project.id)).toEqual(['new'])
    expect(overtaken.unreachableReason).toBeNull()
  })

  it('still says why it failed while nothing newer has answered', async () => {
    // The other half of the rule, and the one a blanket "an overtaken attempt
    // reports nothing" would break silently: the newer read is still on the
    // wire, so this failure is the freshest thing known about the machine.
    // Reported as an empty listing with no reason it would read as "this
    // machine has no Projects" -- the absence the daemon never claimed.
    //
    // Mutation: drop the own-outcome fallback in `commitProjectsOutcome` and
    // answer only with what the cache holds, and this goes red -- the overtaken
    // read committed nothing, so the slot would be handed an empty listing and
    // no reason at all.
    let releaseSecond: () => void = () => {}
    const secondMayAnswer = new Promise<void>((resolve) => {
      releaseSecond = resolve
    })
    let markSecondRequested: () => void = () => {}
    const secondIsOut = new Promise<void>((resolve) => {
      markSecondRequested = resolve
    })
    stub.setProjectsResponder(async (call) => {
      if (call === 1) {
        // Held until the newer read has opened its attempt, which is what makes
        // this one overtaken.
        await secondIsOut
        return { error: 'wrong version' }
      }
      markSecondRequested()
      await secondMayAnswer
      return { projects: [] }
    })

    const older = host.describeProjectCatalog()
    const newer = host.describeProjectCatalog()
    const overtaken = await older

    expect(overtaken.unreachableReason).toContain('not a list of Projects')

    releaseSecond()
    await newer
  })

  it('never lets a Projects read outlive the capability that allowed it', async () => {
    // The last exit that stood outside the beat. `supported: false` was
    // returned *above* the attempt, so a newer catalog reading a handshake that
    // no longer advertises Projects did not overtake an older `/v0/projects`
    // request. The renderer commits by source and not by request order, so that
    // older listing landed last -- offering Projects on a machine that had
    // stopped saying it has any (MAR-2689 round 3).
    //
    // Mutation: put the capability check back above `begin()`, returning
    // `{ supported: false, projects: [], unreachableReason }` from it, and this
    // goes red -- the overtaken read commits `/srv/old` and hands it back.
    let releaseAnswer: () => void = () => {}
    const answerReleased = new Promise<void>((resolve) => {
      releaseAnswer = resolve
    })
    let markRequested: () => void = () => {}
    const requestIsOut = new Promise<void>((resolve) => {
      markRequested = resolve
    })
    stub.setProjectsResponder(async () => {
      markRequested()
      await answerReleased
      return {
        projects: [{ id: 'old', name: 'old', workingDirectory: '/srv/old' }],
      }
    })

    const older = host.describeProjectCatalog()
    // Only once the older read is genuinely on the wire: it is the request the
    // no-capability answer has to overtake.
    await requestIsOut
    stub.setHealthBody(JSON.stringify(daemonHealthFixtureWithoutDescriptor()))
    await host.refreshProviders()
    const newer = await host.describeProjectCatalog()
    releaseAnswer()
    const overtaken = await older

    const unsupported = {
      supported: false,
      projects: [],
      unreachableReason: null,
    }
    // Both returns, so both renderer commits: the store writes exactly what it
    // is handed, and identical values cannot disagree in any order.
    expect(newer).toEqual(unsupported)
    expect(overtaken).toEqual(unsupported)
    // And the start door says the same thing, from the machine's own current
    // handshake: one that lists no Projects has no Project for a session to be
    // started in.
    expect(() => host.start('claude', startInDirectory('/srv/old'))).toThrow(
      /lists no Projects/,
    )
  })

  it('answers an overtaken failure with its own reason, never an older one', async () => {
    // Which attempt landed is a question about *order*, and a cached failure
    // read before that question is asked answers it wrong: an older reason,
    // still in force because nothing newer has landed, spoke over the reason
    // this read actually got. Null-coalescing cannot tell "a newer success
    // deliberately has no failure" from "nothing newer answered" -- only
    // comparing the attempt that landed with this one can (MAR-2689 round 3).
    //
    // Mutation: make a cached failure win before the attempt numbers are
    // compared (`landed?.outcome.kind === 'failed' ? landed.outcome : ...`),
    // and this goes red with the older 501.
    stub.setProjectsStatus(501)
    const seeded = await host.describeProjectCatalog()
    expect(seeded.unreachableReason).toContain('501')

    stub.setProjectsStatus(200)
    let releaseThird: () => void = () => {}
    const thirdMayAnswer = new Promise<void>((resolve) => {
      releaseThird = resolve
    })
    let markThirdRequested: () => void = () => {}
    const thirdIsOut = new Promise<void>((resolve) => {
      markThirdRequested = resolve
    })
    stub.setProjectsResponder(async (call) => {
      if (call === 2) {
        // Held until the third attempt has opened, which is what makes this
        // one overtaken -- and released before it, so nothing newer has landed.
        await thirdIsOut
        return { error: 'wrong version' }
      }
      markThirdRequested()
      await thirdMayAnswer
      return { projects: [] }
    })

    const second = host.describeProjectCatalog()
    const third = host.describeProjectCatalog()
    const overtaken = await second

    expect(overtaken.unreachableReason).toContain('not a list of Projects')
    expect(overtaken.unreachableReason).not.toContain('501')

    releaseThird()
    await third
  })

  it('never answers for a handshake the machine replaced under it', async () => {
    // The last fact the single-outcome shape did not name. A Projects outcome
    // is derived from *two* things: the Endpoint configuration, and the
    // handshake that advertised `projects.v1`. A provider refresh can withdraw
    // that capability at the same address without any Projects read opening,
    // so an answer read under the old handshake landed as a listing and
    // offered `/srv/old` on a machine that had since stopped saying it has any
    // Projects (MAR-2689 round 4). Both facts now ride with the answer, and
    // this attempt is measured against both (MAR-2689 round 7).
    //
    // No second Projects call, deliberately: round 3's canary made one, and
    // that call advanced the Projects generation by itself -- which is exactly
    // what hid the missing dependency. Nothing newer is behind this read, so
    // being the newest attempt is all it can prove, and being the newest is
    // not being true.
    //
    // Mutation: drop the capability from the provenance (`projectsInForce`
    // asks only `configurationInForce`), and this goes red twice over -- the
    // held read commits its listing, and hands its caller the listing it was
    // given.
    let releaseAnswer: () => void = () => {}
    const answerReleased = new Promise<void>((resolve) => {
      releaseAnswer = resolve
    })
    let markRequested: () => void = () => {}
    const requestIsOut = new Promise<void>((resolve) => {
      markRequested = resolve
    })
    stub.setProjectsResponder(async () => {
      markRequested()
      await answerReleased
      return {
        projects: [{ id: 'old', name: 'old', workingDirectory: '/srv/old' }],
      }
    })

    const older = host.describeProjectCatalog()
    // Only once the read is genuinely on the wire: it is the request the new
    // handshake has to overtake.
    await requestIsOut
    stub.setHealthBody(JSON.stringify(daemonHealthFixtureWithoutDescriptor()))
    await host.refreshProviders()
    releaseAnswer()
    const overtaken = await older

    // Not a listing. What it read is not known to be true of the machine that
    // is there now, and an empty list with no reason would read as "it has
    // none" -- the absence the daemon never claimed.
    expect(overtaken.projects).toEqual([])
    expect(overtaken.unreachableReason).not.toBeNull()
    // And the place it was holding is not runnable. The machine in force has
    // answered and does not do Projects at all, which is true whatever is or is
    // not on record -- the clause round 4 could not reach from the cache alone,
    // and round 5's door reaches it from the handshake (MAR-2689 round 5).
    //
    // Mutation: drop the door's `withheld` branch, leaving it to read only the
    // cached outcome, and this goes red -- the cache was cleared, so nothing
    // refuses.
    expect(() => host.start('claude', startInDirectory('/srv/old'))).toThrow(
      /lists no Projects/,
    )
  })

  it('still answers with what it read when a refresh changes nothing about Projects', async () => {
    // The other side of the line above, and the reason the epoch counts what
    // the machine *says* rather than how often a handshake lands. A composer
    // asks one machine for its providers and its Projects in the same beat, so
    // a refresh landing while `/v0/projects` is on the wire is the ordinary
    // case, not the strange one. Moving the epoch there would turn a machine
    // that answered perfectly well into one whose Projects "could not be read"
    // -- an outage invented out of a routine refresh, which is the same class
    // of lie as the one this era began with (MAR-2689 round 4).
    //
    // Mutation: move the capability epoch on every landed handshake instead of
    // only on one that changes what the machine says about Projects (drop the
    // early return in `observeProjectsCapability`), and this goes red -- the
    // read comes back unreadable and nothing is on record.
    let releaseAnswer: () => void = () => {}
    const answerReleased = new Promise<void>((resolve) => {
      releaseAnswer = resolve
    })
    let markRequested: () => void = () => {}
    const requestIsOut = new Promise<void>((resolve) => {
      markRequested = resolve
    })
    stub.setProjectsResponder(async () => {
      markRequested()
      await answerReleased
      return {
        projects: [{ id: 'old', name: 'old', workingDirectory: '/srv/old' }],
      }
    })

    const reading = host.describeProjectCatalog()
    await requestIsOut
    // The same machine, saying the same thing about Projects.
    await host.refreshProviders()
    releaseAnswer()
    const answer = await reading

    expect(answer.projects.map((project) => project.id)).toEqual(['old'])
    expect(answer.unreachableReason).toBeNull()
    // And on record: the place it listed runs, and one it did not list is
    // refused by name.
    expect(() => {
      host.start('claude', startInDirectory('/srv/old')).dispose?.()
    }).not.toThrow()
    expect(() => host.start('claude', startInDirectory('/srv/other'))).toThrow(
      /no longer lists/,
    )
  })

  it('never refuses a Project in the name of a handshake the machine replaced', async () => {
    // The other direction, and the one no Projects read is involved in at all.
    // A machine that did not advertise `projects.v1` is on record as listing no
    // Projects -- and after it gains the capability at the same address, that
    // cache went on refusing a Project the daemon now offers. Unknown reported
    // as gone, in the name of a handshake that no longer exists (MAR-2689
    // round 4).
    //
    // Two mechanisms hold this, and only one of them is reachable by a
    // mutation here: the door refuses on the handshake's `withheld` and never
    // on the record, so the record it might otherwise have reached is not what
    // keeps the second half honest. Mutation: drop the door's `withheld`
    // branch, and this goes red on the first refusal. Freezing the capability
    // epoch leaves this test green -- the canary that shows a frozen epoch is
    // `never refuses a Project in the name of a listing read before the
    // machine changed its mind`, below, where a listing on record is what the
    // door would reach.
    stub.setHealthBody(JSON.stringify(daemonHealthFixtureWithoutDescriptor()))
    await expect(host.describeProjectCatalog()).resolves.toEqual({
      supported: false,
      projects: [],
      unreachableReason: null,
    })
    // On record, and refusing while it stands -- which is right: that machine
    // said it has no Projects to hold a session.
    expect(() =>
      host.start('claude', startInDirectory('/srv/projects/new-blok')),
    ).toThrow(/lists no Projects/)

    // The same address, and now it does Projects.
    stub.setHealthBody(DAEMON_HEALTH_FIXTURE_0_26_1)
    await host.refreshProviders()

    expect(() => {
      host
        .start('claude', startInDirectory('/srv/projects/new-blok'))
        .dispose?.()
    }).not.toThrow()
    // Without a round trip: the handshake alone changed the answer, and a
    // refusal that needed one would refuse first and learn afterwards.
    expect(stub.projectsRequests).toBe(0)
  })

  it('never refuses a Project in the name of a listing read before the machine changed its mind', async () => {
    // Why the capability rides as an epoch and not as the answer itself, now
    // that the start door asks the handshake before it asks the cache. A
    // machine listed its Projects; it then stopped offering them and offered
    // them again at the same address. The listing on record was read before
    // that round trip and the machine has not been asked since, so a door that
    // could still reach it would refuse places in the name of a handshake two
    // replacements old (MAR-2689 round 5).
    //
    // Mutation: carry the capability itself rather than a count of its changes
    // (`projectsCapabilityEpoch` set to a fixed code per capability instead of
    // incremented), and this goes red -- the machine comes back to
    // `advertised`, the old provenance matches again, and `/srv/other` is
    // refused against a listing nobody would read again.
    await host.describeProjectCatalog()
    expect(() => host.start('claude', startInDirectory('/srv/other'))).toThrow(
      /no longer lists/,
    )

    // It stops offering Projects...
    stub.setHealthBody(JSON.stringify(daemonHealthFixtureWithoutDescriptor()))
    await host.refreshProviders()
    // ...and offers them again, at the same address.
    stub.setHealthBody(DAEMON_HEALTH_FIXTURE_0_26_1)
    await host.refreshProviders()

    expect(() => {
      host.start('claude', startInDirectory('/srv/other')).dispose?.()
    }).not.toThrow()
    // And nothing went to the wire to establish that: the handshake alone
    // dropped what the old one had authorised.
    expect(stub.projectsRequests).toBe(1)
  })

  it('never refuses the first Projects read of a machine the Endpoint moved to', async () => {
    // A read cannot be measured against a capability read before the listing
    // it is waiting on. Repoint an Endpoint from a daemon that does no
    // Projects to one that does, and the only handshake this host holds when
    // the read opens belongs to the machine it was moved away from -- B's own
    // arrives inside this very call. B answered perfectly well and the caller
    // was told its Projects could not be read (MAR-2689 round 5, and the same
    // shape again in round 7).
    //
    // Mutation: complete the provenance at `openAttempt` instead of at the
    // beat that authorises the read (drop the second capture after
    // `ensureListed`), and this goes red -- along with every other first read
    // of a machine, because before that listing the capability is `unknown`.
    let baseUrl = 'http://daemon-a.test'
    const repointed = new RemoteExecutionHost({
      connection: {
        resolveConnection: async () => ({ baseUrl, token: 'test-token' }),
      },
      fetch: stub.fetchFn,
      reconnect: { maxAttempts: 1, wait: async () => {} },
    })

    // Machine A answers, and does not do Projects.
    stub.setHealthBody(JSON.stringify(daemonHealthFixtureWithoutDescriptor()))
    await repointed.refreshProviders()

    // The Endpoint is repointed in Settings to machine B, which does.
    baseUrl = 'http://daemon-b.test'
    stub.setHealthBody(DAEMON_HEALTH_FIXTURE_0_26_1)
    stub.setProjects({
      projects: [{ id: 'b', name: 'b', workingDirectory: '/srv/b' }],
    })

    // One catalog call, and B's first listing lands *inside* it: this read is
    // the one waiting on that listing, which is what makes measuring it
    // against anything read before that listing fatal.
    const catalog = await repointed.describeProjectCatalog()

    expect(catalog.projects.map((project) => project.id)).toEqual(['b'])
    expect(catalog.unreachableReason).toBeNull()
    // And on record, so the place B listed runs without another round trip.
    expect(() => {
      repointed.start('claude', startInDirectory('/srv/b')).dispose?.()
    }).not.toThrow()
  })

  it('never refuses a Project while the machine says nothing readable', async () => {
    // The inverse of the refusal above, and the direction a boolean could not
    // express. A machine that answered without `projects.v1` is on record as
    // doing no Projects; then `/health` stops being readable and the machine
    // says nothing at all about itself. Read as a boolean both are "not
    // advertising", so the stale `unsupported` stood and Project mode was
    // refused in the name of a handshake this host itself calls unknown --
    // the exact inverse of "unknown is never reported as gone" (MAR-2689
    // round 5).
    //
    // Mutation: collapse the door's tri-state back to one boolean
    // (`advertisesRemoteProjects(this.handshake())` refuses), and this goes red
    // -- an unknown machine refuses a Project it never spoke about.
    stub.setHealthBody(JSON.stringify(daemonHealthFixtureWithoutDescriptor()))
    await expect(host.describeProjectCatalog()).resolves.toEqual({
      supported: false,
      projects: [],
      unreachableReason: null,
    })
    expect(() =>
      host.start('claude', startInDirectory('/srv/projects/new-blok')),
    ).toThrow(/lists no Projects/)

    // The same address, and now `/health` answers nothing readable.
    stub.setHealthBody(null)
    await host.refreshProviders()

    expect(() => {
      host
        .start('claude', startInDirectory('/srv/projects/new-blok'))
        .dispose?.()
    }).not.toThrow()
  })

  it('never tags one machine’s Projects with another machine’s address', async () => {
    // The Endpoint is repointed while a read is in flight. Committed with
    // `this.configuration` read *after* the await, the first machine's
    // directories arrived labelled as the second's -- and `start` then measured
    // a session against a listing no machine in force ever gave (MAR-2620,
    // "every derived value carries the configuration it was derived from").
    //
    // Mutation: commit with `this.configuration` instead of the fingerprint
    // captured at the request, and this goes red.
    let baseUrl = 'http://daemon-a.test'
    const repointing = new RemoteExecutionHost({
      connection: {
        resolveConnection: async () => ({ baseUrl, token: 'test-token' }),
      },
      fetch: stub.fetchFn,
      reconnect: { maxAttempts: 1, wait: async () => {} },
    })

    let releaseAnswer: () => void = () => {}
    const answerReleased = new Promise<void>((resolve) => {
      releaseAnswer = resolve
    })
    let markRequested: () => void = () => {}
    const requestIsOut = new Promise<void>((resolve) => {
      markRequested = resolve
    })
    stub.setProjectsResponder(async () => {
      markRequested()
      await answerReleased
      return { projects: [{ id: 'a', name: 'a', workingDirectory: '/srv/a' }] }
    })

    const inFlight = repointing.describeProjectCatalog()
    // Only once A's read is genuinely on the wire: the connection it carries is
    // what the answer must be tagged with, whatever happens next.
    await requestIsOut
    // The Endpoint moves, and the host observes the new address on a wire call
    // of its own.
    baseUrl = 'http://daemon-b.test'
    await repointing.refreshProviders()
    releaseAnswer()
    await inFlight

    // Machine B has said nothing about its Projects, so nothing may be refused
    // in its name. Unknown is never reported as gone.
    expect(() => {
      repointing.start('claude', startInDirectory('/srv/b-only')).dispose?.()
    }).not.toThrow()
  })
})
