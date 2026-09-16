import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { ProviderRegistry } from '../provider/provider-registry'
import { HandoffRefusedError } from '../provider/provider-account-handoff.pure'
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
