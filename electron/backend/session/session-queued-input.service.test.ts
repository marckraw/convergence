import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { SessionQueuedInputService } from './session-queued-input.service'
import type { QueuedInputPatchEvent } from './session.types'

describe('SessionQueuedInputService', () => {
  let db: Database.Database
  let service: SessionQueuedInputService
  let events: QueuedInputPatchEvent[]

  beforeEach(() => {
    db = getDatabase()
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('project-1', 'Project', '/tmp/project')",
    ).run()
    db.prepare(
      `INSERT INTO sessions (
         id,
         context_kind,
         project_id,
         workspace_id,
         provider_id,
         model,
         effort,
         name,
         working_directory
       ) VALUES (?, 'project', 'project-1', null, 'test-provider', 'test-model', null, 'Session', '/tmp/project')`,
    ).run('session-1')

    events = []
    service = new SessionQueuedInputService(db, {
      idFactory: () => `queued-${events.length + 1}`,
      now: () => '2026-04-26T12:00:00.000Z',
    })
    service.setPatchListener((event) => events.push(event))
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  it('enqueues, lists, and emits an add patch event', () => {
    const item = service.enqueue(
      'session-1',
      {
        text: 'run this later',
        attachmentIds: ['attachment-1'],
      },
      'follow-up',
    )

    expect(item).toMatchObject({
      id: 'queued-1',
      sessionId: 'session-1',
      deliveryMode: 'follow-up',
      state: 'queued',
      text: 'run this later',
      attachmentIds: ['attachment-1'],
      skillSelections: [],
      createdAt: '2026-04-26T12:00:00.000Z',
      updatedAt: '2026-04-26T12:00:00.000Z',
    })
    expect(service.list('session-1')).toEqual([item])
    expect(events).toEqual([{ sessionId: 'session-1', op: 'add', item }])
  })

  it('cancels only queued inputs and hides them from the visible list', () => {
    const item = service.enqueue(
      'session-1',
      { text: 'cancel me' },
      'follow-up',
    )

    service.cancel(item.id)

    expect(service.list('session-1')).toEqual([])
    expect(
      db
        .prepare('SELECT state FROM session_queued_inputs WHERE id = ?')
        .get(item.id),
    ).toEqual({ state: 'cancelled' })
    expect(events.at(-1)).toMatchObject({
      sessionId: 'session-1',
      op: 'patch',
      item: { id: item.id, state: 'cancelled' },
    })
  })

  it('returns the oldest queued input', () => {
    service.enqueue('session-1', { text: 'first' }, 'follow-up')
    service.enqueue('session-1', { text: 'second' }, 'follow-up')
    service.patch('queued-1', 'failed', 'already failed')

    expect(service.nextQueued('session-1')).toMatchObject({
      id: 'queued-2',
      text: 'second',
      state: 'queued',
    })
  })

  it('recovers dispatching inputs as failed without emitting runtime patches', () => {
    const item = service.enqueue(
      'session-1',
      { text: 'dispatching' },
      'follow-up',
    )
    service.patch(item.id, 'dispatching')
    events = []

    service.recoverDispatching()

    expect(service.list('session-1')).toMatchObject([
      {
        id: item.id,
        state: 'failed',
        error: 'App restarted before this input was accepted.',
        updatedAt: '2026-04-26T12:00:00.000Z',
      },
    ])
    expect(events).toEqual([])
  })

  it('fails pending queued inputs for a session and emits patch events', () => {
    const queued = service.enqueue('session-1', { text: 'queued' }, 'follow-up')
    const dispatching = service.enqueue(
      'session-1',
      { text: 'dispatching' },
      'follow-up',
    )
    service.patch(dispatching.id, 'dispatching')
    events = []

    service.failPendingForSession('session-1', 'Provider stopped')

    expect(service.list('session-1')).toMatchObject([
      { id: queued.id, state: 'failed', error: 'Provider stopped' },
      { id: dispatching.id, state: 'failed', error: 'Provider stopped' },
    ])
    expect(events).toHaveLength(2)
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          op: 'patch',
          item: expect.objectContaining({
            id: queued.id,
            state: 'failed',
          }),
        }),
        expect.objectContaining({
          op: 'patch',
          item: expect.objectContaining({
            id: dispatching.id,
            state: 'failed',
          }),
        }),
      ]),
    )
  })
})
