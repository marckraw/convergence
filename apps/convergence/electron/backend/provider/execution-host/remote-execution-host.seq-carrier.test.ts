import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type Database from 'better-sqlite3'
import {
  createStubDaemon,
  envelope,
  waitUntil,
  type StubDaemon,
} from '@convergence/execution-host-client'
import {
  seedExecutionHostEndpoint,
  TEST_EXECUTION_HOST_ENDPOINT_ID,
} from '../../execution-host-endpoint/execution-host-endpoint.fixture'
import {
  closeDatabase,
  getDatabase,
  resetDatabase,
} from '../../database/database'
import { SessionService } from '../../session/session.service'
import { AppSettingsService } from '../../app-settings/app-settings.service'
import { StateService } from '../../state/state.service'
import { ExecutionHostEndpointRepository } from '../../execution-host-endpoint/execution-host-endpoint.repository'
import { recordingExecutionHostCredentials } from '../../credentials/execution-host-daemon-credentials.fixture'
import { ProviderRegistry } from '../provider-registry'
import { LocalExecutionHost } from './local-execution-host'
import { AppSettingsRemoteExecutionHostRegistry } from './remote-execution-host.registry'
import { TEST_REMOTE_WORK_ADDRESS } from '../../session/session-work-address.fixture'

const PROJECT_ID = 'project-seq-carrier'

/**
 * The stream cursor, pinned from the registry the app builds to the record
 * (MAR-2721).
 *
 * `onEventSeq` was optional on both the host and the registry, and every other
 * test in this tree hands the host a callback of its own — which is the shape
 * `main/index.ts` is *supposed* to produce. So deleting the registry's
 * forwarding line, or the composition root's
 * `sessionService.recordRemoteEventSeq`, left every gate green while the
 * shipped app stopped advancing `execution_host_last_seq`. Nothing looked
 * broken until a restart, which then reattached from zero and replayed the
 * whole session — a transcript that appeared to duplicate itself, from a
 * missing callback nobody could see. A wire whose removal costs nothing is not
 * shipped.
 *
 * So this composes the way the app does: the real
 * `AppSettingsRemoteExecutionHostRegistry` over the real Endpoint rows, the
 * real `SessionService` as the only recorder, and the column read at the end.
 * The type now makes the composition root pass the callback; this makes the
 * registry hand it on. Same recipe as MAR-2694's for `onWorkspaceReported`.
 */
describe('the remote stream cursor, through the registry the app builds', () => {
  let db: Database.Database
  let stub: StubDaemon
  let service: SessionService
  let tempDir: string

  beforeEach(() => {
    db = getDatabase()
    tempDir = mkdtempSync(join(tmpdir(), 'convergence-seq-carrier-'))
    const repoPath = join(tempDir, 'repo')
    mkdirSync(repoPath)
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES (?, 'remote', ?)",
    ).run(PROJECT_ID, repoPath)
    seedExecutionHostEndpoint(db)

    stub = createStubDaemon()
    service = new SessionService(
      db,
      new LocalExecutionHost(new ProviderRegistry()),
      join(tempDir, 'global-sessions'),
    )
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  function lastSeqOnRecord(sessionId: string): number {
    const row = db
      .prepare('SELECT execution_host_last_seq FROM sessions WHERE id = ?')
      .get(sessionId) as { execution_host_last_seq: number } | undefined
    return row?.execution_host_last_seq ?? 0
  }

  /**
   * Mutation: delete `onEventSeq: this.deps.onEventSeq` from
   * `AppSettingsRemoteExecutionHostRegistry.hostFor` and this goes red.
   *
   * The envelopes are heartbeats deliberately. A `status`, `attention` or
   * `continuation-token` event commits the same sequence inside its own session
   * patch, so a test driven by one of those would still see the column move
   * with the carrier severed — it would pin the patch and call it the cursor.
   * A heartbeat has no patch, so `onEventSeq` is the only thing that can have
   * written this number.
   */
  it('carries every processed sequence to the session record', async () => {
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
      // The wire `main/index.ts` builds for real.
      onEventSeq: (sessionId, seq) =>
        service.recordRemoteEventSeq(sessionId, seq),
      onWorkspaceReported: () => {},
    })
    service.setRemoteExecutionHosts(registry)
    await registry.primeConfiguredEndpoints()
    await waitUntil(
      () =>
        registry.hostFor(TEST_EXECUTION_HOST_ENDPOINT_ID).capabilities()
          .length > 0,
      'the daemon to be listed through the registry',
    )

    const sessionId = service.create({
      projectId: PROJECT_ID,
      workspaceId: null,
      providerId: 'claude-code',
      model: 'sonnet',
      effort: null,
      name: 'remote session',
      executionHost: TEST_EXECUTION_HOST_ENDPOINT_ID,
      workAddress: TEST_REMOTE_WORK_ADDRESS,
    }).id

    expect(lastSeqOnRecord(sessionId)).toBe(0)

    await service.start(sessionId, { text: 'hello' })
    await waitUntil(
      () => stub.eventStreamLastEventIds.length === 1,
      'the event stream to open',
    )
    stub.emit(envelope(1, { kind: 'heartbeat' }, sessionId))
    stub.emit(envelope(2, { kind: 'heartbeat' }, sessionId))

    await waitUntil(
      () => lastSeqOnRecord(sessionId) === 2,
      'the cursor to reach the record',
    )
    // Where a restart will resume from: the last sequence this app actually
    // processed, not the beginning of the session.
    expect(lastSeqOnRecord(sessionId)).toBe(2)
  })
})
