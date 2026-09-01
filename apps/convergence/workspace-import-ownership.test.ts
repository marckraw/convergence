import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { sweepAPlantedWorkspace } from '../../workspace-import-ownership.fixture'
import { createWorkspaceImportOwnership } from '../../workspace-import-ownership'

/**
 * Convergence's workspace-ownership test (MAR-2737, round 4).
 *
 * One of three — Backpack Studio and the client core each have their own, and
 * they share the organ, not the answer: each workspace names its own trees and
 * is judged against its own manifest, so a violation names the workspace that
 * committed it. The four regexes in `workspace-boundaries.json` that used to
 * ask this question are deleted; two encodings of one fact drift, and the text
 * one could only ever answer about text.
 *
 * Both trees are scanned. `electron/**` is here because round 4 found it had
 * never been guarded: a Convergence <-> Studio import placed in
 * `electron/main/index.ts` passed typecheck, both builds and chaperone.
 */

const workspaceDir = dirname(fileURLToPath(import.meta.url))

/**
 * This driver's whole configuration, named once. The real tree below is judged
 * by it, and so is the planted tree the composition canary sweeps — the ruling
 * asks for that canary "exercised through each driver's config", and this is
 * the config.
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

/** A real module in the sibling app Convergence does not declare. */
const IN_STUDIO = 'src/features/daemon-handshake/hello-screen.pure'

/** A private file of the package Convergence DOES declare (round 5). */
const IN_CLIENT_CORE = 'src/remote-execution-host.types'

const INTO_STUDIO = "resolves into the 'backpack-studio' workspace"
const NOWHERE = 'resolves nowhere'
const BY_NAME_ONLY = 'may only be entered through its package name'

/**
 * Every spelling from all four rounds, plus the ones nobody has written yet.
 * They all name the same file in the same sibling workspace; only the text
 * differs, which is the whole point — the organ judges the resolved path, and
 * the expected reason pins WHICH judgement each one earned, so a weakening
 * that silently downgrades "resolved into a sibling" to "resolved nowhere"
 * cannot hide.
 *
 * Mutation for all of them at once: make `check` return `{ ok: true }` before
 * it classifies and every case here goes red. That is the meta-canary — this
 * suite proves the organ can fail.
 */
const FORBIDDEN_SPELLINGS: readonly [string, string, string, string][] = [
  [
    'the workspace name',
    RENDERER_ANCHOR,
    `backpack-studio/${IN_STUDIO}`,
    INTO_STUDIO,
  ],
  [
    'a relative climb',
    RENDERER_ANCHOR,
    `../../../backpack-studio/${IN_STUDIO}`,
    INTO_STUDIO,
  ],
  [
    'a relative climb that path normalization hides (round 4)',
    RENDERER_ANCHOR,
    `../../.././backpack-studio/${IN_STUDIO}`,
    INTO_STUDIO,
  ],
  [
    'a relative climb with a doubled separator',
    RENDERER_ANCHOR,
    `../../../backpack-studio//${IN_STUDIO}`,
    INTO_STUDIO,
  ],
  [
    'the npm-workspaces symlink',
    RENDERER_ANCHOR,
    `../../../../node_modules/backpack-studio/${IN_STUDIO}`,
    INTO_STUDIO,
  ],
  [
    'the apps/ directory',
    RENDERER_ANCHOR,
    `../../../../apps/backpack-studio/${IN_STUDIO}`,
    INTO_STUDIO,
  ],
  [
    'a bare apps/ path, which resolves in no build either',
    RENDERER_ANCHOR,
    `apps/backpack-studio/${IN_STUDIO}`,
    NOWHERE,
  ],
  [
    'a relative climb from the electron tree round 4 found unguarded',
    ELECTRON_ANCHOR,
    `../../../backpack-studio/${IN_STUDIO}`,
    INTO_STUDIO,
  ],
  [
    'the workspace name from the electron tree',
    ELECTRON_ANCHOR,
    `backpack-studio/${IN_STUDIO}`,
    INTO_STUDIO,
  ],
]

/**
 * Round 5: the same three reach-throughs Studio pins, from the tree that
 * actually consumes the extraction. Convergence DECLARES the client core, so
 * ownership passes and only the `exports` door is left standing — which is the
 * whole finding: a declared workspace is entered by its name or not at all.
 *
 * Mutation: drop the package-name requirement from the sibling branch of
 * `check` and all three go red, while `places the shared client core by its
 * package name` stays green.
 */
const REACH_THROUGHS: readonly [string, string, string][] = [
  [
    'a relative deep path',
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

describe("Convergence's imports", () => {
  it('scans both of its source trees', () => {
    // Mutation: drop the `electron` tree from the options above and this goes
    // red — the hole round 4 found cannot be reopened silently.
    expect(ownership.filesIn('src')).toContain(RENDERER_ANCHOR)
    expect(ownership.filesIn('electron')).toContain(ELECTRON_ANCHOR)
    expect(ownership.sourceFiles.length).toBeGreaterThan(1000)
  })

  // Round 7: this one assert parses and resolves the whole 1000+ file tree —
  // ~2.5 s quiet here, 2.0-2.9 s measured across sessions — so vitest's 5 s
  // default is headroom, not a budget, and it has already timed out twice
  // under load. 20 s is the budget; every other test in this file keeps the
  // default, because none of them touch the real tree.
  it(
    'resolves every one of them into this workspace or a declared dependency',
    { timeout: 20_000 },
    () => {
      expect(ownership.violations()).toEqual([])
    },
  )

  it('places the shared client core by its package name', () => {
    // The control: the extraction's own import stays legal, and legal because
    // it is DECLARED, not because it is spelled a particular way.
    expect(
      ownership.check(ELECTRON_ANCHOR, '@convergence/execution-host-client'),
    ).toEqual({ ok: true, owner: '@convergence/execution-host-client' })
  })
})

describe('a sibling app is not importable, however it is spelled', () => {
  it('anchors its cases on files that exist', () => {
    // Without this, a renamed anchor would make every case below pass for the
    // wrong reason — an unresolvable import from a file that is not there.
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
      const verdict = ownership.check(ELECTRON_ANCHOR, specifier)
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
