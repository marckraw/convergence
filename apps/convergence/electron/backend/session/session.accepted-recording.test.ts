import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { ProviderRegistry } from '../provider/provider-registry'
import { HandoffRefusedError } from '../provider/provider-account-handoff.pure'
import { ProviderSessionEmitter } from '../provider/provider-session.emitter'
import type { SessionHandle } from '../provider/provider.types'
import { CONVERSATION_PATCH_FLUSH_MS } from './session.constants'
import { RecordingError } from './session.pure'
import type { AcceptedRecordingFailureEvent } from './session.types'
import { SessionService } from './session.service'

/**
 * The accepted-turn recording boundary's own controls (MAR-3023): the
 * boundary turns a post-acceptance persistence failure into its own outcome —
 * one fact, one note, no rethrow — and leaves pre-acceptance refusals alone.
 * The three provider doors (handoff resend, Claude resident send, remote
 * delivery) are proven in their own suites beside their fixtures.
 */

let service: SessionService
let id: string
let dir: string
let failures: AcceptedRecordingFailureEvent[]

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'accepted-recording-'))
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
    name: 'boundary',
  }).id
  failures = []
  service.onAcceptedRecordingFailure((event) => failures.push(event))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  closeDatabase()
  resetDatabase()
  rmSync(dir, { recursive: true, force: true })
})

const recordingFailedNotes = () =>
  service
    .getConversation(id)
    .filter(
      (item): item is Extract<typeof item, { kind: 'note' }> =>
        item.kind === 'note' &&
        item.providerMeta.providerEventType === 'recording-failed',
    )

it('records a failed post-acceptance write as its own outcome: it returns, one fact, one note', () => {
  const write = vi.fn(() => {
    throw new Error('fixture: the disk refused')
  })
  expect(() =>
    service.recordAcceptedTurnForTest(
      id,
      'dispatch-1',
      'the fixture write',
      write,
    ),
  ).not.toThrow()
  expect(write).toHaveBeenCalledTimes(1)
  // One fact, naming the dispatch, the write, and the idle provider.
  expect(failures).toHaveLength(1)
  expect(failures[0]).toMatchObject({
    sessionId: id,
    dispatchId: 'dispatch-1',
    turnId: null,
    label: 'the fixture write',
    providerRunning: false,
  })
  // One note on the conversation, honest about the loss and the recovery.
  expect(recordingFailedNotes()).toHaveLength(1)
  expect(recordingFailedNotes()[0].text).toContain('the fixture write')
  expect(recordingFailedNotes()[0].text).toContain('do not resend it')
})

it('records the loss once even when the write already threw a RecordingError upstream', () => {
  const write = vi.fn(() => {
    throw new RecordingError('the conversation item', {
      cause: new Error('fixture: sqlite refused'),
      announced: true,
    })
  })
  expect(() =>
    service.recordAcceptedTurnForTest(
      id,
      'dispatch-1',
      'the conversation item',
      write,
    ),
  ).not.toThrow()
  expect(failures).toHaveLength(0)
  expect(recordingFailedNotes()).toHaveLength(0)
})

it('still throws the pre-acceptance refusals: HandoffRefusedError is not a recording failure', () => {
  const write = vi.fn(() => {
    throw new HandoffRefusedError(
      'not-eligible',
      'The selected account could not serve this turn.',
    )
  })
  expect(() =>
    service.recordAcceptedTurnForTest(
      id,
      'dispatch-1',
      'the fixture write',
      write,
    ),
  ).toThrow(HandoffRefusedError)
  expect(failures).toHaveLength(0)
  expect(recordingFailedNotes()).toHaveLength(0)
})

// -- lap 2: the deltas a live turn records, through a provider's own emitter --

/** A provider emitter wired straight into the session's delta funnel. */
function providerEmitter() {
  const source = { dispose: vi.fn(), stop: vi.fn() } as unknown as SessionHandle
  return new ProviderSessionEmitter({
    providerId: 'claude-code',
    emitDelta: (delta) =>
      (
        service as unknown as {
          applyDelta: (
            sessionId: string,
            delta: unknown,
            source: SessionHandle,
          ) => void
        }
      ).applyDelta(id, delta, source),
  })
}

const attachDispatch = (dispatchId: string) =>
  service.recordAcceptedTurnForTest(id, dispatchId, 'the attach', () => {})

const refuse = (name: string, on: string, when = '') =>
  getDatabase().exec(`CREATE TEMP TRIGGER ${name} BEFORE ${on}
    ${when ? `WHEN ${when}` : ''}
    BEGIN SELECT RAISE(ABORT, 'fixture ${name}'); END`)

it('MAR-3023 B: a refused streaming patch is announced by its flush, never thrown out of the timer', () => {
  vi.useFakeTimers()
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  const emitter = providerEmitter()
  attachDispatch('dispatch-1')
  const itemId = emitter.addAssistantMessage({ text: '', state: 'streaming' })
  refuse('refuse_item_update', 'UPDATE ON session_conversation_items')

  // A streaming patch is coalesced: the write happens later, from a timer.
  emitter.patchMessage(itemId, { text: 'streamed', state: 'streaming' })
  expect(failures).toEqual([])

  expect(() =>
    vi.advanceTimersByTime(CONVERSATION_PATCH_FLUSH_MS),
  ).not.toThrow()
  // One fact and one note: the loss is the turn's own outcome.
  expect(failures.map((failure) => failure.dispatchId)).toEqual(['dispatch-1'])
  expect(failures[0]).toMatchObject({ label: 'the conversation item patch' })
  expect(recordingFailedNotes()).toHaveLength(1)
  errors.mockRestore()
})

it('MAR-3023 B: a refused harness evidence write is announced, never thrown into the provider stream', () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  const emitter = providerEmitter()
  attachDispatch('dispatch-1')
  refuse('refuse_task', 'INSERT ON session_tasks')

  expect(() =>
    emitter.recordEvidence({
      kind: 'task.changed',
      taskId: 'monitor',
      at: 'now',
      patch: { status: 'running', taskType: 'monitor' },
    }),
  ).not.toThrow()
  expect(failures.map((failure) => failure.dispatchId)).toEqual(['dispatch-1'])
  expect(failures[0]).toMatchObject({ label: 'the harness evidence' })
  expect(recordingFailedNotes()).toHaveLength(1)
  errors.mockRestore()
})

it('MAR-3023 B, D: a flush that fails for any other reason is logged by its timer, raw — not a lost recording', () => {
  vi.useFakeTimers()
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  const emitter = providerEmitter()
  attachDispatch('dispatch-1')
  const itemId = emitter.addAssistantMessage({ text: '', state: 'streaming' })
  // A corrupt row: reading it back throws in the row parser, before any write.
  getDatabase()
    .prepare(
      'UPDATE session_conversation_items SET payload_json = ? WHERE id = ?',
    )
    .run('{not json', itemId)

  emitter.patchMessage(itemId, { text: 'streamed', state: 'streaming' })
  expect(() =>
    vi.advanceTimersByTime(CONVERSATION_PATCH_FLUSH_MS),
  ).not.toThrow()

  const logged = errors.mock.calls.find((call) =>
    String(call[0]).includes('Deferred conversation patch flush failed'),
  )
  expect(logged?.[1]).toBeInstanceOf(SyntaxError)
  expect(failures).toEqual([])
  // Counted in SQL: the transcript reader would trip on the corrupt row too.
  expect(
    getDatabase()
      .prepare(
        "SELECT COUNT(*) AS n FROM session_conversation_items WHERE provider_event_type = 'recording-failed'",
      )
      .get(),
  ).toEqual({ n: 0 })
  errors.mockRestore()
})

it('MAR-3023 D: a patch that fails outside its statements keeps its raw error — nothing is announced', () => {
  const emitter = providerEmitter()
  attachDispatch('dispatch-1')
  const itemId = emitter.addAssistantMessage({ text: '', state: 'streaming' })
  getDatabase()
    .prepare(
      'UPDATE session_conversation_items SET payload_json = ? WHERE id = ?',
    )
    .run('{not json', itemId)

  let thrown: unknown
  try {
    emitter.patchMessage(itemId, { text: 'done', state: 'complete' })
  } catch (error) {
    thrown = error
  }
  // The row parser's own error, as it is — a catch that swallows a
  // RecordingError as a lost recording must never see this one.
  expect(thrown).toBeInstanceOf(SyntaxError)
  expect(thrown).not.toBeInstanceOf(RecordingError)
  expect(failures).toEqual([])
})

it("MAR-3023 C: the settled turn's tail ends when the next turn begins — a later loss never names it", () => {
  vi.useFakeTimers()
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  const emitter = providerEmitter()
  const streamThenRefuse = () => {
    const itemId = emitter.addAssistantMessage({ text: '', state: 'streaming' })
    refuse('refuse_item_update', 'UPDATE ON session_conversation_items')
    emitter.patchMessage(itemId, { text: 'late', state: 'streaming' })
    vi.advanceTimersByTime(CONVERSATION_PATCH_FLUSH_MS)
    getDatabase().exec('DROP TRIGGER refuse_item_update')
  }

  // Turn 1 carries dispatch-1 and settles.
  attachDispatch('dispatch-1')
  emitter.addUserMessage({ text: 'turn one' })
  emitter.patchSession({ status: 'running' })
  emitter.patchSession({ status: 'completed' })

  // Inside its tail, a late loss is still turn 1's...
  streamThenRefuse()
  expect(failures.map((failure) => failure.dispatchId)).toEqual(['dispatch-1'])

  // ...until the next turn begins (a turn no receipt holder dispatched).
  emitter.addUserMessage({ text: 'turn two' })
  emitter.patchSession({ status: 'running' })
  streamThenRefuse()
  expect(failures.map((failure) => failure.dispatchId)).toEqual(['dispatch-1'])
  // No fact, no note — and said loudly.
  expect(
    errors.mock.calls.some((call) =>
      String(call[0]).includes('with no accepted dispatch attached'),
    ),
  ).toBe(true)
  errors.mockRestore()
})

it('MAR-3023 D: an item add that fails after its statements keeps its raw error — nothing is announced', () => {
  const emitter = providerEmitter()
  attachDispatch('dispatch-1')
  // The turn capture's synchronous prologue runs inside the add, after both
  // statements landed: its throw is a capture bug, not a lost recording.
  service.setTurnCaptureService({
    setTimingListener: () => {},
    setDeltaEmitter: () => {},
    startTurn: () => {
      throw new Error('fixture capture prologue')
    },
  } as unknown as Parameters<SessionService['setTurnCaptureService']>[0])

  let thrown: unknown
  try {
    emitter.addUserMessage({ text: 'a turn' })
  } catch (error) {
    thrown = error
  }
  expect(thrown).toBeInstanceOf(Error)
  expect(thrown).not.toBeInstanceOf(RecordingError)
  expect((thrown as Error).message).toBe('fixture capture prologue')
  expect(failures).toEqual([])
})
