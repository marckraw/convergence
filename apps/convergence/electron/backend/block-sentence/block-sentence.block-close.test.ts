import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OneShotInput } from '../provider/provider.types'
import type { ConversationItem } from '../session/conversation-item.types'
import {
  BLOCK_SENTENCE_ATTEMPTS_MIGRATION_KEY,
  migrateBlockSentenceAttempts,
  migrateBlockSentences,
} from './block-sentence-migration.service'
import { BlockSentenceAttemptRepository } from './block-sentence-attempt.repository'
import { BLOCK_SENTENCE_PROMPT } from './block-sentence.prompt'
import { BlockSentenceRepository } from './block-sentence.repository'
import { BlockSentenceService } from './block-sentence.service'

/**
 * The queue behind a running turn (MAR-3422 CV3d R2-R6): a live turn is
 * recorded item by item, and the service is told what the session service
 * tells it -- an item landed in a running turn, and the turn ended. The
 * tables are the real ones, on a bare database.
 */

function bareDatabase() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE sessions (id TEXT PRIMARY KEY);
    INSERT INTO sessions (id) VALUES ('s1'), ('s2');`)
  migrateBlockSentences(db)
  migrateBlockSentenceAttempts(db)
  return db
}

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => (resolve = done))
  return { promise, resolve }
}

function harness(
  options: {
    enabled?: () => boolean
    answer?: (input: OneShotInput) => Promise<{ text: string }>
  } = {},
) {
  const db = bareDatabase()
  const repository = new BlockSentenceRepository(db)
  const attempts = new BlockSentenceAttemptRepository(db)
  const items: ConversationItem[] = []
  const active = new Set(['s1/t1', 's2/t1'])
  let sequence = 0
  let tick = 0
  const oneShot = vi.fn(
    options.answer ?? (async () => ({ text: 'Read three files.' })),
  )
  const turnItems = vi.fn((sessionId: string, turnId: string) =>
    items.filter((i) => i.sessionId === sessionId && i.turnId === turnId),
  )
  const turnItemsSince = vi.fn(
    (sessionId: string, turnId: string, after: number) =>
      turnItems(sessionId, turnId).filter((i) => i.sequence > after),
  )
  const service = new BlockSentenceService({
    repository,
    attempts,
    turnItems,
    turnItemsSince,
    isTurnActive: (sessionId, turnId) => active.has(`${sessionId}/${turnId}`),
    isEnabled: options.enabled ?? (() => true),
    model: () => ({ oneShot }),
    workingDirectory: () => '/tmp/block-sentence-scratch',
    promptText: BLOCK_SENTENCE_PROMPT,
    onChanged: () => {},
    // A clock that moves on every read: an order of stamps is an order of
    // events.
    now: () => new Date(Date.UTC(2026, 8, 25, 12, 0, 0, tick++)).toISOString(),
    requestId: () => 'req',
  })

  function record(sessionId: string, draft: Record<string, unknown>) {
    sequence += 1
    const item = {
      id: `${sessionId}-${sequence}`,
      sessionId,
      sequence,
      turnId: 't1',
      agentRunId: null,
      state: 'complete',
      createdAt: '2026-09-25T00:00:00.000Z',
      updatedAt: '2026-09-25T00:00:00.000Z',
      providerMeta: {
        providerId: 'claude-code',
        providerItemId: null,
        providerEventType: 'tool-use',
      },
      ...draft,
    } as ConversationItem
    items.push(item)
    service.itemRecorded(sessionId, 't1', item)
    return item.id
  }

  return {
    db,
    service,
    oneShot,
    turnItems,
    turnItemsSince,
    repository,
    attempts,
    /** Three reads under `folder`; the block's first member id. */
    reads(folder: string, sessionId = 's1') {
      const first = record(sessionId, {
        kind: 'tool-call',
        toolName: 'Read',
        inputText: JSON.stringify({ file_path: `${folder}/a.ts` }),
      })
      for (const name of ['b', 'c'])
        record(sessionId, {
          kind: 'tool-call',
          toolName: 'Read',
          inputText: JSON.stringify({ file_path: `${folder}/${name}.ts` }),
        })
      return first
    },
    say(sessionId = 's1') {
      return record(sessionId, {
        kind: 'message',
        actor: 'assistant',
        text: 'next',
      })
    },
    end(sessionId = 's1') {
      active.delete(`${sessionId}/t1`)
      service.turnEnded(sessionId, 't1')
    },
    /** Which folder each request was about, in call order. */
    askedFolders() {
      return oneShot.mock.calls.map(
        ([input]) => /"file_path\\?":\\?"([^/]+)\//.exec(input.prompt)?.[1],
      )
    },
  }
}

let h: ReturnType<typeof harness>
afterEach(async () => {
  await h?.service.whenIdle()
  h?.db.close()
})

describe('the turn end asks for what is left, nothing twice (R2)', () => {
  it('a call that failed mid-turn is asked once more at turn end, never more', async () => {
    let calls = 0
    h = harness({
      answer: async () => {
        calls += 1
        if (calls === 1) throw new Error('codex oneShot timed out')
        return { text: 'Read three files.' }
      },
    })
    h.say()
    const failed = h.reads('fail')
    h.say()
    await h.service.whenIdle()
    h.reads('kept')
    h.say()
    await h.service.whenIdle()
    h.say()
    await h.service.whenIdle()
    h.end()
    await h.service.whenIdle()

    expect(h.askedFolders()).toEqual(['fail', 'kept', 'fail'])
    expect(h.repository.has('s1', failed)).toBe(true)
    expect(
      h.attempts
        .list('s1')
        .filter((row) => row.firstItemId === failed)
        .map((row) => [row.trigger, row.outcome]),
    ).toEqual([
      ['block-closed', 'call-failed'],
      ['turn-ended', 'stored'],
    ])
  })
})

describe('every request leaves a row (R3)', () => {
  it('kept, refused and failed: three rows, stamped in order, never an error message', async () => {
    const answers: Array<string | Error> = [
      'Read three files under kept.',
      'Read lib/secrets.ts.',
      new Error('codex oneShot timed out reading /Users/someone/.codex/x'),
    ]
    h = harness({
      answer: async () => {
        const next = answers.shift()!
        if (next instanceof Error) throw next
        return { text: next }
      },
    })
    h.say()
    const kept = h.reads('kept')
    h.say()
    const refused = h.reads('refused')
    h.say()
    const failed = h.reads('failed')
    h.say()
    await h.service.whenIdle()

    const rows = h.attempts.list('s1')
    expect(
      rows.map((row) => [
        row.firstItemId,
        row.trigger,
        row.outcome,
        row.refusedText,
        row.reasons,
      ]),
    ).toEqual([
      [kept, 'block-closed', 'stored', null, null],
      [
        refused,
        'block-closed',
        'refused',
        'Read lib/secrets.ts.',
        '["invented-path"]',
      ],
      [failed, 'block-closed', 'call-failed', null, 'timeout'],
    ])
    for (const row of rows) {
      expect(row.queuedAt <= row.startedAt).toBe(true)
      expect(row.startedAt <= row.finishedAt).toBe(true)
    }
    // One at a time: a request starts only after the one before it ended,
    // so the second and third waited in the queue.
    expect(rows[1]!.startedAt >= rows[0]!.finishedAt).toBe(true)
    expect(rows[2]!.startedAt >= rows[1]!.finishedAt).toBe(true)
    expect(rows[2]!.queuedAt < rows[2]!.startedAt).toBe(true)
    expect(JSON.stringify(rows)).not.toContain('/Users')
  })

  it('a refused line is capped at 500 characters', async () => {
    h = harness({ answer: async () => ({ text: `${'word '.repeat(200)}.` }) })
    h.say()
    h.reads('src')
    h.say()
    await h.service.whenIdle()
    const [row] = h.attempts.list('s1')
    expect(row!.outcome).toBe('refused')
    expect(row!.refusedText).toHaveLength(500)
  })

  it('goes with its session', async () => {
    h = harness()
    h.say()
    h.reads('src')
    h.say()
    await h.service.whenIdle()
    expect(h.attempts.list('s1')).toHaveLength(1)
    h.db.prepare("DELETE FROM sessions WHERE id = 's1'").run()
    expect(h.attempts.list('s1')).toEqual([])
  })
})

describe('the attempts table migration (R3)', () => {
  it('leaves neither table nor marker when the marker write is refused; the next start builds both', () => {
    const db = new Database(':memory:')
    try {
      db.exec(`CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE sessions (id TEXT PRIMARY KEY);`)
      db.exec(
        "CREATE TRIGGER refuse BEFORE INSERT ON app_state BEGIN SELECT RAISE(ABORT, 'refused'); END",
      )
      expect(() => migrateBlockSentenceAttempts(db)).toThrow('refused')
      const table = () =>
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE name='conversation_block_sentence_attempts'",
          )
          .get()
      const marker = () =>
        db
          .prepare('SELECT value FROM app_state WHERE key = ?')
          .get(BLOCK_SENTENCE_ATTEMPTS_MIGRATION_KEY)
      expect(table()).toBeUndefined()
      expect(marker()).toBeUndefined()

      db.exec('DROP TRIGGER refuse')
      migrateBlockSentenceAttempts(db)
      expect(table()).toEqual({ name: 'conversation_block_sentence_attempts' })
      expect(marker()).toEqual({ value: '1' })
      // Once: a second start keeps what is there.
      migrateBlockSentenceAttempts(db)
    } finally {
      db.close()
    }
  })
})

describe('main’s work per boundary stays small (R4)', () => {
  it('five boundaries while a request is in flight lead to one more read, not five', async () => {
    const asked = deferred()
    const release = deferred()
    let calls = 0
    h = harness({
      answer: async () => {
        calls += 1
        if (calls === 1) {
          asked.resolve()
          await release.promise
        }
        return { text: 'Read three files.' }
      },
    })
    h.reads('first')
    h.say()
    await asked.promise
    expect(h.turnItemsSince).toHaveBeenCalledTimes(1)

    for (let boundary = 0; boundary < 5; boundary += 1) {
      h.reads(`later${boundary}`)
      h.say()
    }
    release.resolve()
    await h.service.whenIdle()

    expect(h.turnItemsSince).toHaveBeenCalledTimes(2)
    // The one read still found every block those boundaries closed.
    expect(h.oneShot).toHaveBeenCalledTimes(6)
  })
})

describe('still one request in flight, app-wide (R5)', () => {
  it('two sessions close blocks at the same moment: the second request starts after the first settles', async () => {
    const events: string[] = []
    h = harness({
      answer: async (input) => {
        const folder = /"file_path\\?":\\?"([^/]+)\//.exec(input.prompt)?.[1]
        events.push(`start ${folder}`)
        await new Promise((resolve) => setTimeout(resolve, 5))
        events.push(`end ${folder}`)
        return { text: 'Read three files.' }
      },
    })
    h.reads('one', 's1')
    h.reads('two', 's2')
    h.say('s1')
    h.say('s2')
    await h.service.whenIdle()
    expect(events).toEqual(['start one', 'end one', 'start two', 'end two'])
  })
})

describe('his switch and quitting still rule (R6)', () => {
  it('Off: no request, no attempt row, not even a read, on either trigger', async () => {
    h = harness({ enabled: () => false })
    h.say()
    h.reads('src')
    h.say()
    h.reads('src')
    await h.service.whenIdle()
    h.end()
    await h.service.whenIdle()

    expect(h.turnItemsSince).not.toHaveBeenCalled()
    expect(h.turnItems).not.toHaveBeenCalled()
    expect(h.oneShot).not.toHaveBeenCalled()
    expect(h.attempts.list('s1')).toEqual([])
  })

  it('after stop(): no request, nothing stored, not even the answer already in flight', async () => {
    const asked = deferred()
    const release = deferred()
    h = harness({
      answer: async () => {
        asked.resolve()
        await release.promise
        return { text: 'Read three files.' }
      },
    })
    h.reads('first')
    h.say()
    await asked.promise
    h.service.stop()
    release.resolve()
    await h.service.whenIdle()

    h.reads('after')
    h.say()
    h.end()
    await h.service.whenIdle()

    expect(h.oneShot).toHaveBeenCalledTimes(1)
    expect(h.repository.list('s1')).toEqual([])
    expect(h.attempts.list('s1')).toEqual([])
  })
})
