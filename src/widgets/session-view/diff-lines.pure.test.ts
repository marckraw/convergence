import { describe, expect, it } from 'vitest'
import {
  parseUnifiedDiff,
  selectDiffLineRange,
  summarizeSelectedDiffLines,
} from './diff-lines.pure'

describe('parseUnifiedDiff', () => {
  it('returns no rows for an empty diff', () => {
    expect(parseUnifiedDiff('')).toEqual([])
  })

  it('parses file headers, hunk headers, additions, deletions, and context', () => {
    const rows = parseUnifiedDiff(`diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -10,4 +10,5 @@ export function run() {
 const before = true
-const oldValue = 1
+const newValue = 2
+const extra = 3
 return before
 }`)

    expect(rows.map((row) => row.kind)).toEqual([
      'file',
      'meta',
      'file',
      'file',
      'hunk',
      'context',
      'delete',
      'add',
      'add',
      'context',
      'context',
    ])
    expect(rows[5]).toMatchObject({
      kind: 'context',
      oldLine: 10,
      newLine: 10,
    })
    expect(rows[6]).toMatchObject({
      kind: 'delete',
      oldLine: 11,
      newLine: null,
    })
    expect(rows[7]).toMatchObject({
      kind: 'add',
      oldLine: null,
      newLine: 11,
    })
    expect(rows[8]).toMatchObject({
      kind: 'add',
      oldLine: null,
      newLine: 12,
    })
    expect(rows[10]).toMatchObject({
      kind: 'context',
      oldLine: 13,
      newLine: 14,
    })
  })

  it('treats no-newline markers as metadata without moving line counters', () => {
    const rows = parseUnifiedDiff(`@@ -1 +1 @@
-old
\\ No newline at end of file
+new`)

    expect(rows[1]).toMatchObject({ kind: 'delete', oldLine: 1 })
    expect(rows[2]).toMatchObject({
      kind: 'meta',
      oldLine: null,
      newLine: null,
    })
    expect(rows[3]).toMatchObject({ kind: 'add', newLine: 1 })
  })
})

describe('selectDiffLineRange', () => {
  it('selects a contiguous range between anchor and target', () => {
    const rows = parseUnifiedDiff(`@@ -1,3 +1,3 @@
 a
-b
+c`)

    expect(
      selectDiffLineRange({
        lines: rows,
        anchorId: rows[1].id,
        targetId: rows[3].id,
      }),
    ).toEqual([rows[1].id, rows[2].id, rows[3].id])
  })
})

describe('summarizeSelectedDiffLines', () => {
  it('summarizes selected old and new line ranges', () => {
    const rows = parseUnifiedDiff(`@@ -10,3 +20,4 @@
 context
-old
+new
+extra`)

    expect(
      summarizeSelectedDiffLines({
        lines: rows,
        selectedIds: [rows[1].id, rows[2].id, rows[3].id, rows[4].id],
      }),
    ).toEqual({
      count: 4,
      oldStartLine: 10,
      oldEndLine: 11,
      newStartLine: 20,
      newEndLine: 22,
    })
  })
})
