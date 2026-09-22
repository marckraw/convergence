/**
 * MAR-3298 R2/R3: a failed `/clear` drains the brief queued behind it into
 * the still-active conversation; a plain failed turn still leaves queued
 * rows waiting (MAR-2971).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { ProviderRegistry } from '../provider/provider-registry'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import {
  buildFallbackCodexDescriptor,
  buildFallbackPiDescriptor,
} from '../provider/provider-descriptor.pure'
import type { SessionStartConfig } from '../provider/provider.types'
import type { SessionDelta } from './conversation-item.types'
import type { DispatchTerminalEvent } from './session.types'
import { SessionService } from './session.service'

describe('clear-then-deliver: failed reset drains the brief (MAR-3298 R2)', () => {
  let service: SessionService
  let directory: string
  let sessionId: string
  let emit: (delta: SessionDelta) => void
  let starts: SessionStartConfig[]
  let providerLog: string[]

  beforeEach(() => {
    const db = getDatabase()
    directory = mkdtempSync(join(tmpdir(), 'clear-then-deliver-'))
    mkdirSync(join(directory, '.git'))
    db.prepare(
      'INSERT INTO projects (id, name, repository_path) VALUES (?, ?, ?)',
    ).run('reset-project', 'Reset', directory)
    const registry = new ProviderRegistry()
    starts = []
    providerLog = []
    const register = (
      providerId: 'pi' | 'codex',
      describe: () => ReturnType<typeof buildFallbackPiDescriptor>,
    ) => {
      registry.register({
        id: providerId,
        name: providerId,
        supportsContinuation: true,
        describe: async () => describe(),
        start(config) {
          starts.push(config)
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
    }
    register('pi', buildFallbackPiDescriptor)
    register('codex', buildFallbackCodexDescriptor)
    service = new SessionService(db, new LocalExecutionHost(registry))
    sessionId = service.create({
      projectId: 'reset-project',
      workspaceId: null,
      providerId: 'pi',
      name: 'deepseek-mac',
      model: 'openrouter/deepseek/deepseek-v3.2',
      effort: 'high',
    }).id
  })

  afterEach(async () => {
    await service.disposeAll()
    closeDatabase()
    resetDatabase()
    rmSync(directory, { recursive: true, force: true })
  })

  async function seedCompletedTurn(token = '/pi/prior.jsonl'): Promise<void> {
    await service.start(sessionId, { text: 'before' })
    emit({
      kind: 'session.patch',
      patch: { continuationToken: token, status: 'completed' },
    })
    providerLog.length = 0
    starts.length = 0
  }

  it('delivers the payload after a failed reset opener — keep today failed handling turns red', async () => {
    await seedCompletedTurn()
    const terminals: DispatchTerminalEvent[] = []
    service.onDispatchTerminal((event) => terminals.push(event))

    const receipt = await service.sendMessageWithOpener(sessionId, {
      opener: '/clear',
      text: 'the brief that must ride',
    })
    expect(receipt.openerQueued).toBe(false)
    expect(starts.map((c) => c.initialMessage)).toEqual(['/clear'])

    // Reset failure note, then failed lifecycle — the order R5 asks for.
    emit({
      kind: 'conversation.item.add',
      item: {
        id: randomUUID(),
        kind: 'note',
        state: 'error',
        text: 'Could not clear the conversation: Pi did not name its new session in time (2 × 20 s). The previous conversation is still active; your next message will resume it.',
        level: 'error',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        turnId: null,
        providerMeta: {
          providerId: 'pi',
          providerItemId: null,
          providerEventType: 'system',
        },
      },
    })
    providerLog.push('reset-failed-note')
    emit({ kind: 'session.patch', patch: { status: 'failed' } })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(providerLog).toEqual([
      'start:/clear',
      'reset-failed-note',
      'start:the brief that must ride',
    ])
    expect(
      service
        .getQueuedInputs(sessionId)
        .filter((row) => row.dispatchId === receipt.payloadDispatchId),
    ).toEqual([])

    // Provider records the payload user message after the drain started it.
    const now = new Date().toISOString()
    emit({
      kind: 'conversation.item.add',
      item: {
        id: randomUUID(),
        kind: 'message',
        actor: 'user',
        text: 'the brief that must ride',
        state: 'complete',
        createdAt: now,
        updatedAt: now,
        turnId: null,
        providerMeta: {
          providerId: 'pi',
          providerItemId: null,
          providerEventType: 'user',
        },
      },
    })
    const items = service.getConversation(sessionId)
    const noteIndex = items.findIndex(
      (item) => item.kind === 'note' && item.text.includes('Could not clear'),
    )
    const userIndex = items.findIndex(
      (item) =>
        item.kind === 'message' &&
        item.actor === 'user' &&
        item.text.includes('the brief that must ride'),
    )
    expect(noteIndex).toBeGreaterThanOrEqual(0)
    expect(userIndex).toBeGreaterThan(noteIndex)

    // R3: no failed terminal for the payload's dispatch id.
    expect(
      terminals.some(
        (event) =>
          event.reason === 'failed' &&
          event.dispatchIds.includes(receipt.payloadDispatchId),
      ),
    ).toBe(false)

    emit({ kind: 'session.patch', patch: { status: 'completed' } })
    await Promise.resolve()
    expect(
      terminals.some(
        (event) =>
          event.reason === 'failed' &&
          event.dispatchIds.includes(receipt.payloadDispatchId),
      ),
    ).toBe(false)
  })

  it('busy seat: the drain sends the queued /clear, the reset fails, the brief drains (MAR-3307) — no reset mark in the drain turns red', async () => {
    // The seat is mid-turn, so the opener waits as a row of its own. Before
    // MAR-3307 only the direct door marked a reset in flight, so this path's
    // failed reset stranded the brief behind it with nothing to drain it.
    await service.start(sessionId, { text: 'busy turn' })
    emit({
      kind: 'session.patch',
      patch: { continuationToken: '/pi/prior.jsonl', status: 'running' },
    })
    const receipt = await service.sendMessageWithOpener(sessionId, {
      opener: '/clear',
      text: 'the brief that must ride',
    })
    expect(receipt.openerQueued).toBe(true)
    providerLog.length = 0

    // The busy turn ends; the drain sends the opener from its row.
    emit({ kind: 'session.patch', patch: { status: 'completed' } })
    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(providerLog).toEqual(['start:/clear'])

    // The reset fails.
    emit({ kind: 'session.patch', patch: { status: 'failed' } })
    for (let i = 0; i < 5; i++) await Promise.resolve()

    expect(providerLog).toEqual([
      'start:/clear',
      'start:the brief that must ride',
    ])
    expect(
      service
        .getQueuedInputs(sessionId)
        .filter((row) => row.dispatchId === receipt.payloadDispatchId),
    ).toEqual([])
  })

  it('a reset that fails with nothing queued behind it ends failed and does not send', async () => {
    await seedCompletedTurn()
    await service.sendMessage(sessionId, { text: '/clear' })
    expect(starts.map((c) => c.initialMessage)).toEqual(['/clear'])
    emit({
      kind: 'conversation.item.add',
      item: {
        id: randomUUID(),
        kind: 'note',
        state: 'error',
        text: 'Could not clear the conversation: probe timed out. The previous conversation is still active; your next message will resume it.',
        level: 'error',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        turnId: null,
        providerMeta: {
          providerId: 'pi',
          providerItemId: null,
          providerEventType: 'system',
        },
      },
    })
    emit({ kind: 'session.patch', patch: { status: 'failed' } })
    await Promise.resolve()
    await Promise.resolve()
    expect(starts).toHaveLength(1)
    expect(service.getQueuedInputs(sessionId)).toEqual([])
    expect(service.getById(sessionId)?.status).toBe('failed')
  })

  it('a plain failed turn still leaves a queued row waiting (MAR-2971) — drain on every failed turns red', async () => {
    // Codex: supportsAppQueuedFollowUp, so a mid-turn follow-up is queued by
    // the app rather than handed to the provider (Pi's native follow-up).
    sessionId = service.create({
      projectId: 'reset-project',
      workspaceId: null,
      providerId: 'codex',
      name: 'codex-horse',
      model: 'gpt-5',
      effort: 'high',
    }).id
    await service.start(sessionId, { text: 'horse turn' })
    emit({ kind: 'session.patch', patch: { status: 'running' } })
    const queuedId = await service.sendMessage(sessionId, {
      text: 'later brief',
      deliveryMode: 'follow-up',
    })
    emit({ kind: 'session.patch', patch: { status: 'failed' } })
    await Promise.resolve()
    await Promise.resolve()
    expect(service.getQueuedInputs(sessionId)).toMatchObject([
      { dispatchId: queuedId, state: 'queued', error: null },
    ])
    expect(starts.map((c) => c.initialMessage)).toEqual(['horse turn'])
  })

  /** Codex seat: reset + app-queued follow-up on the same session (lap 2 A). */
  function createCodexSeat(): string {
    return service.create({
      projectId: 'reset-project',
      workspaceId: null,
      providerId: 'codex',
      name: 'codex-flag-lifecycle',
      model: 'gpt-5',
      effort: 'high',
    }).id
  }

  /**
   * On the current session: a new turn, a queued follow-up, then a plain
   * `failed`. The row must stay `queued` — a stale `resetsInFlight` flag
   * would drain it (MAR-3298 lap 2 A / MAR-2971).
   */
  async function assertPlainFailedDoesNotDrain(): Promise<void> {
    providerLog.length = 0
    starts.length = 0
    await service.start(sessionId, { text: 'plain turn' })
    emit({ kind: 'session.patch', patch: { status: 'running' } })
    const queuedId = await service.sendMessage(sessionId, {
      text: 'must stay queued',
      deliveryMode: 'follow-up',
    })
    emit({ kind: 'session.patch', patch: { status: 'failed' } })
    await Promise.resolve()
    await Promise.resolve()
    expect(service.getQueuedInputs(sessionId)).toMatchObject([
      { dispatchId: queuedId, state: 'queued', error: null },
    ])
    expect(starts.map((c) => c.initialMessage)).toEqual(['plain turn'])
    expect(
      providerLog.some((entry) => entry.includes('must stay queued')),
    ).toBe(false)
  }

  it('A1: after hand Stop during a reset, a plain failed turn does not drain — MA keeps the flag turns red', async () => {
    sessionId = createCodexSeat()
    await seedCompletedTurn()
    await service.sendMessage(sessionId, { text: '/clear' })
    expect(starts.map((c) => c.initialMessage)).toEqual(['/clear'])
    service.stop(sessionId)
    await assertPlainFailedDoesNotDrain()
  })

  it('A2: after a successful reset, a plain failed turn does not drain — MF leaves the flag turns red', async () => {
    sessionId = createCodexSeat()
    await seedCompletedTurn()
    await service.sendMessage(sessionId, { text: '/clear' })
    emit({ kind: 'session.patch', patch: { status: 'completed' } })
    await Promise.resolve()
    await Promise.resolve()
    await assertPlainFailedDoesNotDrain()
  })

  it('A3: after a busy refusal of /clear, a plain failed turn does not drain — MB sets flag before busy turns red', async () => {
    sessionId = createCodexSeat()
    await seedCompletedTurn()
    await service.start(sessionId, { text: 'busy turn' })
    emit({ kind: 'session.patch', patch: { status: 'running' } })
    await expect(
      service.sendMessage(sessionId, { text: '/clear' }),
    ).rejects.toThrow(
      'Wait for the current turn to finish before clearing the conversation.',
    )
    const queuedId = await service.sendMessage(sessionId, {
      text: 'must stay queued',
      deliveryMode: 'follow-up',
    })
    emit({ kind: 'session.patch', patch: { status: 'failed' } })
    await Promise.resolve()
    await Promise.resolve()
    expect(service.getQueuedInputs(sessionId)).toMatchObject([
      { dispatchId: queuedId, state: 'queued', error: null },
    ])
    expect(starts.some((c) => c.initialMessage === 'must stay queued')).toBe(
      false,
    )
  })

  it('A4: a replay-guarded reset terminal still clears the flag — drop the guard clear turns red', async () => {
    sessionId = createCodexSeat()
    await seedCompletedTurn()
    const receipt = await service.sendMessageWithOpener(sessionId, {
      opener: '/clear',
      text: 'must stay queued',
    })
    const internals = service as unknown as {
      activeHandles: Map<string, object>
      handlesAwaitingTheirRun: WeakSet<object>
      resetsInFlight: Set<string>
    }
    const handle = internals.activeHandles.get(sessionId)
    expect(handle).toBeTruthy()
    internals.handlesAwaitingTheirRun.add(handle!)
    // Replayed settle: lifecycle returns early. Flag must still clear.
    emit({
      kind: 'session.patch',
      executionHostSeq: 1,
      patch: { status: 'failed' },
    })
    await Promise.resolve()
    expect(internals.resetsInFlight.has(sessionId)).toBe(false)
    // Unguarded failed (no seq): a stale flag would drain the payload.
    emit({ kind: 'session.patch', patch: { status: 'failed' } })
    await Promise.resolve()
    await Promise.resolve()
    expect(service.getQueuedInputs(sessionId)).toMatchObject([
      { dispatchId: receipt.payloadDispatchId, state: 'queued', error: null },
    ])
    expect(starts.some((c) => c.initialMessage === 'must stay queued')).toBe(
      false,
    )
  })
})
