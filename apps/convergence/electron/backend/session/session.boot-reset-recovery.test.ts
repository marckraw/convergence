/**
 * MAR-3307: a restart in the middle of a `/clear`. Boot reads the reset off
 * the record, fails the brief behind it with a reason, and tells every boot
 * ending once the listeners exist (`tellBootEndings`). A plain stale turn
 * keeps its queued rows (MAR-2971).
 *
 * Every case seeds the database the way the record leaves it at the moment
 * of the crash, then builds a NEW `SessionService` over the same database:
 * its constructor is the boot.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type Database from 'better-sqlite3'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { ProviderRegistry } from '../provider/provider-registry'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { buildFallbackPiDescriptor } from '../provider/provider-descriptor.pure'
import {
  AutoDispatchService,
  type AutoDispatchGateway,
} from '../tracker/auto-dispatch.service'
import type { WorkLedgerService } from '../work-ledger/work-ledger.service'
import {
  RESTARTED_WHILE_DISPATCHING_ERROR,
  SessionQueuedInputService,
} from './session-queued-input.service'
import { STALE_RESET_ROW_ERROR } from './session-stale-reset.pure'
import type { SessionDelta } from './conversation-item.types'
import type { DispatchTerminalEvent, QueuedInputState } from './session.types'
import { SessionService } from './session.service'

const STALE_REASON =
  'Session marked failed because Convergence restarted before the provider process finished.'

describe('boot recovery reads a reset a restart interrupted (MAR-3307)', () => {
  let db: Database.Database
  let directory: string
  let registry: ProviderRegistry
  let providerLog: string[]
  let emit: (delta: SessionDelta) => void
  let sessionId: string
  const services: SessionService[] = []

  beforeEach(() => {
    db = getDatabase()
    directory = mkdtempSync(join(tmpdir(), 'boot-reset-'))
    mkdirSync(join(directory, '.git'))
    db.prepare(
      'INSERT INTO projects (id, name, repository_path) VALUES (?, ?, ?)',
    ).run('boot-project', 'Boot', directory)
    providerLog = []
    registry = new ProviderRegistry()
    registry.register({
      id: 'pi',
      name: 'pi',
      supportsContinuation: true,
      describe: async () => buildFallbackPiDescriptor(),
      start(config) {
        providerLog.push(`start:${config.initialMessage}`)
        return {
          onDelta: (cb) => {
            emit = cb
          },
          onStatusChange: () => {},
          onAttentionChange: () => {},
          onContinuationToken: () => {},
          onContextWindowChange: () => {},
          onActivityChange: () => {},
          sendMessage: (text) => {
            providerLog.push(`send:${text}`)
          },
          approve: () => {},
          deny: () => {},
          stop: () => {},
          dispose: () => {},
        }
      },
    })
    sessionId = boot().create({
      projectId: 'boot-project',
      workspaceId: null,
      providerId: 'pi',
      name: 'deepseek-mac',
      model: 'openrouter/deepseek/deepseek-v3.2',
      effort: 'high',
    }).id
  })

  afterEach(async () => {
    for (const service of services.splice(0)) await service.disposeAll()
    closeDatabase()
    resetDatabase()
    rmSync(directory, { recursive: true, force: true })
  })

  /** A process start over the same database: the constructor is the boot. */
  function boot(): SessionService {
    const service = new SessionService(db, new LocalExecutionHost(registry))
    services.push(service)
    return service
  }

  /**
   * The seat was mid-turn when the app died, on a conversation that can be
   * resumed: so a boot that DID deliver would reach the provider, and the
   * "nothing was sent" assertions below can see it.
   */
  function markRunning(): void {
    db.prepare(
      "UPDATE sessions SET status = 'running', continuation_token = '/pi/prior.jsonl' WHERE id = ?",
    ).run(sessionId)
  }

  /** Lets any delivery a boot started reach the fake provider. */
  async function settleAsyncWork(): Promise<void> {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0))
  }

  /** A queued row exactly as the record would hold it at the crash. */
  function seedRow(
    text: string,
    state: QueuedInputState,
    dispatchId: string | null,
  ): string {
    const queue = new SessionQueuedInputService(db)
    const row = queue.enqueue(
      sessionId,
      { text, dispatchId, skipContextInjection: text === '/clear' },
      'follow-up',
    )
    if (state !== 'queued') queue.patch(row.id, state)
    return row.id
  }

  function rowById(id: string) {
    return db
      .prepare(
        'SELECT state, error, ending_told_at FROM session_queued_inputs WHERE id = ?',
      )
      .get(id) as {
      state: string
      error: string | null
      ending_told_at: string | null
    }
  }

  /** The Loom's claim for the payload: an auto-dispatch row with its receipt. */
  function seedAutoDispatch(receipt: string): void {
    db.prepare(
      `INSERT INTO auto_dispatches
        (id, crew_id, issue_id, lap, seat, session_id, wire_id, sent_at, delivery, receipt)
       VALUES ('claim', 'crew', 'MAR-1', 1, 'deepseek-mac', ?, 'wire', ?, 'queued', ?)`,
    ).run(sessionId, '2026-09-23T08:00:00.000Z', receipt)
  }

  function autoDispatchError(): string | null {
    return (
      db
        .prepare("SELECT error FROM auto_dispatches WHERE id = 'claim'")
        .get() as {
        error: string | null
      }
    ).error
  }

  /** The real listener, wired to the service that booted, as `main` wires it. */
  function wireAutoDispatch(service: SessionService): AutoDispatchService {
    return new AutoDispatchService(
      db,
      service as unknown as AutoDispatchGateway,
      { list: () => [] },
      {} as Pick<WorkLedgerService, 'currentView'>,
    )
  }

  function listen(service: SessionService): DispatchTerminalEvent[] {
    const terminals: DispatchTerminalEvent[] = []
    service.onDispatchTerminal((event) => terminals.push(event))
    return terminals
  }

  function resetNotes(service: SessionService) {
    return service
      .getConversation(sessionId)
      .filter(
        (item) =>
          item.kind === 'note' &&
          item.providerMeta.providerEventType === 'conversation-reset',
      )
  }

  it('idle shape: the opener sent, the payload queued — boot fails the payload, tells it once, sends nothing', async () => {
    markRunning()
    seedRow('/clear', 'sent', 'opener-receipt')
    const payload = seedRow('the brief that must ride', 'queued', 'payload')
    seedAutoDispatch('payload')

    const service = boot()

    // Failed at once, durably, with the reason; told to nobody yet.
    expect(rowById(payload)).toEqual({
      state: 'failed',
      error: STALE_RESET_ROW_ERROR,
      ending_told_at: null,
    })
    expect(service.getById(sessionId)?.status).toBe('failed')
    const notes = resetNotes(service)
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({
      level: 'warning',
      text: 'Convergence restarted during /clear; 1 message behind it was not delivered — send it again.',
    })

    // The listeners exist now, as they do after `main/index.ts:943`.
    wireAutoDispatch(service)
    const terminals = listen(service)
    expect(autoDispatchError()).toBeNull()

    service.tellBootEndings()

    expect(terminals).toEqual([
      expect.objectContaining({
        sessionId,
        reason: 'failed',
        dispatchIds: ['payload'],
      }),
    ])
    expect(autoDispatchError()).toBe(
      'the delivery failed before the seat took it',
    )
    expect(rowById(payload).ending_told_at).not.toBeNull()

    // Once only.
    service.tellBootEndings()
    expect(terminals).toHaveLength(1)
    // No delivery at boot.
    await settleAsyncWork()
    expect(providerLog).toEqual([])
  })

  it('idle shape, as the app writes it: sendMessageWithOpener on an idle seat, then a restart — boot fails the brief (sending the opener directly turns red)', async () => {
    // Not seeded: the first process writes the record through the real door,
    // and dies inside the reset (no lifecycle arrives).
    const first = boot()
    db.prepare(
      "UPDATE sessions SET continuation_token = '/pi/prior.jsonl' WHERE id = ?",
    ).run(sessionId)
    const receipt = await first.sendMessageWithOpener(sessionId, {
      opener: '/clear',
      text: 'the brief that must ride',
    })
    expect(receipt.openerQueued).toBe(false)
    expect(providerLog).toEqual(['start:/clear'])
    // As Pi's `resetConversation` reports itself (`pi-provider.ts`).
    emit({ kind: 'session.patch', patch: { status: 'running' } })
    expect(first.getById(sessionId)?.status).toBe('running')
    // The opener left a row with its receipt, the payload waits behind it.
    // `sent`, not `dispatching`, while the reset still runs: the door stamps
    // `sent` when the provider takes the turn, not when the turn ends -- so
    // at the crash the in-flight reset reads `sent` (MAR-3307 lap 3, item 2).
    const opener = db
      .prepare(
        'SELECT id, text, state FROM session_queued_inputs WHERE dispatch_id = ?',
      )
      .get(receipt.openerDispatchId) as { id: string; text: string }
    expect(opener).toMatchObject({ text: '/clear', state: 'sent' })
    const payload = (
      db
        .prepare('SELECT id FROM session_queued_inputs WHERE dispatch_id = ?')
        .get(receipt.payloadDispatchId) as { id: string }
    ).id
    providerLog.length = 0

    const service = boot()

    expect(rowById(payload)).toEqual({
      state: 'failed',
      error: STALE_RESET_ROW_ERROR,
      ending_told_at: null,
    })
    expect(resetNotes(service)).toHaveLength(1)
    const terminals = listen(service)
    service.tellBootEndings()
    expect(terminals).toEqual([
      expect.objectContaining({
        reason: 'failed',
        dispatchIds: [receipt.payloadDispatchId],
      }),
    ])
    await settleAsyncWork()
    expect(providerLog).toEqual([])
  })

  it('busy shape: a drained opener caught dispatching — it and the payload both end, in one terminal', () => {
    markRunning()
    // The busy path: the opener waited as a queued row, the turn ahead ended,
    // the drain moved it to `dispatching`, and the app died before it was
    // accepted. The payload is still queued behind it.
    const opener = seedRow('/clear', 'dispatching', 'opener-receipt')
    const payload = seedRow('the brief that must ride', 'queued', 'payload')

    const service = boot()

    expect(rowById(opener)).toMatchObject({
      state: 'failed',
      error: STALE_REASON,
      ending_told_at: null,
    })
    expect(rowById(payload)).toMatchObject({
      state: 'failed',
      error: STALE_RESET_ROW_ERROR,
      ending_told_at: null,
    })
    expect(resetNotes(service)).toHaveLength(1)

    const terminals = listen(service)
    service.tellBootEndings()
    expect(terminals).toEqual([
      expect.objectContaining({
        sessionId,
        reason: 'failed',
        dispatchIds: ['opener-receipt', 'payload'],
      }),
    ])
    expect(providerLog).toEqual([])
  })

  it('a plain stale turn keeps its queued row (MAR-2971) — failing behind ANY stale turn turns red', () => {
    markRunning()
    seedRow('a normal brief', 'sent', 'work')
    const later = seedRow('later brief', 'queued', 'later')

    const service = boot()

    expect(rowById(later)).toEqual({
      state: 'queued',
      error: null,
      ending_told_at: null,
    })
    expect(resetNotes(service)).toEqual([])
    const terminals = listen(service)
    service.tellBootEndings()
    expect(terminals).toEqual([])
    expect(providerLog).toEqual([])
  })

  it('an ending boot wrote is told by a LATER boot — telling from memory turns red', () => {
    markRunning()
    seedRow('/clear', 'sent', 'opener-receipt')
    const payload = seedRow('the brief that must ride', 'queued', 'payload')

    // The first boot fails the rows, then the app dies before the call.
    boot()
    expect(rowById(payload)).toMatchObject({
      state: 'failed',
      ending_told_at: null,
    })

    // The next boot finds the session already failed. Only the record still
    // knows this ending is owed.
    const service = boot()
    const terminals = listen(service)
    service.tellBootEndings()
    expect(terminals).toEqual([
      expect.objectContaining({ reason: 'failed', dispatchIds: ['payload'] }),
    ])
    expect(rowById(payload).ending_told_at).not.toBeNull()
  })

  it("today's silent boot ending rides the same flush: an attempted row is told, not stamped over", () => {
    markRunning()
    const attempted = seedRow('a normal brief', 'dispatching', 'attempted')

    const service = boot()
    expect(rowById(attempted)).toEqual({
      state: 'failed',
      error: STALE_REASON,
      ending_told_at: null,
    })

    const terminals = listen(service)
    service.tellBootEndings()
    expect(terminals).toEqual([
      expect.objectContaining({ reason: 'failed', dispatchIds: ['attempted'] }),
    ])
  })

  it('a row recoverDispatching failed stays untold — its ending is the dismissal (MAR-2971)', () => {
    // Not a stale session: the row was on its way from an idle seat.
    const row = seedRow('a normal brief', 'dispatching', 'maybe-delivered')

    const service = boot()
    expect(rowById(row)).toEqual({
      state: 'failed',
      error: RESTARTED_WHILE_DISPATCHING_ERROR,
      ending_told_at: null,
    })

    const terminals = listen(service)
    service.tellBootEndings()
    expect(terminals).toEqual([])
    expect(rowById(row).ending_told_at).toBeNull()

    service.cancelQueuedInput(row)
    expect(terminals).toEqual([
      expect.objectContaining({
        reason: 'abandoned',
        dispatchIds: ['maybe-delivered'],
      }),
    ])
  })
})
