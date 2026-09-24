import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type Database from 'better-sqlite3'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { ProviderRegistry } from '../provider/provider-registry'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import type { AttentionState } from '../provider/provider.types'
import { SessionService } from './session.service'
import { resolveAttentionRequestKind } from './session.pure'

/**
 * The "needs you" lookup (MAR-3396, MAR-3310 F4).
 *
 * A summary carries `attentionRequestKind` only while the conversation waits
 * on an approval or an input. The latest request row is read for that answer
 * and nothing else, so it is read only then, and a partial index makes the
 * read a seek instead of a walk over the whole transcript.
 */

const ATTENTION_INDEX = 'idx_session_conversation_items_attention_request'
const REQUEST_SQL = /kind IN \('approval-request', 'input-request'\)/
const BATCHED_SQL = /ROW_NUMBER\(\)/

type RequestKind = 'approval-request' | 'input-request'

interface SeedItem {
  kind: string
  payload: unknown
}

describe('SessionService — the needs-you lookup (MAR-3396)', () => {
  let db: Database.Database
  let service: SessionService
  let tempDir: string
  let projectId: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'convergence-attention-lookup-'))
    const repoPath = join(tempDir, 'repo')
    mkdirSync(repoPath)
    mkdirSync(join(repoPath, '.git'))
    // The real schema on a real file, as the app opens it.
    db = getDatabase(join(tempDir, 'convergence.db'))
    service = new SessionService(
      db,
      new LocalExecutionHost(new ProviderRegistry()),
      join(tempDir, 'global-sessions'),
    )
    projectId = 'attention-project'
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES (?, 'attention', ?)",
    ).run(projectId, repoPath)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    closeDatabase()
    resetDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  function createSession(name: string, attention: AttentionState): string {
    const { id } = service.create({
      projectId,
      workspaceId: null,
      providerId: 'test-provider',
      model: 'test-model',
      effort: null,
      name,
    })
    db.prepare('UPDATE sessions SET attention = ? WHERE id = ?').run(
      attention,
      id,
    )
    return id
  }

  function seedItems(sessionId: string, items: SeedItem[]): void {
    const insert = db.prepare(
      `INSERT INTO session_conversation_items (
         id, session_id, sequence, kind, state, payload_json,
         created_at, updated_at
       )
       VALUES (?, ?, ?, ?, 'complete', ?, ?, ?)`,
    )
    const timestamp = new Date().toISOString()
    db.transaction(() => {
      items.forEach((item, index) => {
        const sequence = index + 1
        insert.run(
          `${sessionId}-${sequence}`,
          sessionId,
          sequence,
          item.kind,
          JSON.stringify(item.payload),
          timestamp,
          timestamp,
        )
      })
    })()
  }

  const message = (n: number): SeedItem => ({
    kind: 'message',
    payload: { text: `message ${n}` },
  })
  const request = (kind: RequestKind, requestKind?: string): SeedItem => ({
    kind,
    payload: requestKind ? { request: { kind: requestKind } } : {},
  })
  const messages = (count: number): SeedItem[] =>
    Array.from({ length: count }, (_, n) => message(n))

  /**
   * Every SQL text `db.prepare` receives while `act` runs. The artifact the
   * service emits, not what a test imagines it emits.
   */
  function preparedDuring(act: () => void): string[] {
    const prepared: string[] = []
    const original = db.prepare.bind(db)
    const spy = vi.spyOn(db, 'prepare').mockImplementation(((sql: string) => {
      prepared.push(sql)
      return original(sql)
    }) as typeof db.prepare)
    try {
      act()
    } finally {
      spy.mockRestore()
    }
    return prepared
  }

  function planOf(sql: string, params: unknown[]): string[] {
    return (
      db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as {
        detail: string
      }[]
    ).map((step) => step.detail)
  }

  /**
   * The answer the code gave before MAR-3396: the latest request row by
   * sequence, read unconditionally, then handed to the pure resolver. Walked
   * here in JavaScript over every row, so no index and no guard can shape it.
   */
  function referenceKind(sessionId: string, attention: AttentionState) {
    const rows = db
      .prepare(
        'SELECT kind, payload_json, sequence FROM session_conversation_items WHERE session_id = ?',
      )
      .all(sessionId) as {
      kind: string
      payload_json: string
      sequence: number
    }[]
    const latest = rows
      .filter(
        (row) =>
          row.kind === 'approval-request' || row.kind === 'input-request',
      )
      .sort((a, b) => b.sequence - a.sequence)[0]
    return resolveAttentionRequestKind(
      { attention },
      latest
        ? {
            kind: latest.kind as RequestKind,
            payload_json: latest.payload_json,
          }
        : null,
    )
  }

  describe('R1: not read when not needed', () => {
    it.each<AttentionState>(['none', 'finished', 'failed'])(
      'a single summary whose attention is %s issues zero attention-row reads',
      (attention) => {
        const id = createSession(`quiet ${attention}`, attention)
        // Requests on record, so an unconditional read would find something.
        seedItems(id, [
          message(1),
          request('approval-request'),
          request('input-request', 'plan'),
          message(2),
        ])

        let byId: ReturnType<SessionService['getById']> = null
        let summary: ReturnType<SessionService['getSummaryById']> = null
        const prepared = preparedDuring(() => {
          byId = service.getById(id)
          summary = service.getSummaryById(id)
        })

        // Mutation: call `readAttentionRequestRow` unconditionally in
        // `buildSessionSummary` -> two request reads here, red.
        expect(prepared.filter((sql) => REQUEST_SQL.test(sql))).toEqual([])
        expect(summary).not.toBeNull()
        expect(byId).not.toBeNull()
        expect(summary!.attentionRequestKind).toBeUndefined()
        expect(byId!.attentionRequestKind).toBeUndefined()
      },
    )

    it('the list path issues zero reads when nothing waits on the user', () => {
      for (const attention of ['none', 'finished', 'failed'] as const) {
        const id = createSession(`list ${attention}`, attention)
        seedItems(id, [request('approval-request'), message(1)])
      }

      const prepared = preparedDuring(() => {
        service.getAllSummaries()
        service.getSummariesByProjectId(projectId)
      })

      expect(prepared.filter((sql) => REQUEST_SQL.test(sql))).toEqual([])
    })

    it.each<[AttentionState, RequestKind, string | undefined, string]>([
      ['needs-approval', 'approval-request', undefined, 'approval'],
      ['needs-input', 'input-request', 'plan', 'plan'],
      ['needs-input', 'input-request', 'form', 'form'],
    ])(
      'a single summary whose attention is %s still reads and resolves (%s → %s)',
      (attention, kind, requestKind, expected) => {
        const id = createSession(`waiting ${expected}`, attention)
        seedItems(id, [message(1), request(kind, requestKind), message(2)])

        let summary: ReturnType<SessionService['getSummaryById']> = null
        const prepared = preparedDuring(() => {
          summary = service.getSummaryById(id)
        })

        expect(prepared.filter((sql) => REQUEST_SQL.test(sql))).toHaveLength(1)
        expect(summary!.attentionRequestKind).toBe(expected)
      },
    )
  })

  describe('R2: the index is used, on the plan SQLite picks', () => {
    /** The two request reads exactly as the service emits them. */
    function captureRequestSql(sessionId: string): {
      single: string
      batched: string
    } {
      const single = preparedDuring(() =>
        service.getSummaryById(sessionId),
      ).find((sql) => REQUEST_SQL.test(sql) && !BATCHED_SQL.test(sql))
      const batched = preparedDuring(() => service.getAllSummaries()).find(
        (sql) => REQUEST_SQL.test(sql) && BATCHED_SQL.test(sql),
      )
      expect(single).toBeDefined()
      expect(batched).toBeDefined()
      return { single: single!, batched: batched! }
    }

    it('the schema carries the partial index', () => {
      const row = db
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?",
        )
        .get(ATTENTION_INDEX) as { sql: string } | undefined

      // Mutation: drop the CREATE INDEX from SCHEMA -> undefined, red.
      expect(row?.sql).toMatch(
        /WHERE kind IN \('approval-request', 'input-request'\)/,
      )
    })

    it('adversarial: 5,000 non-request items and one request at the start — both reads seek the partial index', () => {
      const heavy = createSession('heavy', 'needs-approval')
      seedItems(heavy, [request('approval-request'), ...messages(5_000)])
      // A second session so the index is not trivially the whole table.
      const other = createSession('other', 'needs-input')
      seedItems(other, [...messages(200), request('input-request', 'form')])

      const { single, batched } = captureRequestSql(heavy)

      const singlePlan = planOf(single, [heavy])
      const batchedPlan = planOf(batched, [heavy, other])

      // Mutation: drop the index -> SQLite walks the (session_id, sequence)
      // index instead, and neither plan names this one, red.
      expect(singlePlan.join('\n')).toContain(ATTENTION_INDEX)
      expect(batchedPlan.join('\n')).toContain(ATTENTION_INDEX)

      // And the answers through those plans are the ones the rows hold.
      expect(service.getSummaryById(heavy)!.attentionRequestKind).toBe(
        'approval',
      )
      const all = service.getAllSummaries()
      expect(all.find((s) => s.id === heavy)!.attentionRequestKind).toBe(
        'approval',
      )
      expect(all.find((s) => s.id === other)!.attentionRequestKind).toBe('form')
    })

    it('the plan still names the index after ANALYZE has seen the skew', () => {
      const heavy = createSession('heavy analysed', 'needs-approval')
      seedItems(heavy, [request('approval-request'), ...messages(5_000)])
      const other = createSession('other analysed', 'needs-input')
      seedItems(other, [request('input-request', 'plan'), ...messages(50)])
      const { single, batched } = captureRequestSql(heavy)

      db.exec('ANALYZE')

      expect(planOf(single, [heavy]).join('\n')).toContain(ATTENTION_INDEX)
      expect(planOf(batched, [heavy, other]).join('\n')).toContain(
        ATTENTION_INDEX,
      )
    })
  })

  describe('R3: same answers', () => {
    it('requests at the start, the middle and the end, plus none — both paths answer as before', () => {
      const cases: Array<{
        name: string
        attention: AttentionState
        items: SeedItem[]
      }> = [
        {
          name: 'start approval',
          attention: 'needs-approval',
          items: [request('approval-request'), ...messages(300)],
        },
        {
          name: 'start input choice',
          attention: 'needs-input',
          items: [request('input-request', 'choice'), ...messages(300)],
        },
        {
          name: 'middle plan over an older approval',
          attention: 'needs-input',
          items: [
            request('approval-request'),
            ...messages(150),
            request('input-request', 'plan'),
            ...messages(150),
          ],
        },
        {
          name: 'middle approval over an older form',
          attention: 'needs-approval',
          items: [
            ...messages(100),
            request('input-request', 'form'),
            ...messages(100),
            request('approval-request'),
            ...messages(100),
          ],
        },
        {
          name: 'middle form over an older text',
          attention: 'needs-input',
          items: [
            ...messages(50),
            request('input-request', 'text'),
            ...messages(50),
            request('input-request', 'form'),
            ...messages(50),
          ],
        },
        {
          name: 'end url',
          attention: 'needs-input',
          items: [...messages(300), request('input-request', 'url')],
        },
        {
          name: 'end text',
          attention: 'needs-input',
          items: [...messages(300), request('input-request', 'text')],
        },
        {
          name: 'none on record, waiting on approval',
          attention: 'needs-approval',
          items: messages(300),
        },
        {
          name: 'none on record, waiting on input',
          attention: 'needs-input',
          items: messages(300),
        },
        {
          name: 'empty, waiting on input',
          attention: 'needs-input',
          items: [],
        },
        {
          name: 'requests on record, not waiting',
          attention: 'none',
          items: [request('approval-request'), ...messages(10)],
        },
        {
          name: 'requests on record, finished',
          attention: 'finished',
          items: [...messages(10), request('input-request', 'plan')],
        },
        {
          name: 'requests on record, failed',
          attention: 'failed',
          items: [request('input-request', 'form')],
        },
      ]

      const expected = new Map<string, string | null>()
      for (const entry of cases) {
        const id = createSession(entry.name, entry.attention)
        seedItems(id, entry.items)
        expected.set(id, referenceKind(id, entry.attention))
      }

      // The reference is not a constant: the fixture exercises every answer.
      expect(new Set(expected.values())).toEqual(
        new Set(['approval', 'question', 'plan', 'form', 'url', 'input', null]),
      )

      const listed = new Map(
        service.getAllSummaries().map((s) => [s.id, s.attentionRequestKind]),
      )
      for (const [id, kind] of expected) {
        expect(service.getSummaryById(id)!.attentionRequestKind ?? null).toBe(
          kind,
        )
        expect(service.getById(id)!.attentionRequestKind ?? null).toBe(kind)
        expect(listed.get(id) ?? null).toBe(kind)
      }
    })
  })
})
