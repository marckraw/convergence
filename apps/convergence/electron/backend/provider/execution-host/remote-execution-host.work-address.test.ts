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
  waitUntil,
  type StubDaemon,
} from './execution-host-daemon.fixture'
import {
  DAEMON_HEALTH_FIXTURE_0_26_1,
  daemonHealthFixtureWithoutDescriptor,
} from './execution-host-health.fixture'
import { LocalExecutionHost } from './local-execution-host'
import { RemoteExecutionHost } from './remote-execution-host'
import { AppSettingsRemoteExecutionHostRegistry } from './remote-execution-host.registry'
import { AppSettingsService } from '../../app-settings/app-settings.service'
import { StateService } from '../../state/state.service'
import { ExecutionHostEndpointRepository } from '../../execution-host-endpoint/execution-host-endpoint.repository'
import { recordingExecutionHostCredentials } from '../../credentials/execution-host-daemon-credentials.fixture'
import { EXECUTION_HOST_NEVER_SENT_START_REQUEST_FIELDS } from './execution-host-wire-mapping.pure'
import type { SessionStartConfig } from '../provider.types'
import { makeSessionPreEraRemote } from '../../session/session-work-address.fixture'
import { ProviderDebugService } from '../../provider-debug/provider-debug.service'

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
      // The wire `main/index.ts` builds for real: the daemon's echo becomes
      // the record, in the same beat the start is accepted (MAR-2694).
      onWorkspaceReported: (sessionId, workspace) =>
        service.recordReportedWorkspace(sessionId, workspace),
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

  /**
   * Lets the start's own continuation run. The POST body is captured by the
   * stub synchronously, so the wire assertions need no wait; the *response* is
   * read one microtask later, so anything about what the daemon answered does.
   */
  async function settleScheduledWork(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0))
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
      branchName: null,
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
      branchName: null,
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

  /**
   * The errand's whole point: a branch written down at dispatch reaches the
   * daemon exactly as typed (MAR-2694). Asserted on the body the stub daemon
   * received, because the claim is about the wire and nothing else -- a wire
   * mapping fixture would pass on a shape the far side never sees.
   *
   * Mutation: trim the draft, or send `branchName: ''` for an empty field, and
   * the pair below goes red.
   */
  it('sends the branch that was written down, verbatim', async () => {
    const id = createRemoteSession({
      mode: 'repository',
      repository: 'https://github.com/marckraw/new-blok.git',
      branchName: 'agent/mar-2694',
      label: 'marckraw/new-blok',
    })
    await service.start(id, { text: 'hello' })

    expect(startBody().workspace).toEqual({
      repository: 'https://github.com/marckraw/new-blok.git',
      branchName: 'agent/mar-2694',
    })
  })

  /**
   * The other half: nothing written down sends no `branchName` KEY at all, and
   * the daemon names the branch itself. A `branchName: null` or `''` on the
   * wire would ask it to materialise a branch with no name instead of asking it
   * for one of its own choosing.
   *
   * Mutation: emit the key unconditionally in `requireRemoteWorkPlace` (or in
   * `buildWireWorkspaceSource`) and this goes red.
   */
  it('sends no branch key at all when none was written down', async () => {
    const id = createRemoteSession({
      mode: 'repository',
      repository: 'https://github.com/marckraw/new-blok.git',
      branchName: null,
      label: 'marckraw/new-blok',
    })
    await service.start(id, { text: 'hello' })

    const workspace = startBody().workspace as Record<string, unknown>
    expect(workspace).toEqual({
      repository: 'https://github.com/marckraw/new-blok.git',
    })
    expect(Object.hasOwn(workspace, 'branchName')).toBe(false)
  })

  /**
   * A residency names no branch on the wire either: a Project runs on the
   * checkout's own HEAD, and the daemon reports which (MAR-2694).
   */
  it('sends no branch in Project mode', async () => {
    const id = createRemoteSession({
      mode: 'project',
      projectId: 'new-blok',
      workingDirectory: '/srv/projects/new-blok',
      label: 'Project new-blok',
    })
    await service.start(id, { text: 'hello' })

    expect('workspace' in startBody()).toBe(false)
  })

  /**
   * The record learns where the session works in the same beat the daemon
   * accepts it (MAR-2694) -- no fetch, no panel, no waiting. The daemon's
   * snapshot route is left unstubbed here on purpose: it answers 404, so
   * anything this row sees came from the start response alone.
   *
   * Mutation: skip the `notifyWorkspaceReported` call in `RemoteSessionRun`,
   * and this goes red -- the record stays silent and the details panel has
   * nothing to show until a fetch that, on this daemon, fails.
   */
  it('records the workspace the start response echoed', async () => {
    stub.setStartWorkspace({
      mode: 'repository',
      repository: 'https://github.com/marckraw/new-blok.git',
      branchName: 'agent/34372e47',
      baseRef: 'master',
      workspacePath: '/srv/worktrees/s-1',
      environment: null,
    })
    const id = createRemoteSession({
      mode: 'repository',
      repository: 'https://github.com/marckraw/new-blok.git',
      branchName: 'agent/mar-2694',
      label: 'marckraw/new-blok',
    })
    await service.start(id, { text: 'hello' })
    await settleScheduledWork()

    // The daemon's branch, not the one that was typed: the record holds what
    // exists, and what was asked for stays in the work address beside it.
    expect(service.getById(id)?.reportedWorkspace).toEqual({
      mode: 'repository',
      repository: 'https://github.com/marckraw/new-blok.git',
      branchName: 'agent/34372e47',
      baseRef: 'master',
      workspacePath: '/srv/worktrees/s-1',
      environment: null,
    })
    expect(service.getById(id)?.workAddress).toHaveProperty(
      'branchName',
      'agent/mar-2694',
    )
  })

  /**
   * The record is only ever written from an answer about the session it belongs
   * to (MAR-2694 round 2). The echoed id used to be read and thrown away, and
   * the workspace written under the id we had asked for whatever the daemon
   * said -- so a crossed answer put another run's worktree on this row, and a
   * row that describes someone else's branch looks exactly like a right one.
   *
   * The refusal is a failed start and not a degrade: a daemon answering about a
   * run we did not ask for is not one we can attach to either.
   *
   * Mutation: drop the comparison in `requireEchoedSessionId` and this goes red
   * with the snapshot door's row below.
   */
  it('refuses a start answered for another session, and records nothing', async () => {
    stub.setStartResponseSessionId('s-somebody-else')
    stub.setStartWorkspace({
      mode: 'repository',
      repository: 'https://github.com/marckraw/other.git',
      branchName: 'agent/somebody-else',
      baseRef: 'master',
      workspacePath: '/srv/worktrees/s-somebody-else',
      environment: null,
    })
    const id = createRemoteSession({
      mode: 'repository',
      repository: 'https://github.com/marckraw/new-blok.git',
      branchName: 'agent/mar-2694',
      label: 'marckraw/new-blok',
    })
    await service.start(id, { text: 'hello' })
    await settleScheduledWork()

    expect(service.getById(id)?.reportedWorkspace).toBeNull()
    expect(service.getById(id)?.status).toBe('failed')
  })

  /**
   * The same law at the fetch door, and the record already holds an answer here
   * so "unchanged" is a thing that can be seen: a crossed GET must not be able
   * to durably rewrite this row with another run's branch.
   *
   * Mutation: drop the comparison in `requireEchoedSessionId` and this goes red
   * with the start door's row above.
   */
  it('refuses a snapshot answered for another session, and leaves the record standing', async () => {
    stub.setStartWorkspace({
      mode: 'repository',
      repository: 'https://github.com/marckraw/new-blok.git',
      branchName: 'agent/34372e47',
      baseRef: 'master',
      workspacePath: '/srv/worktrees/s-1',
      environment: null,
    })
    const id = createRemoteSession({
      mode: 'repository',
      repository: 'https://github.com/marckraw/new-blok.git',
      branchName: 'agent/mar-2694',
      label: 'marckraw/new-blok',
    })
    await service.start(id, { text: 'hello' })
    await settleScheduledWork()

    stub.setSnapshotResponseSessionId('s-somebody-else')
    stub.setSessionSnapshot(id, {
      workspace: {
        repository: 'https://github.com/marckraw/other.git',
        branchName: 'agent/somebody-else',
        baseRef: 'master',
      },
      prUrl: null,
    })
    await expect(service.fetchRemoteSessionWorkspaceInfo(id)).rejects.toThrow(
      /not /,
    )

    expect(service.getById(id)?.reportedWorkspace).toHaveProperty(
      'branchName',
      'agent/34372e47',
    )
  })

  /**
   * Acceptance is the daemon's answer; recording it is our consequence, and a
   * consequence must not be able to retract the answer (MAR-2694 round 2).
   *
   * The callback used to be invoked inside the start's own `try`, whose `catch`
   * logs "remote session start refused", fails the handle and returns before
   * the event stream is opened. So a database write that threw -- or the
   * renderer broadcast behind it -- stranded a run the daemon was already
   * holding: nothing streaming, a handle saying failed, and a retry that would
   * meet the daemon's 409 for a session id it had accepted.
   *
   * Mutation: move the `consumeStartEcho` call back inside the try and this
   * goes red on all three counts.
   */
  it('keeps a start the daemon accepted when the record write throws', async () => {
    const throwingRecord = new RemoteExecutionHost({
      connection: {
        resolveConnection: async () => ({
          baseUrl: 'http://daemon.test',
          token: 'test-token',
        }),
      },
      fetch: stub.fetchFn,
      reconnect: { maxAttempts: 1, wait: async () => {} },
      onWorkspaceReported: () => {
        throw new Error('record write failed')
      },
    })
    await throwingRecord.refreshProviders()
    service.setRemoteExecutionHosts(
      executionHostRegistryFor({
        [TEST_EXECUTION_HOST_ENDPOINT_ID]: throwingRecord,
      }),
    )
    stub.setStartWorkspace({
      mode: 'repository',
      repository: 'https://github.com/marckraw/new-blok.git',
      branchName: 'agent/34372e47',
      baseRef: 'master',
      workspacePath: '/srv/worktrees/s-1',
      environment: null,
    })

    const id = createRemoteSession({
      mode: 'repository',
      repository: 'https://github.com/marckraw/new-blok.git',
      branchName: 'agent/mar-2694',
      label: 'marckraw/new-blok',
    })
    await service.start(id, { text: 'hello' })
    await waitUntil(
      () => stub.eventStreamLastEventIds.length > 0,
      'the event stream to open',
    )

    // One start, the one the daemon accepted -- a second would meet its 409.
    expect(stub.startRequests).toHaveLength(1)
    expect(service.getById(id)?.status).not.toBe('failed')
  })

  /**
   * The other consequence in the same window, and the one that sat one
   * statement *earlier* than the guarded callback (MAR-2694 round 2).
   *
   * `run()` records a `start accepted by the daemon` lifecycle entry between
   * the POST returning 201 and `started`/`consumeEventStream()`. That entry
   * goes to the production `ProviderDebugService`, which broadcasts to the
   * renderer and appends JSONL inline; a renderer that died between
   * `isDestroyed()` and `send`, or a full disk, made it throw. `run()` is
   * fire-and-forget, so the throw became an unhandled rejection: one start
   * posted, the daemon holding the run, and no event stream ever opened --
   * the same stranded live session round 1 closed for the record write.
   *
   * Round 1 guarded that one consequence; this one names the class instead.
   * The sink is where the rule belongs, so the canary uses the real
   * `ProviderDebugService` -- a test double that cannot throw would prove
   * nothing about the object `main/index.ts` builds.
   *
   * Mutation: remove the guards in `ProviderDebugService.record` and this goes
   * red on the stream, the status, and the captured rejection.
   */
  it('keeps a start the daemon accepted when the debug sink throws', async () => {
    const rejections: unknown[] = []
    const captureRejection = (reason: unknown): void => {
      rejections.push(reason)
    }
    process.on('unhandledRejection', captureRejection)
    try {
      const debugSink = new ProviderDebugService({
        broadcast: (_channel, payload) => {
          const note = (payload as { note?: unknown } | null)?.note
          if (
            typeof note === 'string' &&
            note.includes('start accepted by the daemon')
          ) {
            throw new Error('renderer went away')
          }
        },
      })
      const noisyHost = new RemoteExecutionHost({
        connection: {
          resolveConnection: async () => ({
            baseUrl: 'http://daemon.test',
            token: 'test-token',
          }),
        },
        fetch: stub.fetchFn,
        reconnect: { maxAttempts: 1, wait: async () => {} },
        debugSink,
        onWorkspaceReported: (sessionId, workspace) =>
          service.recordReportedWorkspace(sessionId, workspace),
      })
      await noisyHost.refreshProviders()
      service.setRemoteExecutionHosts(
        executionHostRegistryFor({
          [TEST_EXECUTION_HOST_ENDPOINT_ID]: noisyHost,
        }),
      )

      const id = createRemoteSession({
        mode: 'repository',
        repository: 'https://github.com/marckraw/new-blok.git',
        branchName: 'agent/mar-2694',
        label: 'marckraw/new-blok',
      })
      await service.start(id, { text: 'hello' })
      await waitUntil(
        () => stub.eventStreamLastEventIds.length > 0,
        'the event stream to open',
      )
      // A rejection is reported at the end of a turn of the event loop, so it
      // needs one to have passed before the list can be believed.
      await settleScheduledWork()

      expect(stub.startRequests).toHaveLength(1)
      expect(service.getById(id)?.status).not.toBe('failed')
      expect(rejections).toEqual([])
    } finally {
      process.off('unhandledRejection', captureRejection)
    }
  })

  /**
   * A daemon that echoes nothing leaves the record honestly silent rather than
   * filling it with the branch that was asked for. What was requested is
   * already on the address; a record that repeated it there would make a
   * request indistinguishable from an answer.
   */
  it('records nothing when the daemon echoes no workspace', async () => {
    const id = createRemoteSession({
      mode: 'repository',
      repository: 'https://github.com/marckraw/new-blok.git',
      branchName: 'agent/mar-2694',
      label: 'marckraw/new-blok',
    })
    await service.start(id, { text: 'hello' })
    await settleScheduledWork()

    expect(service.getById(id)?.reportedWorkspace).toBeNull()
  })

  /**
   * The second door onto the same fact (MAR-2694): a daemon that predates the
   * start-response echo, or a session born before this shipped, fills its
   * record from the first workspace fetch a panel makes. The record is what
   * every surface reads, so an answer that arrives through a panel belongs in
   * it too -- otherwise the panel knows something the strip does not.
   *
   * Mutation: drop the `recordReportedWorkspace` call in
   * `fetchRemoteSessionWorkspaceInfo` and this goes red.
   */
  it('records the workspace a panel fetch came back with', async () => {
    const id = createRemoteSession({
      mode: 'repository',
      repository: 'https://github.com/marckraw/new-blok.git',
      branchName: null,
      label: 'marckraw/new-blok',
    })
    await service.start(id, { text: 'hello' })
    await settleScheduledWork()
    expect(service.getById(id)?.reportedWorkspace).toBeNull()

    stub.setSessionSnapshot(id, {
      sessionId: id,
      workspace: {
        repository: 'https://github.com/marckraw/new-blok.git',
        branchName: 'agent/34372e47',
        baseRef: 'master',
      },
      prUrl: null,
    })
    await service.fetchRemoteSessionWorkspaceInfo(id)

    expect(service.getById(id)?.reportedWorkspace).toEqual({
      mode: 'repository',
      repository: 'https://github.com/marckraw/new-blok.git',
      branchName: 'agent/34372e47',
      baseRef: 'master',
      workspacePath: null,
      environment: null,
    })
  })

  /**
   * Record beats fetch, and by precedence rather than by timing (MAR-2694
   * round 2). Both doors used to write blind under the rule "the newest answer
   * wins", so a snapshot fetch -- one that began before the start landed, or
   * came back with an older view -- durably replaced the authoritative answer,
   * and the read-side `recorded ?? fetched` guard could not help because the
   * record itself had been overwritten.
   *
   * Both orders, with distinguishable branches, because a rule about authority
   * has to hold whichever answer arrives second.
   *
   * Mutation: give the fetch door the blind `UPDATE` back (call
   * `setReportedWorkspace` from `fillReportedWorkspaceFromFetch`, or drop the
   * `AND reported_workspace IS NULL`) and the first row goes red.
   */
  it('keeps the start response when a later fetch answers differently', async () => {
    stub.setStartWorkspace({
      mode: 'repository',
      repository: 'https://github.com/marckraw/new-blok.git',
      branchName: 'agent/from-start',
      baseRef: 'master',
      workspacePath: '/srv/worktrees/s-1',
      environment: null,
    })
    const id = createRemoteSession({
      mode: 'repository',
      repository: 'https://github.com/marckraw/new-blok.git',
      branchName: null,
      label: 'marckraw/new-blok',
    })
    await service.start(id, { text: 'hello' })
    await settleScheduledWork()
    expect(service.getById(id)?.reportedWorkspace).toHaveProperty(
      'branchName',
      'agent/from-start',
    )

    stub.setSessionSnapshot(id, {
      workspace: {
        repository: 'https://github.com/marckraw/new-blok.git',
        branchName: 'agent/from-later-fetch',
        baseRef: 'master',
      },
      prUrl: null,
    })
    await service.fetchRemoteSessionWorkspaceInfo(id)

    expect(service.getById(id)?.reportedWorkspace).toHaveProperty(
      'branchName',
      'agent/from-start',
    )
  })

  /**
   * The other order, and the same ending: a fetch that landed first fills an
   * empty record, and the start's own answer then takes the record because it
   * is the authoritative one -- not because it spoke last.
   */
  it('ends on the start response when the fetch answered first', async () => {
    const id = createRemoteSession({
      mode: 'repository',
      repository: 'https://github.com/marckraw/new-blok.git',
      branchName: null,
      label: 'marckraw/new-blok',
    })
    stub.setSessionSnapshot(id, {
      workspace: {
        repository: 'https://github.com/marckraw/new-blok.git',
        branchName: 'agent/from-earlier-fetch',
        baseRef: 'master',
      },
      prUrl: null,
    })
    await service.fetchRemoteSessionWorkspaceInfo(id)
    expect(service.getById(id)?.reportedWorkspace).toHaveProperty(
      'branchName',
      'agent/from-earlier-fetch',
    )

    stub.setStartWorkspace({
      mode: 'repository',
      repository: 'https://github.com/marckraw/new-blok.git',
      branchName: 'agent/from-start',
      baseRef: 'master',
      workspacePath: '/srv/worktrees/s-1',
      environment: null,
    })
    await service.start(id, { text: 'hello' })
    await settleScheduledWork()

    expect(service.getById(id)?.reportedWorkspace).toHaveProperty(
      'branchName',
      'agent/from-start',
    )
  })

  /**
   * The carrier the app actually builds, pinned end to end (MAR-2694 round 2).
   *
   * Every other row in this file hands `RemoteExecutionHost` a callback of its
   * own, which is the shape `main/index.ts` is *supposed* to produce -- so
   * deleting the composition root's two lines, or the registry's forwarding
   * line, left all of them green while the shipped app quietly stopped
   * recording start echoes: the strip would sit on the requested place until
   * some panel happened to fetch one. A wire whose removal costs nothing is not
   * shipped.
   *
   * So this one composes the way the app does: a real
   * `AppSettingsRemoteExecutionHostRegistry` over the real Endpoint rows, the
   * real `SessionService` as the only recorder, and the record read at the end.
   * The type makes the composition root pass the callback; this makes the
   * registry hand it on.
   *
   * Mutation: delete `onWorkspaceReported: this.deps.onWorkspaceReported` from
   * `AppSettingsRemoteExecutionHostRegistry.hostFor` and this goes red.
   */
  it('carries the daemon echo from the registry the app builds to the record', async () => {
    const appSettings = new AppSettingsService(
      db,
      new StateService(db),
      async () => [],
      new ExecutionHostEndpointRepository(db),
      recordingExecutionHostCredentials(),
    )
    const registry = new AppSettingsRemoteExecutionHostRegistry({
      appSettings,
      credentials: { resolveToken: async (id: string) => `token-${id}` },
      fetch: stub.fetchFn,
      onWorkspaceReported: (sessionId, workspace) =>
        service.recordReportedWorkspace(sessionId, workspace),
    })
    service.setRemoteExecutionHosts(registry)
    await registry.primeConfiguredEndpoints()
    await waitUntil(
      () =>
        registry.hostFor(TEST_EXECUTION_HOST_ENDPOINT_ID).capabilities()
          .length > 0,
      'the daemon to be listed through the registry',
    )

    stub.setStartWorkspace({
      mode: 'repository',
      repository: 'https://github.com/marckraw/new-blok.git',
      branchName: 'agent/34372e47',
      baseRef: 'master',
      workspacePath: '/srv/worktrees/s-1',
      environment: null,
    })
    const id = createRemoteSession({
      mode: 'repository',
      repository: 'https://github.com/marckraw/new-blok.git',
      branchName: 'agent/mar-2694',
      label: 'marckraw/new-blok',
    })
    await service.start(id, { text: 'hello' })
    await waitUntil(
      () => service.getById(id)?.reportedWorkspace != null,
      'the start echo to reach the record',
    )

    expect(service.getById(id)?.reportedWorkspace).toHaveProperty(
      'branchName',
      'agent/34372e47',
    )
  })

  it('builds no automation block on any remote start', async () => {
    const id = createRemoteSession({
      mode: 'repository',
      repository: 'https://github.com/marckraw/new-blok.git',
      branchName: null,
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
      {
        mode: 'repository' as const,
        repository: '',
        branchName: null,
        label: 'marckraw/repo',
      },
      {
        mode: 'repository' as const,
        repository: '  ',
        branchName: null,
        label: 'marckraw/repo',
      },
      {
        mode: 'repository' as const,
        repository: 'https://github.com/marckraw/new-blok.git',
        branchName: null,
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
