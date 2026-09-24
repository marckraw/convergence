import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { ProviderRegistry } from '../provider/provider-registry'
import { SessionService } from './session.service'
import {
  conversationPrefixFixtures,
  prefixFixtureItem,
} from '../../../src/entities/session/conversation-prefix.fixtures'
import { summarizeConversationPrefix } from '../../../src/entities/session/conversation-prefix.pure'
import type { ConversationFactItem } from '../../../src/entities/session/conversation-prefix.pure'

describe('main conversation prefix on the real schema', () => {
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
  it.each(Object.entries(conversationPrefixFixtures()))(
    '%s equals the pure prefix at representative splits',
    (_, items) => {
      insert(items)
      for (const k of new Set([
        0,
        1,
        3,
        Math.floor(items.length / 2),
        Math.max(0, items.length - 300),
        items.length - 1,
        items.length,
      ])) {
        const prefix = items.slice(0, k)
        const before = items[k]?.sequence ?? items.at(-1)!.sequence + 1
        expect(service.getConversationPrefix(id, before), `split ${k}`).toEqual(
          summarizeConversationPrefix(prefix),
        )
      }
    },
  )
  it('malformed completed payloads neither break index writes nor replace the latest reply', () => {
    const items = [1, 2].map((sequence) =>
      prefixFixtureItem(sequence, 'turn', {
        kind: 'message',
        actor: 'assistant',
        text: 'reply',
      }),
    )
    insert(items)
    db.prepare(
      "UPDATE session_conversation_items SET payload_json = '{' WHERE session_id = ? AND sequence = 2",
    ).run(id)
    expect(service.getConversationPrefix(id, 3).latestCompletedReplyId).toBe(
      'item-1',
    )
  })
  it('summarizes the prefix of 50000 items with newest 300 excluded within 20ms', () => {
    const items = Array.from({ length: 50000 }, (_, i) =>
      prefixFixtureItem(
        i + 1,
        `turn-${Math.floor(i / 1000)}`,
        i === 1
          ? { kind: 'message', actor: 'assistant', text: 'last reply' }
          : {},
      ),
    )
    insert(items)
    const expected = summarizeConversationPrefix(items.slice(0, 49700))
    const samples: number[] = []
    for (let i = 0; i < 7; i++) {
      const start = performance.now()
      const result = service.getConversationPrefix(id, 49701)
      samples.push(performance.now() - start)
      expect(result).toEqual(expected)
    }
    const median = [...samples].sort((a, b) => a - b)[3]
    process.stdout.write(
      `MAR-3408 prefix 50000/newest300 ms ${JSON.stringify({ samples, median })}\n`,
    )
    expect(median).toBeLessThanOrEqual(20)
  })
})
