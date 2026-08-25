import { describe, expect, it } from 'vitest'
import type { TurnFileChange } from '@/entities/turn'
import {
  buildTurnFileChangeRows,
  findTurnFileChangeRow,
  findTurnFileChangeRowForSelection,
  TURN_ROOT_REPO_LABEL,
} from './turn-file-change-rows.pure'

function change(overrides: Partial<TurnFileChange> = {}): TurnFileChange {
  return {
    id: 'change-1',
    sessionId: 'session-1',
    turnId: 'turn-1',
    repoRoot: null,
    filePath: 'README.md',
    oldPath: null,
    status: 'modified',
    additions: 0,
    deletions: 0,
    diff: '@@ -1 +1 @@',
    truncated: false,
    binary: false,
    createdAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  }
}

describe('buildTurnFileChangeRows', () => {
  it('shows bare paths when the turn touched one repository', () => {
    const rows = buildTurnFileChangeRows([
      change({ id: 'a', filePath: 'src/a.ts' }),
      change({ id: 'b', filePath: 'src/b.ts' }),
    ])

    // Every local turn is this turn. Prefixing it would be inventing a
    // distinction the turn does not have.
    expect(rows.map((row) => row.treePath)).toEqual(['src/a.ts', 'src/b.ts'])
  })

  it('leaves a single non-root repository unprefixed too', () => {
    const rows = buildTurnFileChangeRows([
      change({ id: 'a', repoRoot: 'apps/web', filePath: 'src/a.ts' }),
      change({ id: 'b', repoRoot: 'apps/web', filePath: 'src/b.ts' }),
    ])

    expect(rows.map((row) => row.treePath)).toEqual(['src/a.ts', 'src/b.ts'])
  })

  it('prefixes every row once the turn spans more than one repository', () => {
    const rows = buildTurnFileChangeRows([
      change({ id: 'web', repoRoot: 'apps/web' }),
      change({ id: 'api', repoRoot: 'apps/api' }),
      change({ id: 'root', repoRoot: null }),
    ])

    // Without the prefix the tree keys all three as 'README.md' and draws one
    // row, leaving two of the three diffs unreachable (MAR-2589).
    expect(rows.map((row) => row.treePath)).toEqual([
      'apps/web/README.md',
      'apps/api/README.md',
      `${TURN_ROOT_REPO_LABEL}/README.md`,
    ])
    expect(new Set(rows.map((row) => row.treePath)).size).toBe(3)
  })

  it('keeps the stored path raw while normalising what the tree shows', () => {
    const rows = buildTurnFileChangeRows([
      change({ id: 'a', filePath: './src\\a.ts' }),
      change({ id: 'b', filePath: 'src/b.ts' }),
    ])

    // The tree normalises the paths it is handed, so a row whose treePath was
    // not normalised the same way would never match the path a click hands
    // back. The lookup the diff is fetched by stays the raw stored path.
    expect(rows[0].treePath).toBe('src/a.ts')
    expect(rows[0].filePath).toBe('./src\\a.ts')
  })
})

describe('findTurnFileChangeRow', () => {
  it('resolves a clicked tree path back to its repository and path', () => {
    const rows = buildTurnFileChangeRows([
      change({ id: 'web', repoRoot: 'apps/web' }),
      change({ id: 'api', repoRoot: 'apps/api' }),
    ])

    expect(findTurnFileChangeRow(rows, 'apps/api/README.md')).toMatchObject({
      repoRoot: 'apps/api',
      filePath: 'README.md',
    })
    expect(findTurnFileChangeRow(rows, 'apps/db/README.md')).toBeNull()
  })
})

describe('findTurnFileChangeRowForSelection', () => {
  it('tells two repositories apart at the same path', () => {
    const rows = buildTurnFileChangeRows([
      change({ id: 'web', repoRoot: 'apps/web' }),
      change({ id: 'api', repoRoot: 'apps/api' }),
    ])

    expect(
      findTurnFileChangeRowForSelection(rows, {
        repoRoot: 'apps/api',
        filePath: 'README.md',
      })?.treePath,
    ).toBe('apps/api/README.md')
  })

  it('does not mistake the working-directory root for a named repository', () => {
    const rows = buildTurnFileChangeRows([
      change({ id: 'root', repoRoot: null }),
      change({ id: 'web', repoRoot: 'apps/web' }),
    ])

    expect(
      findTurnFileChangeRowForSelection(rows, {
        repoRoot: null,
        filePath: 'README.md',
      })?.treePath,
    ).toBe(`${TURN_ROOT_REPO_LABEL}/README.md`)
  })

  it('has nothing to find without a selection', () => {
    expect(findTurnFileChangeRowForSelection([], null)).toBeNull()
  })
})
