import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { sweepAPlantedWorkspace } from '../../workspace-import-ownership.fixture'
import { createWorkspaceImportOwnership } from '../../workspace-import-ownership'

/**
 * Backpack Studio's workspace-ownership test (MAR-2737, round 4).
 *
 * The twin of Convergence's, pointed the other way, and the one that matters
 * most: the Second Body exists to be built on the extracted client core, and
 * every round of this run found it reaching past that core into Convergence
 * itself and passing every gate. Round 3's `../../../convergence/src/…`,
 * round 4's `../../.././convergence/src/…` and round 4's
 * `electron/main/index.ts` import of Convergence's `ProviderDescriptor` are
 * all here by name.
 */

const workspaceDir = dirname(fileURLToPath(import.meta.url))

/**
 * This driver's whole configuration, named once — the real tree and the
 * planted one the composition canary sweeps are judged by the same object.
 */
const SHAPE = {
  trees: [
    { dir: 'src', tsconfig: 'tsconfig.json' },
    { dir: 'electron', tsconfig: 'tsconfig.node.json' },
  ],
  devDependenciesInProduction: true,
} as const

const ownership = createWorkspaceImportOwnership({ workspaceDir, ...SHAPE })

const RENDERER_ANCHOR = join(workspaceDir, 'src', 'app', 'index.tsx')
const ELECTRON_ANCHOR = join(workspaceDir, 'electron', 'main', 'index.ts')

/** codex's exact targets: a renderer entity and a backend provider type. */
const IN_CONVERGENCE_SRC = 'src/entities/dialog/dialog.types'
const IN_CONVERGENCE_ELECTRON = 'electron/backend/provider/provider.types'

/** A private file of the package Studio DOES declare (round 5). */
const IN_CLIENT_CORE = 'src/remote-execution-host.types'

const INTO_CONVERGENCE = "resolves into the 'convergence' workspace"
const NOWHERE = 'resolves nowhere'
const BY_NAME_ONLY = 'may only be entered through its package name'

/**
 * Mutation for all of them at once: make `check` return `{ ok: true }` before
 * it classifies and every case here goes red. That is the meta-canary — this
 * suite proves the organ can fail.
 */
const FORBIDDEN_SPELLINGS: readonly [string, string, string, string][] = [
  [
    'the workspace name (round 2)',
    RENDERER_ANCHOR,
    `convergence/${IN_CONVERGENCE_SRC}`,
    INTO_CONVERGENCE,
  ],
  [
    'a relative climb (round 3)',
    RENDERER_ANCHOR,
    `../../../convergence/${IN_CONVERGENCE_SRC}`,
    INTO_CONVERGENCE,
  ],
  [
    'a relative climb that path normalization hides (round 4)',
    RENDERER_ANCHOR,
    `../../.././convergence/${IN_CONVERGENCE_SRC}`,
    INTO_CONVERGENCE,
  ],
  [
    'a relative climb with a doubled separator (round 4)',
    RENDERER_ANCHOR,
    `../../../convergence//${IN_CONVERGENCE_SRC}`,
    INTO_CONVERGENCE,
  ],
  [
    'a relative climb with a dot segment (round 4)',
    RENDERER_ANCHOR,
    `../../../convergence/./${IN_CONVERGENCE_SRC}`,
    INTO_CONVERGENCE,
  ],
  [
    'the npm-workspaces symlink',
    RENDERER_ANCHOR,
    `../../../../node_modules/convergence/${IN_CONVERGENCE_SRC}`,
    INTO_CONVERGENCE,
  ],
  [
    'the apps/ directory',
    RENDERER_ANCHOR,
    `../../../../apps/convergence/${IN_CONVERGENCE_SRC}`,
    INTO_CONVERGENCE,
  ],
  [
    'a bare apps/ path, which resolves in no build either',
    RENDERER_ANCHOR,
    `apps/convergence/${IN_CONVERGENCE_SRC}`,
    NOWHERE,
  ],
  [
    "the electron tree round 4 found unguarded, by Convergence's own name",
    ELECTRON_ANCHOR,
    `convergence/${IN_CONVERGENCE_ELECTRON}`,
    INTO_CONVERGENCE,
  ],
  [
    'the electron tree round 4 found unguarded, by a relative climb',
    ELECTRON_ANCHOR,
    `../../../convergence/${IN_CONVERGENCE_ELECTRON}`,
    INTO_CONVERGENCE,
  ],
]

/**
 * Round 5: ownership is not the whole contract. The client core is DECLARED,
 * so every path below lands on a workspace Studio is allowed to depend on —
 * and every one of them still reaches past the `exports` door into a private
 * file. The day the package builds to `dist` or publishes, each breaks
 * silently; today's gates blessed the first of them (codex's round-4 probe
 * typechecked, built and passed chaperone). A declared workspace is entered by
 * its name or not at all.
 *
 * Mutation: drop the package-name requirement from the sibling branch of
 * `check` (return `{ ok: true }` as soon as the workspace is declared) and all
 * three go red, while `places the shared client core by its package name`
 * below stays green — the rule is the spelling, not the ownership.
 */
const REACH_THROUGHS: readonly [string, string, string][] = [
  [
    "a relative deep path (codex's exact round-4 probe)",
    `../../../../packages/execution-host-client/${IN_CLIENT_CORE}`,
    '@convergence/execution-host-client',
  ],
  [
    'the npm-workspaces symlink',
    `../../../../node_modules/@convergence/execution-host-client/${IN_CLIENT_CORE}`,
    '@convergence/execution-host-client',
  ],
  [
    'a subpath the package does not export',
    `@convergence/execution-host-client/${IN_CLIENT_CORE}`,
    '@convergence/execution-host-client',
  ],
]

describe("Backpack Studio's imports", () => {
  it('scans both of its source trees', () => {
    // Mutation: drop the `electron` tree from the options above and this goes
    // red — the hole round 4 found cannot be reopened silently.
    expect(ownership.filesIn('src')).toContain(RENDERER_ANCHOR)
    expect(ownership.filesIn('electron')).toContain(ELECTRON_ANCHOR)
    expect(ownership.sourceFiles.length).toBeGreaterThan(4)
  })

  // Round 7: ~18 ms quiet today — Studio's tree is small — but this is the
  // same exhaustive real-tree sweep Convergence budgets at 20 s, and it grows
  // with the app. Budgeted at birth rather than the day it flakes.
  it(
    'resolves every one of them into this workspace or a declared dependency',
    { timeout: 20_000 },
    () => {
      expect(ownership.violations()).toEqual([])
    },
  )

  it('places the shared client core by its package name', () => {
    // The consumability canary's other half: Studio's one real import of the
    // extraction is legal because Studio DECLARES the package, and the
    // relative path to the same files (above) is not.
    expect(
      ownership.check(RENDERER_ANCHOR, '@convergence/execution-host-client'),
    ).toEqual({ ok: true, owner: '@convergence/execution-host-client' })
  })
})

describe('a sibling app is not importable, however it is spelled', () => {
  it('anchors its cases on files that exist', () => {
    expect(existsSync(RENDERER_ANCHOR)).toBe(true)
    expect(existsSync(ELECTRON_ANCHOR)).toBe(true)
  })

  it.each(FORBIDDEN_SPELLINGS)(
    'rejects %s',
    (_label, anchor, specifier, expectedReason) => {
      const verdict = ownership.check(anchor, specifier)
      expect(verdict.ok).toBe(false)
      expect(verdict.ok ? 'allowed' : verdict.reason).toContain(expectedReason)
    },
  )
})

describe('the declared client core is entered by its name or not at all', () => {
  it.each(REACH_THROUGHS)(
    'rejects %s and names the legal spelling',
    (_label, specifier, legalSpelling) => {
      const verdict = ownership.check(RENDERER_ANCHOR, specifier)
      expect(verdict.ok).toBe(false)
      const reason = verdict.ok ? 'allowed' : verdict.reason
      expect(reason).toContain(BY_NAME_ONLY)
      // Both halves, per the ruling: what was written, and what to write.
      expect(reason).toContain(specifier)
      expect(reason).toContain(`import '${legalSpelling}'`)
    },
  )
})

describe('the sweep itself, on a tree planted to be wrong', () => {
  /**
   * Round 5. Every case above hands `check` a specifier by hand, and the
   * file-count pin counts the walk on its own — so codex replaced `violations()`
   * with `(): string[] => []` and all three suites stayed green. An inert sweep
   * and a clean tree were the same answer. This runs the REAL entry, over a
   * miniature monorepo built to this driver's own `SHAPE`, with real forbidden
   * imports in real files in every tree it scans.
   *
   * Round 6 plants the historical FORM too: one of the two forbidden imports
   * in every tree is written `import type`, because with all three plants as
   * value imports, ignoring `importClause.isTypeOnly` in `importSpecifiersOf`
   * left this suite green while the exact round-1 escape passed every gate.
   *
   * Mutations, each watched red: `violations: (): string[] => []` in the organ;
   * cutting the walk off from the classifier (`sourceFiles` -> `[]`); dropping
   * type-only declarations in `importSpecifiersOf`.
   */
  const sweep = sweepAPlantedWorkspace(SHAPE)

  it.each(sweep.planted)(
    'reports the $form of $specifier from $file, and says why',
    ({ file, specifier, expectedReason }) => {
      const line = sweep.lines.find((candidate) =>
        candidate.startsWith(`${file}: '${specifier}'`),
      )
      expect(line).toBeDefined()
      expect(line).toContain(expectedReason)
    },
  )

  it('still plants the type-only reach — on disk — and still reports it', () => {
    // Round 6, the named canary. `import type` is the form that escaped every
    // gate in round 1 and the one a parser is likeliest to drop on the floor,
    // so it is asserted here by name rather than only by data: the fixture
    // must keep planting one per scanned tree, and every one must come back
    // out of `violations()`.
    //
    // Mutation: ignore `importClause.isTypeOnly` in `importSpecifiersOf` (or
    // rewrite the plant's `form` field as a value import) -> red.
    const typeOnly = sweep.planted.filter(
      (plant) => plant.form === 'import type',
    )
    expect(typeOnly).toHaveLength(SHAPE.trees.length)

    // Round 7 — the artifact, not the intent. Everything above reads `form`,
    // which is what the fixture was ASKED to write; `sweep.emitted` is what
    // the AST of the file on disk holds. codex changed only the fixture's
    // writer to a literal `import {`, left `form: 'import type'` standing, and
    // the two encodings split in silence: value-import files, type-only
    // metadata, this suite green. So the emitted clauses are pinned exactly —
    // these plants are type-only on disk, and nothing else is.
    //
    // Mutation: `${plant.form} { … }` -> `import { … }` in the fixture's
    // writer -> red.
    const typeOnlyOnDisk = sweep.emitted.filter((written) => written.typeOnly)
    expect(typeOnlyOnDisk).toHaveLength(typeOnly.length)

    for (const plant of typeOnly) {
      expect(typeOnlyOnDisk).toContainEqual({
        file: plant.file,
        specifier: plant.specifier,
        typeOnly: true,
      })
      expect(
        sweep.lines.some((line) =>
          line.startsWith(`${plant.file}: '${plant.specifier}'`),
        ),
      ).toBe(true)
    }
  })

  it('leaves the legal import alone, and reports nothing else', () => {
    // `violations()` prints the offending specifier straight after the file,
    // so `: '<specifier>'` is the reported one — the legal name also appears
    // inside the reach-through's reason, as the spelling to write instead.
    expect(
      sweep.lines.filter((line) =>
        line.includes(`: '${sweep.legalSpecifier}'`),
      ),
    ).toEqual([])
    expect(sweep.lines).toHaveLength(sweep.planted.length)
  })
})
