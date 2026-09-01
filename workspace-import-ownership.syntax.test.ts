import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { importSpecifiersOf } from './workspace-import-ownership'

/**
 * The organ's parser, pinned form by form (MAR-2737, round 6).
 *
 * `importSpecifiersOf` promises, in prose, "every module specifier a file
 * names, in every form the language offers". Nothing enforced that promise:
 * the ownership suites hand `check()` a specifier by hand, and the composition
 * canary plants imports in only the forms it happens to plant. codex proved
 * the cost — ignore `importClause.isTypeOnly` and every gate in the repo stays
 * green while `import type { DialogKind } from '../../../convergence/…'`, the
 * exact escape that opened this run, walks straight through the boundary.
 *
 * A comment that states an invariant gets the line that makes it true. So one
 * snippet carries all seven forms at once, and each form is asserted by name:
 * drop a branch from the visitor and the failure says which form was lost.
 *
 * It lives at the repo root beside the organ it pins, like the fixture and the
 * lint config's own canary — it is tooling, and it ships in nothing.
 */

/**
 * One row per form the docblock promises: the label the failure prints, the
 * specifier that must come back, and the line that writes it.
 *
 * Every specifier is unique, so `toContain` can never be satisfied by a
 * neighbour, and none of them resolves anywhere — this reads syntax, and the
 * resolver is a different question with its own tests.
 */
const FORMS: readonly [string, string, string][] = [
  ['a static import', 'form/static', "import { value } from 'form/static'"],
  ['a re-export', 'form/re-export', "export { other } from 'form/re-export'"],
  [
    'a type-only import',
    'form/import-type',
    "import type { Shape } from 'form/import-type'",
  ],
  [
    'a dynamic import() expression',
    'form/dynamic',
    "export const load = async () => import('form/dynamic')",
  ],
  [
    'an import() type',
    'form/import-type-node',
    "export type Imported = import('form/import-type-node').Thing",
  ],
  [
    'an import-equals',
    'form/import-equals',
    "import legacy = require('form/import-equals')",
  ],
  [
    'a bare require()',
    'form/require',
    "export const required = require('form/require')",
  ],
]

/**
 * The seven forms in one file, plus a use of each binding they introduce — the
 * type-only ones in type position, so the snippet is real TypeScript and not
 * only parseable TypeScript. (`other` is re-exported, not bound locally.)
 */
const SNIPPET = [
  ...FORMS.map(([, , line]) => line),
  'export type Alias = Shape | Imported',
  'export const used = [value, legacy, load, required]',
  '',
].join('\n')

/**
 * `importSpecifiersOf` reads from disk, so the snippet is written to a real
 * file — the same door the walk uses. The directory is removed straight after;
 * the result is plain strings, so nothing outlives the call.
 */
function specifiersOfSnippet(source: string): string[] {
  const directory = mkdtempSync(join(tmpdir(), 'import-specifiers-'))
  try {
    const file = join(directory, 'snippet.ts')
    writeFileSync(file, source)
    return importSpecifiersOf(file)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

describe('importSpecifiersOf reads every form its docblock promises', () => {
  const specifiers = specifiersOfSnippet(SNIPPET)

  it.each(FORMS)('finds the specifier of %s', (_label, specifier) => {
    expect(specifiers).toContain(specifier)
  })

  it('finds those seven and nothing it invented', () => {
    expect([...specifiers].sort()).toEqual(
      FORMS.map(([, specifier]) => specifier).sort(),
    )
  })
})
