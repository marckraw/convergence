import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { ProviderRegistry } from '../provider/provider-registry'
import { ProviderSessionEmitter } from '../provider/provider-session.emitter'
import type { SessionHandle } from '../provider/provider.types'
import { SessionService } from './session.service'

/**
 * Quit and teardown: pending transcript patches land before anything is
 * awaited, and a late flush against a closed database is a counted drop
 * (MAR-3274).
 */

type SessionInternals = {
  activeHandles: Map<string, SessionHandle>
  pendingConversationPatches: Map<string, unknown>
  pendingConversationPatchTimers: Map<string, ReturnType<typeof setTimeout>>
  applyDelta: (sessionId: string, delta: unknown, source: SessionHandle) => void
}

let service: SessionService
let id: string
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'teardown-patches-'))
  const db = getDatabase()
  db.prepare(
    "INSERT INTO projects(id,name,repository_path) VALUES ('p','fixture',?)",
  ).run(dir)
  service = new SessionService(
    db,
    new LocalExecutionHost(new ProviderRegistry()),
    dir,
  )
  id = service.create({
    projectId: 'p',
    workspaceId: null,
    providerId: 'claude-code',
    model: null,
    effort: null,
    name: 'teardown',
  }).id
})

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  // A hung quit dispose (R4 mutation) must not stall teardown.
  await Promise.race([
    service.disposeAll().catch(() => {}),
    new Promise<void>((resolve) => setTimeout(resolve, 200)),
  ])
  try {
    closeDatabase()
  } catch {
    // already closed (R3)
  }
  resetDatabase()
  rmSync(dir, { recursive: true, force: true })
})

function internals(): SessionInternals {
  return service as unknown as SessionInternals
}

function emptyHandle(extra: Partial<SessionHandle> = {}): SessionHandle {
  return {
    onDelta: () => {},
    onStatusChange: () => {},
    onAttentionChange: () => {},
    onContinuationToken: () => {},
    onContextWindowChange: () => {},
    onActivityChange: () => {},
    sendMessage: () => {},
    approve: () => {},
    deny: () => {},
    stop: () => {},
    ...extra,
  }
}

function emitterFor(source: SessionHandle): ProviderSessionEmitter {
  return new ProviderSessionEmitter({
    providerId: 'claude-code',
    emitDelta: (delta) => internals().applyDelta(id, delta, source),
  })
}

function messageTextFromDb(itemId: string): string | undefined {
  const row = getDatabase()
    .prepare(
      'SELECT payload_json AS payloadJson FROM session_conversation_items WHERE id = ?',
    )
    .get(itemId) as { payloadJson: string } | undefined
  if (!row) return undefined
  const payload = JSON.parse(row.payloadJson) as { text?: string }
  return payload.text
}

function pendingCounts() {
  return {
    patches: internals().pendingConversationPatches.size,
    timers: internals().pendingConversationPatchTimers.size,
  }
}

describe('MAR-3274: pending transcript patches at quit and teardown', () => {
  it('R1: what is pending lands before disposeAll awaits — move the flush below the await turns red', async () => {
    let releaseDispose!: () => void
    const disposeHeld = new Promise<void>((resolve) => {
      releaseDispose = resolve
    })
    const handle = emptyHandle({
      dispose: vi.fn(() => disposeHeld),
    })
    internals().activeHandles.set(id, handle)

    const emitter = emitterFor(handle)
    const itemId = emitter.addAssistantMessage({
      text: '',
      state: 'streaming',
    })
    emitter.patchMessage(itemId, {
      text: 'last streamed words',
      state: 'streaming',
    })
    expect(pendingCounts()).toEqual({ patches: 1, timers: 1 })

    const pending = service.disposeAll()
    // Synchronous DB read — not getConversation, which flushes pending patches
    // itself. The patch must already be on the row, and nothing may remain pending.
    expect(messageTextFromDb(itemId)).toBe('last streamed words')
    expect(pendingCounts()).toEqual({ patches: 0, timers: 0 })

    releaseDispose()
    await pending
  })

  it('R2: what a disposal enqueues lands too — delete the second flush turns red', async () => {
    let itemId = ''
    const handle = emptyHandle({
      dispose: vi.fn(() => {
        emitterFor(handle).patchMessage(itemId, {
          text: 'emitted while disposing',
          state: 'streaming',
        })
      }),
    })
    internals().activeHandles.set(id, handle)

    const emitter = emitterFor(handle)
    itemId = emitter.addAssistantMessage({ text: '', state: 'streaming' })
    expect(pendingCounts()).toEqual({ patches: 0, timers: 0 })

    await service.disposeAll()

    expect(messageTextFromDb(itemId)).toBe('emitted while disposing')
    expect(pendingCounts()).toEqual({ patches: 0, timers: 0 })
  })

  it('R3: a flush with no database is a counted drop, not a crash — remove the closed-handle branch turns red', async () => {
    let releaseDispose!: () => void
    const disposeHeld = new Promise<void>((resolve) => {
      releaseDispose = resolve
    })
    let itemId = ''
    const handle = emptyHandle({
      dispose: vi.fn(() => {
        emitterFor(handle).patchMessage(itemId, {
          text: 'late patch after close',
          state: 'streaming',
        })
        return disposeHeld
      }),
    })
    internals().activeHandles.set(id, handle)

    const emitter = emitterFor(handle)
    itemId = emitter.addAssistantMessage({ text: '', state: 'streaming' })

    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const rejections: unknown[] = []
    const onUnhandled = (reason: unknown) => {
      rejections.push(reason)
    }
    process.on('unhandledRejection', onUnhandled)

    const pending = service.disposeAll()
    closeDatabase()
    releaseDispose()
    await expect(pending).resolves.toBeUndefined()

    expect(
      errors.mock.calls.some(
        (call) =>
          String(call[0]) ===
          '[session] 1 conversation patch(es) dropped at teardown: the database was already closed',
      ),
    ).toBe(true)
    expect(rejections).toEqual([])

    process.off('unhandledRejection', onUnhandled)
    errors.mockRestore()
  })

  it('R4: the deadline cannot cost the patches — move the flush below the await turns red', async () => {
    vi.useFakeTimers()
    let releaseDispose!: () => void
    const disposeHeld = new Promise<void>((resolve) => {
      releaseDispose = resolve
    })
    const handle = emptyHandle({
      dispose: vi.fn(() => disposeHeld),
    })
    internals().activeHandles.set(id, handle)

    const emitter = emitterFor(handle)
    const itemId = emitter.addAssistantMessage({
      text: '',
      state: 'streaming',
    })
    emitter.patchMessage(itemId, {
      text: 'saved despite hung dispose',
      state: 'streaming',
    })
    // Hold the coalesced patch without its timer: advancing 8s for the quit
    // deadline would otherwise fire the 50ms flush and hide an R1 regression.
    for (const [key, timer] of internals().pendingConversationPatchTimers) {
      clearTimeout(timer)
      internals().pendingConversationPatchTimers.delete(key)
    }
    expect(pendingCounts()).toEqual({ patches: 1, timers: 0 })

    const quit = service.disposeAllForQuit()
    await vi.advanceTimersByTimeAsync(8000)
    await quit

    expect(messageTextFromDb(itemId)).toBe('saved despite hung dispose')
    expect(pendingCounts()).toEqual({ patches: 0, timers: 0 })

    // The race resolved by the deadline; release the hung dispose so the
    // orphaned disposeAll can finish and afterEach does not hang.
    releaseDispose()
    await Promise.resolve()
  })
})
