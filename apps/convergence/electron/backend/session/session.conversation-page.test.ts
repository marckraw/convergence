import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { ProviderRegistry } from '../provider/provider-registry'
import { SessionService } from './session.service'
import { prefixFixtureItem } from '../../../src/entities/session/conversation-prefix.fixtures'
import { summarizeConversationPrefix } from '../../../src/entities/session/conversation-prefix.pure'
import type { ConversationFactItem } from '../../../src/entities/session/conversation-prefix.pure'

describe('MAR-3398 conversation pages on the real schema', () => {
  let temp: string
  let db: Database.Database
  let service: SessionService
  let id: string
  beforeEach(() => {
    temp = mkdtempSync(join(tmpdir(), 'convergence-prefix-'))
    const repo = join(temp, 'repo')
    mkdirSync(join(repo, '.git'), { recursive: true })
    db = getDatabase(join(temp, 'test.db'))
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('prefix', 'prefix', ?)",
    ).run(repo)
    service = new SessionService(
      db,
      new LocalExecutionHost(new ProviderRegistry()),
      join(temp, 'sessions'),
    )
    id = service.create({
      projectId: 'prefix',
      workspaceId: null,
      providerId: 'test',
      model: null,
      effort: null,
      name: 'prefix',
    }).id
  })
  afterEach(() => {
    closeDatabase()
    resetDatabase()
    rmSync(temp, { recursive: true, force: true })
  })
  function insert(items: ConversationFactItem[]) {
    const stmt =
      db.prepare(`INSERT INTO session_conversation_items (id, session_id, sequence, turn_id, kind, state, payload_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    db.transaction(() => {
      for (const item of items)
        stmt.run(
          item.id,
          id,
          item.sequence,
          item.turnId,
          item.kind,
          item.state,
          JSON.stringify(item),
          item.createdAt,
          item.updatedAt,
        )
    })()
  }
  it('R1 newest 300 of 5000 and every older keyset page have the exact prefix; SQL stays bounded under ANALYZE', () => {
    const items = Array.from({ length: 5000 }, (_, index) =>
      prefixFixtureItem(index + 1, `turn-${Math.floor(index / 17)}`, {
        kind: 'message',
        actor: 'assistant',
        text: `item ${index}`,
      }),
    )
    insert(items)
    db.exec('ANALYZE')
    const prepare = vi.spyOn(db, 'prepare')
    const page = service.getConversationPage(id)
    expect(page.items.map((item) => item.id)).toEqual(
      items.slice(4700).map((item) => item.id),
    )
    expect(page.hasOlder).toBe(true)
    expect(page.oldestSequence).toBe(4701)
    expect(page.prefix).toEqual(
      summarizeConversationPrefix(items.slice(0, 4700)),
    )
    const sql = prepare.mock.calls
      .map(([sql]) => sql)
      .find((sql) => sql.includes('SELECT items.*'))!
    expect(sql).not.toMatch(/OFFSET/i)
    expect(sql).toMatch(/ORDER BY items.sequence DESC LIMIT \?/)
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(id, 301) as {
      detail: string
    }[]
    expect(plan.map((row) => row.detail).join('\n')).not.toMatch(/TEMP B-TREE/)
    expect(plan[0]?.detail).toMatch(
      /SEARCH items USING INDEX .*\(session_id=\?\)/,
    )
    const older = service.getConversationPage(id, {
      limit: 300,
      beforeSequence: 4701,
    })
    expect(older.items.map((item) => item.id)).toEqual(
      items.slice(4400, 4700).map((item) => item.id),
    )
    expect(older.prefix).toEqual(
      summarizeConversationPrefix(items.slice(0, 4400)),
    )
    const first = service.getConversationPage(id, {
      limit: 300,
      beforeSequence: 101,
    })
    expect(first.items).toHaveLength(100)
    expect(first.hasOlder).toBe(false)
    expect(first.prefix).toEqual(summarizeConversationPrefix([]))
    prepare.mockRestore()
  })
  it('R4 pins an unanswered approval 1000 items back on every page and keeps the cursor on the contiguous window', () => {
    insert(
      Array.from({ length: 1300 }, (_, index) =>
        prefixFixtureItem(index + 1, 'turn', {
          kind: 'message',
          actor: 'assistant',
          text: 'x',
        }),
      ),
    )
    db.prepare(
      "UPDATE session_conversation_items SET kind='approval-request', payload_json=? WHERE session_id=? AND sequence=1",
    ).run(JSON.stringify({ description: 'Allow?', resolution: 'pending' }), id)
    const page = service.getConversationPage(id)
    expect(page.items[0]).toMatchObject({
      id: 'item-1',
      kind: 'approval-request',
      resolution: 'pending',
    })
    expect(page.items).toHaveLength(301)
    expect(page.oldestSequence).toBe(1001)
    const older = service.getConversationPage(id, {
      limit: 300,
      beforeSequence: 1001,
    })
    expect(older.items[0].id).toBe('item-1')
    expect(older.oldestSequence).toBe(701)
    const full = service.getConversation(id)
    expect(full).toHaveLength(1300)
  })
})
