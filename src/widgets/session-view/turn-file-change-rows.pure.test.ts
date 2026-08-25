import { describe, expect, it } from 'vitest'
import type { TurnFileChange } from '@/entities/turn'
import { normalizeChangedFilePath } from './changed-files-tree.pure'
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

  it('reads a repository spelled two ways as the one repository storage keeps', () => {
    // COALESCE(repo_root, '') is the identity index, so '' and null are one
    // repository. Counting them as two would prefix a single-repo turn.
    const rows = buildTurnFileChangeRows([
      change({ id: 'a', repoRoot: null, filePath: 'src/a.ts' }),
      change({ id: 'b', repoRoot: '', filePath: 'src/b.ts' }),
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

/**
 * The tree keys a row by the path it draws — `@pierre/trees` has no id to hand
 * a node beside its path — so two rows that agree on that path are one row and
 * one of the two diffs cannot be reached at all. These are the identities that
 * agree once a repository prefix is joined on, and each of them has to survive
 * as its own row.
 */
describe('a tree path no two identities share', () => {
  it('keeps a repository and the repository nested inside it apart', () => {
    const rows = buildTurnFileChangeRows([
      change({ id: 'outer', repoRoot: 'a', filePath: 'b/c.ts' }),
      change({ id: 'inner', repoRoot: 'a/b', filePath: 'c.ts' }),
    ])

    // Both join to 'a/b/c.ts'. Prefixing cannot separate them, because the
    // join is where the ambiguity is.
    expect(rows[0].treePath).not.toBe(rows[1].treePath)
    expect(rows.map((row) => row.treePath)).toEqual([
      'a/b/c.ts (repository a)',
      'a/b/c.ts (repository a/b)',
    ])

    expect(findTurnFileChangeRow(rows, rows[0].treePath)).toMatchObject({
      repoRoot: 'a',
      filePath: 'b/c.ts',
    })
    expect(findTurnFileChangeRow(rows, rows[1].treePath)).toMatchObject({
      repoRoot: 'a/b',
      filePath: 'c.ts',
    })
  })

  it('keeps the working-directory root apart from a repository named like it', () => {
    const rows = buildTurnFileChangeRows([
      change({ id: 'root', repoRoot: null }),
      change({ id: 'impostor', repoRoot: TURN_ROOT_REPO_LABEL }),
    ])

    // The root label is a sentence about the workspace, not a reserved word:
    // a directory really can be called that.
    expect(rows[0].treePath).not.toBe(rows[1].treePath)
    expect(rows.map((row) => row.treePath)).toEqual([
      `${TURN_ROOT_REPO_LABEL}/README.md (workspace root)`,
      `${TURN_ROOT_REPO_LABEL}/README.md (repository ${TURN_ROOT_REPO_LABEL})`,
    ])

    expect(findTurnFileChangeRow(rows, rows[0].treePath)?.repoRoot).toBeNull()
    expect(findTurnFileChangeRow(rows, rows[1].treePath)?.repoRoot).toBe(
      TURN_ROOT_REPO_LABEL,
    )
  })

  it('still separates a file whose real name is another row disambiguated', () => {
    const rows = buildTurnFileChangeRows([
      change({ id: 'outer', repoRoot: 'a', filePath: 'b/c.ts' }),
      change({ id: 'inner', repoRoot: 'a/b', filePath: 'c.ts' }),
      change({
        id: 'literal',
        repoRoot: 'a',
        filePath: 'b/c.ts (repository a)',
      }),
    ])

    // Saying which repository a row came from is a spelling like any other, so
    // a real file can already be spelled that way. Three identities, three
    // rows, whatever they are called.
    expect(new Set(rows.map((row) => row.treePath)).size).toBe(3)
    expect(rows[2].treePath).toBe('a/b/c.ts (repository a) [2]')
  })

  it('says which repository only for the rows that need to', () => {
    const rows = buildTurnFileChangeRows([
      change({ id: 'outer', repoRoot: 'a', filePath: 'b/c.ts' }),
      change({ id: 'inner', repoRoot: 'a/b', filePath: 'c.ts' }),
      change({ id: 'quiet', repoRoot: 'a', filePath: 'b/d.ts' }),
    ])

    // The unambiguous row keeps the path a human reads at a glance; only the
    // pair that collides pays for the collision.
    expect(rows[2].treePath).toBe('a/b/d.ts')
  })
})

/**
 * The tree does not draw the string it is handed; it draws
 * `normalizeChangedFilePath` of that string. So a row's treePath is a claim
 * about a string the tree re-derives, and a claim made in any other spelling
 * describes a row that is on screen and cannot be opened.
 */
describe('a tree path spelled the way the tree spells it', () => {
  it('claims, for every row, the string the tree would normalise it to', () => {
    const rows = buildTurnFileChangeRows([
      change({ id: 'windows', repoRoot: 'a\\b', filePath: 'c.ts' }),
      change({ id: 'posix', repoRoot: 'a', filePath: 'b/c.ts' }),
      change({ id: 'dotted', repoRoot: 'a', filePath: '././d.ts' }),
      change({
        id: 'literal',
        repoRoot: 'a',
        filePath: 'b/c.ts (repository a)',
      }),
    ])

    // The invariant rather than the instance: whatever a row is composed from,
    // normalising it again changes nothing, which is exactly what the tree
    // does to it on the way in.
    for (const row of rows) {
      expect(normalizeChangedFilePath(row.treePath)).toBe(row.treePath)
    }
  })

  it('separates two repositories the tree would spell the same way', () => {
    const rows = buildTurnFileChangeRows([
      change({ id: 'windows', repoRoot: 'a\\b', filePath: 'c.ts' }),
      change({ id: 'posix', repoRoot: 'a/b', filePath: 'c.ts' }),
    ])

    // Storage keeps these apart -- 'a\b' and 'a/b' are two repo_root values --
    // but the tree folds both spellings into one path, and so does the row that
    // says which repository it came from. The backstop is what is left, and it
    // has to be enough, because a row deduped away is a diff that cannot be
    // opened at all.
    expect(rows[0].treePath).not.toBe(rows[1].treePath)
    expect(rows.map((row) => row.treePath)).toEqual([
      'a/b/c.ts (repository a/b)',
      'a/b/c.ts (repository a/b) [2]',
    ])
    expect(findTurnFileChangeRow(rows, rows[0].treePath)?.repoRoot).toBe('a\\b')
    expect(findTurnFileChangeRow(rows, rows[1].treePath)?.repoRoot).toBe('a/b')
  })

  it('disambiguates on the spelling the tree uses, not on ours', () => {
    const rows = buildTurnFileChangeRows([
      change({ id: 'windows', repoRoot: 'a\\b', filePath: 'c.ts' }),
      change({ id: 'posix', repoRoot: 'a', filePath: 'b/c.ts' }),
    ])

    // Counted before normalising, these two look like distinct paths and
    // neither would say which repository it came from -- and then the tree
    // folds them together anyway.
    expect(rows.map((row) => row.treePath)).toEqual([
      'a/b/c.ts (repository a/b)',
      'a/b/c.ts (repository a)',
    ])
  })

  it('keeps a dot-slash path from hanging a directory under its repository', () => {
    const rows = buildTurnFileChangeRows([
      change({ id: 'web', repoRoot: 'apps/web', filePath: './src/a.ts' }),
      change({ id: 'api', repoRoot: 'apps/api', filePath: 'src/b.ts' }),
    ])

    // Joined raw, the './' lands mid-string where the normaliser leaves it and
    // the tree draws a directory called '.'.
    expect(rows[0].treePath).toBe('apps/web/src/a.ts')
  })

  it('settles a path however many passes settling it takes', () => {
    const rows = buildTurnFileChangeRows([change({ filePath: '././././a.ts' })])

    // The normaliser strips one leading './' per call, so normalising a fixed
    // number of times is a bet on how many the path carries -- and the row
    // that loses the bet claims a string the tree still changes.
    expect(rows[0].treePath).toBe('a.ts')
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

  it('resolves a root selection spelled the way storage folds it', () => {
    const rows = buildTurnFileChangeRows([
      change({ id: 'root', repoRoot: null }),
      change({ id: 'web', repoRoot: 'apps/web' }),
    ])

    expect(
      findTurnFileChangeRowForSelection(rows, {
        repoRoot: '',
        filePath: 'README.md',
      })?.repoRoot,
    ).toBeNull()
  })

  it('has nothing to find without a selection', () => {
    expect(findTurnFileChangeRowForSelection([], null)).toBeNull()
  })
})
