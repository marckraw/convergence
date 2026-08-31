import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PALETTE_DIALOGS } from './command-palette-index.pure'

/**
 * The Command Center offers a dialog by naming its kind. Nothing type-checks
 * that the kind has anywhere to go: `open(kind)` writes a string into the
 * dialog store, and each dialog mounts itself by comparing against that string
 * on its own. So when MAR-2609 deleted the code review surface, the palette
 * kept offering "Review Pull Request" — a command that type-checked, searched,
 * ran, set the store, and opened nothing at all.
 *
 * A list of live kinds maintained by hand would go stale the same way the
 * palette did. This reads the renderer instead and asks which kinds something
 * actually mounts on. Test files are skipped on purpose: a dialog whose only
 * remaining `openDialog ===` is in a test is a dialog no one can open.
 */

const RENDERER_ROOT = resolve(__dirname, '../..')
const MOUNT_PATTERN = /openDialog === '([a-z-]+)'/g

function collectMountedDialogKinds(directory: string): Set<string> {
  const kinds = new Set<string>()

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      for (const kind of collectMountedDialogKinds(path)) kinds.add(kind)
      continue
    }

    if (!/\.tsx?$/.test(entry.name)) continue
    if (/\.test\.tsx?$/.test(entry.name)) continue

    for (const match of readFileSync(path, 'utf8').matchAll(MOUNT_PATTERN)) {
      kinds.add(match[1])
    }
  }

  return kinds
}

describe('the command palette offers no dialog that cannot open', () => {
  it('mounts every dialog kind the real index lists', () => {
    const mounted = collectMountedDialogKinds(RENDERER_ROOT)

    // The scan is only evidence while it still finds things. If a refactor
    // moves dialogs off this comparison, the set empties and every kind below
    // reads as an orphan — which is loud, and is the failure this wants.
    expect(mounted.size).toBeGreaterThan(0)

    const orphaned = PALETTE_DIALOGS.filter(
      (dialog) => !mounted.has(dialog.kind),
    ).map((dialog) => `${dialog.title} (${dialog.kind})`)

    expect(orphaned).toEqual([])
  })
})
