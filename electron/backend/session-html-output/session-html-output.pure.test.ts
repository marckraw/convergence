import { describe, expect, it } from 'vitest'
import {
  defaultHtmlOutputRelativePath,
  normalizeSessionHtmlRelativePath,
  rowToSessionHtmlOutput,
} from './session-html-output.pure'

describe('session-html-output.pure', () => {
  it('maps database rows to API objects', () => {
    expect(
      rowToSessionHtmlOutput({
        id: 'output-1',
        session_id: 'session-1',
        source_item_id: 'item-1',
        output_kind: 'snapshot',
        status: 'ready',
        relative_path: 'snapshots/item-1.html',
        size_bytes: 120,
        error: null,
        created_at: '2026-06-01T00:00:00.000Z',
        updated_at: '2026-06-01T00:00:01.000Z',
      }),
    ).toEqual({
      id: 'output-1',
      sessionId: 'session-1',
      sourceItemId: 'item-1',
      kind: 'snapshot',
      status: 'ready',
      relativePath: 'snapshots/item-1.html',
      sizeBytes: 120,
      error: null,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:01.000Z',
    })
  })

  it('builds default living and snapshot paths', () => {
    expect(defaultHtmlOutputRelativePath('living')).toBe('index.html')
    expect(defaultHtmlOutputRelativePath('snapshot', 'turn:1/item')).toBe(
      'snapshots/turn-1-item.html',
    )
  })

  it('normalizes safe relative html paths', () => {
    expect(normalizeSessionHtmlRelativePath('snapshots/../index.html')).toBe(
      'index.html',
    )
  })

  it('rejects unsafe relative paths', () => {
    expect(() => normalizeSessionHtmlRelativePath('../escape.html')).toThrow(
      /stay within the session/,
    )
    expect(() => normalizeSessionHtmlRelativePath('/tmp/escape.html')).toThrow(
      /must not be absolute/,
    )
    expect(() => normalizeSessionHtmlRelativePath('note.txt')).toThrow(
      /must end with .html/,
    )
    expect(() =>
      normalizeSessionHtmlRelativePath('snapshots\\turn.html'),
    ).toThrow(/forward slashes/)
  })
})
