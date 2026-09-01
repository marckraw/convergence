import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { sweepAPlantedWorkspace } from '../../workspace-import-ownership.fixture'
import { createWorkspaceImportOwnership } from '../../workspace-import-ownership'

/**
 * The client core's workspace-ownership test (MAR-2737, rounds 4-5).
 *
 * The strictest of the three, and the one the extraction exists for. Two
 * things are asked here that the apps are not asked:
 *
 *   - a *production* file may only reach the package's `dependencies` —
 *     today exactly `@mrck-labs/execution-host-protocol`. Round 4 found the
 *     regex allowlist admitting `vitest` and `typescript` into every file
 *     under `src`, and codex proved `typescript.CompilerOptions` exported from
 *     `remote-execution-host.types.ts` passing typecheck, both builds and
 *     chaperone. A test runner is not client-core vocabulary. Round 5 closed
 *     the fixture door in the same wall: `*.fixture.ts` here is re-exported
 *     from `index.ts`, so it is production too.
 *   - no app is reachable at all, by any spelling — the package's defining
 *     law, and the reason a `ProviderDescriptor` appearing here is the signal
 *     that a function is on the wrong side of the line.
 */

const workspaceDir = dirname(fileURLToPath(import.meta.url))

/**
 * This driver's whole configuration, named once — the real tree and the
 * planted one the composition canary sweeps are judged by the same object,
 * including the strict `devDependenciesInProduction: false` that only this
 * workspace carries.
 */
const SHAPE = {
  trees: [{ dir: 'src', tsconfig: 'tsconfig.json' }],
  devDependenciesInProduction: false,
} as const

const ownership = createWorkspaceImportOwnership({ workspaceDir, ...SHAPE })

const PRODUCTION_ANCHOR = join(
  workspaceDir,
  'src',
  'remote-execution-host.types.ts',
)
const TEST_ANCHOR = join(
  workspaceDir,
  'src',
  'remote-execution-host.pure.test.ts',
)
/** Publicly re-exported from `index.ts`, and therefore production (round 5). */
const FIXTURE_ANCHOR = join(
  workspaceDir,
  'src',
  'execution-host-health.fixture.ts',
)

/** codex's exact round-4 spelling: the tripwire watched only bare specifiers. */
const RELATIVE_VITEST = '../../../node_modules/vitest'

const IN_CONVERGENCE_SRC = 'src/entities/dialog/dialog.types'
const IN_CONVERGENCE_ELECTRON = 'electron/backend/provider/provider.types'

const INTO_CONVERGENCE = "resolves into the 'convergence' workspace"
const NOWHERE = 'resolves nowhere'
const NOT_DECLARED = 'does not declare'

/**
 * Mutation for all of them at once: make `check` return `{ ok: true }` before
 * it classifies and every case here goes red. That is the meta-canary — this
 * suite proves the organ can fail.
 */
const FORBIDDEN_SPELLINGS: readonly [string, string, string, string][] = [
  [
    "an app by its workspace name (round 2's escape)",
    PRODUCTION_ANCHOR,
    `convergence/${IN_CONVERGENCE_ELECTRON}`,
    INTO_CONVERGENCE,
  ],
  [
    'an app through the apps/ directory',
    PRODUCTION_ANCHOR,
    `../../../apps/convergence/${IN_CONVERGENCE_SRC}`,
    INTO_CONVERGENCE,
  ],
  [
    'an app through the apps/ directory, path normalization hiding the climb',
    PRODUCTION_ANCHOR,
    `../.././../apps/convergence/${IN_CONVERGENCE_SRC}`,
    INTO_CONVERGENCE,
  ],
  [
    'an app through the npm-workspaces symlink',
    PRODUCTION_ANCHOR,
    `../../../node_modules/convergence/${IN_CONVERGENCE_ELECTRON}`,
    INTO_CONVERGENCE,
  ],
  [
    'an app by a bare apps/ path, which resolves in no build either',
    PRODUCTION_ANCHOR,
    `apps/convergence/${IN_CONVERGENCE_SRC}`,
    NOWHERE,
  ],
  [
    'the test runner, in a production file (round 4)',
    PRODUCTION_ANCHOR,
    'vitest',
    NOT_DECLARED,
  ],
  [
    'the compiler, in a production file (round 4)',
    PRODUCTION_ANCHOR,
    'typescript',
    NOT_DECLARED,
  ],
]

describe("the client core's imports", () => {
  it('scans its source tree', () => {
    expect(ownership.filesIn('src')).toContain(PRODUCTION_ANCHOR)
    expect(ownership.sourceFiles.length).toBeGreaterThan(10)
  })

  // Round 7: ~42 ms quiet — the package's tree is small — but this is the same
  // exhaustive real-tree sweep Convergence budgets at 20 s, and it grows with
  // the extraction. Budgeted at birth rather than the day it flakes.
  it(
    'resolves every one of them into this package or its declared dependencies',
    { timeout: 20_000 },
    () => {
      expect(ownership.violations()).toEqual([])
    },
  )

  it('reaches the protocol, its one declared dependency', () => {
    expect(
      ownership.check(PRODUCTION_ANCHOR, '@mrck-labs/execution-host-protocol'),
    ).toEqual({ ok: true, owner: '@mrck-labs/execution-host-protocol' })
  })

  it('lets a test file reach the test runner, however it is spelled', () => {
    // The other side of the production rule: `vitest` is legal in a
    // `*.test.ts` and illegal one file over. Both spellings, because round 5's
    // finding was that the old fixture tripwire watched only the bare one.
    // Mutation: drop the test branch from `check` and both go red while the
    // production-file case above stays green.
    expect(ownership.check(TEST_ANCHOR, 'vitest')).toEqual({
      ok: true,
      owner: 'vitest',
    })
    expect(ownership.check(TEST_ANCHOR, RELATIVE_VITEST)).toEqual({
      ok: true,
      owner: 'vitest',
    })
  })

  it('spends no devDependency grant in a fixture, however it is spelled', () => {
    // Round 5's ruling: a fixture is PRODUCTION. These fixtures are re-exported
    // from `index.ts` — `createStubDaemon`, `DAEMON_HEALTH_FIXTURE_0_26_1` —
    // so a devDependency reaching one of them stands on the package's public
    // type surface, which is the exact coupling the production rule forbids one
    // file over. Round 4 answered this with a tripwire that filtered on the
    // shape of the specifier, and codex walked around it with the relative
    // spelling below: `Mock` from `../../../node_modules/vitest`, in the return
    // type of an already-exported fixture, green through every gate. The
    // classification IS the enforcement now; the tripwire is deleted.
    //
    // Mutation: widen the test-file pattern back to `\.(test|fixture)\.` and
    // both of these go red while the two above stay green.
    for (const specifier of ['vitest', RELATIVE_VITEST]) {
      const verdict = ownership.check(FIXTURE_ANCHOR, specifier)
      expect(verdict.ok).toBe(false)
      expect(verdict.ok ? 'allowed' : verdict.reason).toContain(NOT_DECLARED)
    }
  })
})

describe('an app is not importable from the client core, however it is spelled', () => {
  it('anchors its cases on files that exist', () => {
    expect(existsSync(PRODUCTION_ANCHOR)).toBe(true)
    expect(existsSync(TEST_ANCHOR)).toBe(true)
    expect(existsSync(FIXTURE_ANCHOR)).toBe(true)
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
