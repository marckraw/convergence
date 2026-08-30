import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import {
  closeDatabase,
  getDatabase,
  resetDatabase,
} from '../../database/database'
import { AppSettingsService } from '../../app-settings/app-settings.service'
import { recordingExecutionHostCredentials } from '../../credentials/execution-host-daemon-credentials.fixture'
import { ExecutionHostEndpointRepository } from '../../execution-host-endpoint/execution-host-endpoint.repository'
import { seedExecutionHostEndpoint } from '../../execution-host-endpoint/execution-host-endpoint.fixture'
import { StateService } from '../../state/state.service'
import { AppSettingsRemoteExecutionHostRegistry } from './remote-execution-host.registry'
import { testRemoteExecutionHostConnection } from './remote-execution-host-connection'
import {
  createStubDaemon,
  deferred,
  type StubDaemon,
} from './execution-host-daemon.fixture'
import {
  DAEMON_HEALTH_FIXTURE_0_26_1,
  daemonHealthFixtureWithoutDescriptor,
} from './execution-host-health.fixture'
import type { SessionStartConfig } from '../provider.types'

const ENDPOINT_ID = 'daemon-a'
const BASE_URL = 'https://daemon-a.test'
const MOVED_BASE_URL = 'https://daemon-a-moved.test'

/**
 * A machine's configuration has an opaque epoch (MAR-2689 round 6).
 *
 * The seam five rounds of review kept finding one more corner of. The daemon
 * token is part of what a listing is true of — `daemonConfigurationFingerprint`
 * puts it there deliberately — and the token is the one thing that must never
 * cross the preload boundary, so the renderer's catalog source was blind to a
 * rotation. A `/v0/projects` answer opened under token A could land, be shown,
 * be recorded and be sent, under token B's still-equal source.
 *
 * Deliberately over the real settings service, the real Endpoint repository and
 * the real connection resolver rather than a hand-built ledger: the claim is
 * that the epoch the renderer *receives with its Endpoint list* moves when the
 * credential does, and a test that called `observe` itself would prove only
 * that a counter counts.
 */
describe('the configuration epoch', () => {
  let db: Database.Database
  let stub: StubDaemon
  let appSettings: AppSettingsService
  let registry: AppSettingsRemoteExecutionHostRegistry
  let tokens: Record<string, string | null>

  const PROJECT_A = {
    id: 'private-to-a',
    name: 'private-to-a',
    workingDirectory: '/srv/private-to-a',
  }
  const PROJECT_B = {
    id: 'private-to-b',
    name: 'private-to-b',
    workingDirectory: '/srv/private-to-b',
  }

  beforeEach(() => {
    db = getDatabase()
    seedExecutionHostEndpoint(db, ENDPOINT_ID, BASE_URL)
    stub = createStubDaemon()
    stub.setProjects({ projects: [PROJECT_A] })
    tokens = { [ENDPOINT_ID]: 'token-a' }

    appSettings = new AppSettingsService(
      db,
      new StateService(db),
      async () => [],
      new ExecutionHostEndpointRepository(db),
      recordingExecutionHostCredentials(),
    )
    registry = new AppSettingsRemoteExecutionHostRegistry({
      appSettings,
      // The credential store the resolver reads at call time, which is how a
      // token rotation reaches a host that is already built and already
      // holding this machine's listing.
      credentials: { resolveToken: async (id: string) => tokens[id] ?? null },
      fetch: stub.fetchFn,
    })
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  /** The epoch as the renderer receives it: on the Endpoint list itself. */
  async function endpointAsTheRendererSeesIt() {
    const settings = await appSettings.getAppSettings()
    const endpoint = settings.executionHostEndpoints.find(
      (candidate) => candidate.id === ENDPOINT_ID,
    )
    if (!endpoint) throw new Error('the seeded endpoint went missing')
    return endpoint
  }

  async function epoch(): Promise<number> {
    return (await endpointAsTheRendererSeesIt()).configurationEpoch
  }

  /** A settings save that stores exactly these Endpoints. */
  async function saveEndpoints(
    endpoints: Array<{ id: string; label?: string; baseUrl: string }>,
  ) {
    return appSettings.setAppSettings({
      defaultProviderId: null,
      defaultModelId: null,
      defaultEffortId: null,
      executionHostEndpoints: endpoints,
    })
  }

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

  /** The captured `/health` body with its advertised capability set replaced. */
  function healthAdvertising(capabilities: string[]): string {
    const body = JSON.parse(DAEMON_HEALTH_FIXTURE_0_26_1) as Record<
      string,
      unknown
    >
    body.executionProtocol = { version: 1, capabilities }
    return JSON.stringify(body)
  }

  /** The beat Settings has for landing a fresh handshake. */
  async function landAHandshake(): Promise<void> {
    const tested = await testRemoteExecutionHostConnection({
      resolver: registry.resolverFor(ENDPOINT_ID),
      host: () => registry.hostFor(ENDPOINT_ID),
    })
    expect(tested.ok).toBe(true)
  }

  it('stays put while a machine keeps the configuration it had', async () => {
    // The half that makes the epoch usable at all: it counts *changes*, not
    // resolves. Every wire call resolves a connection, so an epoch that moved
    // on each one would throw away every catalog on every turn and the strip
    // would say "asking…" forever.
    //
    // Mutation: make `ExecutionHostConfigurationEpochs.observe` increment
    // unconditionally, and this goes red.
    const host = registry.hostFor(ENDPOINT_ID)
    const before = await epoch()
    await host.describeCatalog()
    await host.describeProjectCatalog()
    await host.describeCatalog()

    expect(await epoch()).toBe(before)
  })

  it('moves when the machine’s credential is rotated', async () => {
    // The rotation the renderer could not see. Nothing about the Endpoint the
    // renderer *can* see changes here — same id, same base URL — so the epoch
    // is the whole of the difference.
    //
    // Mutation: leave `observeExecutionHostConfiguration` out of
    // `AppSettingsRemoteExecutionHostConnectionResolver.resolveConnection`, and
    // this goes red.
    const host = registry.hostFor(ENDPOINT_ID)
    await host.describeCatalog()
    const underTokenA = await epoch()

    tokens[ENDPOINT_ID] = 'token-b'
    await host.describeCatalog()

    const endpoint = await endpointAsTheRendererSeesIt()
    expect(endpoint.baseUrl).toBe(BASE_URL)
    expect(endpoint.configurationEpoch).not.toBe(underTokenA)
  })

  it('moves when the machine’s address is edited, as it always did', async () => {
    // The regression guard for the behaviour that already worked. A base URL
    // edit was visible to the renderer on its own, and it must stay visible
    // through the epoch too — the epoch is one fact about the configuration,
    // not a second opinion about half of it.
    //
    // Mutation: fingerprint only the token in `daemonConfigurationFingerprint`,
    // and this goes red.
    const host = registry.hostFor(ENDPOINT_ID)
    await host.describeCatalog()
    const atFirstAddress = await epoch()

    await saveEndpoints([
      { id: ENDPOINT_ID, label: 'kuba-vps', baseUrl: MOVED_BASE_URL },
    ])
    await host.describeCatalog()

    expect(await epoch()).not.toBe(atFirstAddress)
  })

  it('moves when the machine’s credential is taken away', async () => {
    // A refusal is an observation too. An Endpoint whose token has just been
    // deleted is not configured the way the catalog on screen was read under,
    // and a resolver that only reported its successes would leave that catalog
    // in force with nothing able to dislodge it.
    //
    // Mutation: observe only on the success path of `resolveConnection`, and
    // this goes red.
    const host = registry.hostFor(ENDPOINT_ID)
    await host.describeCatalog()
    const withAToken = await epoch()

    tokens[ENDPOINT_ID] = null
    await host.describeCatalog()

    expect(await epoch()).not.toBe(withAToken)
  })

  it('moves when the machine changes what it advertises, at the same address and credential', async () => {
    // Round 8's finding, and the completion of the rule this file names: the
    // epoch moves whenever anything a derived answer depends on changes -- the
    // configuration fingerprint *or* the advertised capability set. Round 7
    // caught a same-configuration withdrawal of `projects.v1` inside the host,
    // where the attempt's provenance made the start door refuse `/srv/…`; but
    // that capability crossed no boundary, so the renderer's source stayed
    // byte-equal, its landed Projects catalog stayed in force, and the strip
    // went on offering the place the door had just stopped accepting. Strip
    // and door disagreeing about Projects is exactly what this era forbids.
    //
    // Mutation: observe the fingerprint only (drop the capability observation
    // the registry wires into every host), and this goes red -- the epoch
    // stays where it was, so nothing in the renderer re-asks and the place the
    // door refuses is still on offer.
    const host = registry.hostFor(ENDPOINT_ID)
    await host.describeCatalog()
    const landed = await host.describeProjectCatalog()
    expect(landed.projects.map((project) => project.workingDirectory)).toEqual([
      PROJECT_A.workingDirectory,
    ])
    const whileItAdvertised = await epoch()

    // The same machine, at the same address and under the same credential,
    // upgraded into one that no longer offers Projects at all.
    stub.setHealthBody(JSON.stringify(daemonHealthFixtureWithoutDescriptor()))
    // The beat Settings actually has for landing a new handshake.
    const tested = await testRemoteExecutionHostConnection({
      resolver: registry.resolverFor(ENDPOINT_ID),
      host: () => host,
    })
    expect(tested.ok).toBe(true)

    const endpoint = await endpointAsTheRendererSeesIt()
    expect(endpoint.baseUrl).toBe(BASE_URL)
    expect(endpoint.configurationEpoch).not.toBe(whileItAdvertised)

    // And the two surfaces now agree: the renderer's source has moved, so the
    // catalog holding `/srv/private-to-a` is out of force at the read
    // (`providerCatalogSourceForHost`, `provider-catalog.pure.test.ts`;
    // `catalogInForce`, `session.model.test.ts`), and the door refuses it too.
    expect(() =>
      host.start('claude', startInDirectory(PROJECT_A.workingDirectory)),
    ).toThrow(/lists no Projects/)
  })

  it('stays put when a refresh lands the capability set it already had', async () => {
    // The other half of the rule, and what keeps the ordinary case ordinary. A
    // connection test lands a handshake every time it is run, and a composer
    // open on this machine re-asks whenever the source moves -- so an epoch
    // that moved on every landing would put both catalogs out of force on a
    // loop and leave the strip saying "asking…" forever.
    //
    // Two landings, deliberately: `describeCatalog` lists once and then reads a
    // cache that is still in force, so the first-observation case would carry a
    // test that meant to prove the comparison.
    //
    // Mutation: let the capabilities input move the epoch on every observation
    // (drop the `last === value` return in
    // `ExecutionHostConfigurationEpochs.observe`), and this goes red.
    const host = registry.hostFor(ENDPOINT_ID)
    await host.describeCatalog()
    const afterFirstListing = await epoch()
    const handshakesSoFar = stub.healthRequests.length

    for (let landing = 0; landing < 2; landing += 1) {
      const tested = await testRemoteExecutionHostConnection({
        resolver: registry.resolverFor(ENDPOINT_ID),
        host: () => host,
      })
      expect(tested.ok).toBe(true)
    }

    // The machine really was asked twice more, so the epoch staying put means
    // "it said the same thing again" and not "nobody looked".
    //
    // Mutation: have `refreshProviders` return early when a listing is already
    // in force, and this goes red -- the epoch would still be right, and the
    // test would have stopped proving why.
    expect(stub.healthRequests.length).toBe(handshakesSoFar + 2)
    expect(await epoch()).toBe(afterFirstListing)
  })

  it('moves when two capability sets differ only in where a separator falls', async () => {
    // Round 9's finding, at the layer it does its damage. The protocol accepts
    // any non-empty string as a capability id, so these two sets are both
    // things a daemon may advertise -- and they mean opposite things, because
    // `remoteProjectsCapability` asks for exact membership of `projects.v1`:
    // the first offers Projects, the second withholds them. Fingerprinted by
    // joining ids on a NUL they were one value, so a machine could cross that
    // line without moving its Endpoint's epoch: the start door would begin
    // refusing `/srv/private-to-a` while the renderer's source stayed
    // byte-equal and the strip went on offering it. The strip/door
    // contradiction, preserved through the exact mechanism built to end it.
    //
    // Mutation: fingerprint the sorted ids by joining them on '\u0000' instead
    // of encoding them (`daemonCapabilitiesFingerprint`), and this goes red --
    // the two landings look identical and the epoch never moves.
    const host = registry.hostFor(ENDPOINT_ID)
    await host.describeCatalog()

    stub.setHealthBody(healthAdvertising(['projects.v1', 'x']))
    await landAHandshake()
    const asTwoIds = await epoch()

    stub.setHealthBody(healthAdvertising(['projects.v1\u0000x']))
    await landAHandshake()

    const endpoint = await endpointAsTheRendererSeesIt()
    expect(endpoint.baseUrl).toBe(BASE_URL)
    expect(endpoint.configurationEpoch).not.toBe(asTwoIds)
  })

  it('never lets a Projects read escape the credential it was opened under', async () => {
    // codex's design canary, end to end on this side of the wire: hold a
    // `/v0/projects` read under token A; rotate to token B at the same Endpoint
    // id and base URL; land B's handshake through the real connection test;
    // release A. What A read is a true statement about a machine nobody is
    // asking about any more, so it is neither committed nor handed back.
    //
    // Mutation: let an out-of-force attempt return its own listing (drop the
    // `PROJECTS_READ_UNDER_A_SUPERSEDED_CONFIGURATION` branch from
    // `commitProjectsOutcome`), and this goes red — `/srv/private-to-a` comes
    // back to the caller and, one beat later, is a place a token-B session can
    // be started in.
    const host = registry.hostFor(ENDPOINT_ID)
    await host.describeCatalog()
    const underTokenA = await epoch()

    const held = deferred()
    const requestIsOut = deferred()
    stub.setProjectsResponder(async (call) => {
      if (call === 1) {
        requestIsOut.release()
        await held.promise
        return { projects: [PROJECT_A] }
      }
      return { projects: [PROJECT_B] }
    })

    const readingUnderTokenA = host.describeProjectCatalog()
    // Only once the read is genuinely on the wire: it is the request the
    // rotation has to overtake.
    await requestIsOut.promise

    tokens[ENDPOINT_ID] = 'token-b'
    // The beat Settings actually has: Test connection, which lands the new
    // credential's handshake through the same host.
    const tested = await testRemoteExecutionHostConnection({
      resolver: registry.resolverFor(ENDPOINT_ID),
      host: () => host,
    })
    expect(tested.ok).toBe(true)

    // The renderer's source has moved, so every catalog it holds for this
    // machine is out of force at the read (`catalogInForce`,
    // `session.model.test.ts`).
    expect(await epoch()).not.toBe(underTokenA)

    held.release()
    const escaped = await readingUnderTokenA

    // Not a listing, and not an empty one either: an empty list with no reason
    // reads as "this machine has no Projects", which nobody said.
    expect(escaped.projects).toEqual([])
    expect(escaped.unreachableReason).toContain('configuration changed')

    // And nothing of token A's is on record: the next read is token B's, and
    // the place only token A could see cannot be started in.
    const underTokenB = await host.describeProjectCatalog()
    expect(
      underTokenB.projects.map((project) => project.workingDirectory),
    ).toEqual([PROJECT_B.workingDirectory])
    expect(() =>
      host.start('claude', startInDirectory(PROJECT_A.workingDirectory)),
    ).toThrow(/no longer lists/)
    expect(() => {
      host
        .start('claude', startInDirectory(PROJECT_B.workingDirectory))
        .dispose?.()
    }).not.toThrow()
  })

  it('tells the renderer an integer and nothing more', async () => {
    // The epoch reveals nothing about the credential it counts. Asserted as
    // the shape of what crosses the boundary — a fixed key set and a number —
    // rather than by looking for a token, which is a thing this suite must
    // never do.
    //
    // Mutation: add any further field to the splice in
    // `AppSettingsService.withExecutionHostEndpoints`, and this goes red.
    const host = registry.hostFor(ENDPOINT_ID)
    await host.describeCatalog()
    const endpoint = await endpointAsTheRendererSeesIt()

    expect(Object.keys(endpoint).sort()).toEqual([
      'baseUrl',
      'configurationEpoch',
      'createdAt',
      'id',
      'label',
      'position',
      'updatedAt',
    ])
    expect(typeof endpoint.configurationEpoch).toBe('number')
  })

  it('refuses a renderer that hands the epoch back', async () => {
    // Read-only, and structurally so: the epoch is a fact about what main has
    // observed, and a settings save that could set it would be the renderer
    // deciding which of its own cached answers are still in force.
    //
    // Mutation: have `setAppSettings` answer with the Endpoints it was handed
    // instead of through `withExecutionHostEndpoints`, and this goes red --
    // the 99 comes straight back. (Preferring an epoch carried on the stored
    // row does *not* redden it, and cannot: the epoch is not a column, so a
    // row never has one to prefer. The write path's refusal is structural, and
    // this pins the door that keeps it so.)
    const host = registry.hostFor(ENDPOINT_ID)
    await host.describeCatalog()
    tokens[ENDPOINT_ID] = 'token-b'
    await host.describeCatalog()
    const observed = await epoch()

    const saved = await saveEndpoints([
      {
        id: ENDPOINT_ID,
        label: 'kuba-vps',
        baseUrl: BASE_URL,
        configurationEpoch: 99,
      } as { id: string; label: string; baseUrl: string },
    ])

    expect(saved.executionHostEndpoints[0]?.configurationEpoch).toBe(observed)
    expect(await epoch()).toBe(observed)
  })
})
