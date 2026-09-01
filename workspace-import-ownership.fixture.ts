import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import ts from 'typescript'
import {
  createWorkspaceImportOwnership,
  type TreeSpec,
} from './workspace-import-ownership'

/**
 * The composition canary's workbench (MAR-2737, round 5).
 *
 * Round 4's suites proved the *classifier* can fail: every forbidden spelling
 * is fed to `check()` by hand and every one comes back rejected. What they
 * could not prove is that anything ever calls it. codex replaced `violations()`
 * with `(): string[] => []` in a clone of the final tree and all three ownership
 * suites stayed green — the spelling matrices go straight to `check`, and the
 * file-count pin counts the walk on its own. An inert sweep and a clean tree
 * were the same green. *Prove it at the claim layer.*
 *
 * So this builds a whole miniature monorepo in a temporary directory — root
 * manifest with `workspaces`, an npm-style `node_modules` symlink, a declared
 * package with an `exports` door, an undeclared sibling app — plants real
 * forbidden imports in real files, and runs **`violations()`**, the same entry
 * the real-tree assert calls. Nothing is stubbed: the walk finds the files, the
 * AST reader finds the specifiers, the TypeScript resolver places them, the
 * classifier judges them and the formatter prints them. Break any link in that
 * chain and the planted violation stops coming back.
 *
 * ROUND 6 — the plant carries the historical form. One of the two forbidden
 * imports is written `import type`, because that is the spelling that escaped
 * every gate in round 1 and the one a parser is likeliest to drop: with all
 * three plants written as value imports, ignoring `importClause.isTypeOnly`
 * left every ownership suite green.
 *
 * ROUND 7 — and the form is READ BACK, not claimed. Round 6 derived the line
 * from `form` so one field could not drift from the other; codex then mutated
 * the *writer* instead — `${plant.form} { … }` to a literal `import { … }`,
 * with `form: 'import type'` left standing — and the two encodings split
 * silently: the files held value imports while the metadata, the case titles
 * and every assertion built on them still said type-only, all three suites
 * green. So after planting and before cleanup this parses the emitted files
 * and reports what they actually hold (`emitted`). **An assertion must read
 * the artifact, never the intent that produced it.**
 *
 * It lives at the repo root beside the organ, and for the same reason: it is
 * tooling, it is in no workspace's scanned tree, and it ships in nothing.
 */

/** The half of a driver's options that is not its own directory. */
export interface WorkspaceShape {
  readonly trees: readonly TreeSpec[]
  readonly devDependenciesInProduction: boolean
}

export interface PlantedImport {
  /** Repo-relative path of its file, exactly as `violations()` prints it. */
  readonly file: string
  readonly specifier: string
  /** The judgement it must earn — the walk alone is not the claim. */
  readonly expectedReason: string
  /**
   * The syntax it is written in, verbatim — `import` or `import type`.
   *
   * Round 6. Every planted import used to be a *value* import, so ignoring
   * `importClause.isTypeOnly` in `importSpecifiersOf` left all three ownership
   * suites green while `import type { DialogKind } from '../../../convergence/…'`
   * — the exact escape that opened this run — passed every gate. A fixture
   * agrees with the far side, and the far side here has been type-only from
   * the first probe. The form is carried into the case names so a suite that
   * loses one says which one it lost.
   */
  readonly form: 'import' | 'import type'
}

/**
 * One `import` declaration as the file on disk actually holds it (round 7).
 *
 * `PlantedImport` is the request; this is the artifact. They are produced by
 * different readers — one writes the source, the other parses it back — so a
 * writer that stops honouring the request cannot keep both of them agreeing.
 */
export interface EmittedImport {
  /** Repo-relative path, the same spelling `PlantedImport.file` carries. */
  readonly file: string
  readonly specifier: string
  /** `importClause.isTypeOnly`: the one bit `import type` and `import` differ by. */
  readonly typeOnly: boolean
}

export interface CompositionSweep {
  readonly lines: readonly string[]
  readonly planted: readonly PlantedImport[]
  /**
   * Every `import` declaration the emitted files were found to CONTAIN, read
   * off their ASTs before the temporary tree was removed (round 7). Nothing
   * here is derived from `planted` — that is the whole point.
   */
  readonly emitted: readonly EmittedImport[]
  /** Imported from the same files, and legal — so `lines` is not everything. */
  readonly legalSpecifier: string
}

/** The declared sibling package, entered through its `exports` door. */
const DECLARED_PACKAGE = 'beta-core'
/** The sibling app the subject workspace does not declare at all. */
const UNDECLARED_APP = 'stranger'

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    noEmit: true,
  },
})

const specifierFrom = (fromDirectory: string, toPath: string): string => {
  const rel = relative(fromDirectory, toPath).split(sep).join('/')
  return rel.startsWith('.') ? rel : `./${rel}`
}

/**
 * The `import` declarations of one emitted file, off its own AST (round 7).
 *
 * Opened with the organ's parser, the same call `importSpecifiersOf` makes —
 * one reader for both, so the fixture cannot agree with a syntax the organ
 * would read differently — and asked the one extra question the organ has no
 * use for: is the clause type-only? Asked of the bytes on disk, because that
 * is the only place the answer is not a claim.
 */
function emittedImportsOf(root: string, file: string): EmittedImport[] {
  const absolute = join(root, file)
  const source = ts.createSourceFile(
    absolute,
    readFileSync(absolute, 'utf-8'),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    ts.ScriptKind.TS,
  )
  return source.statements.flatMap((statement) =>
    ts.isImportDeclaration(statement) &&
    ts.isStringLiteralLike(statement.moduleSpecifier)
      ? [
          {
            file,
            specifier: statement.moduleSpecifier.text,
            typeOnly: statement.importClause?.isTypeOnly === true,
          },
        ]
      : [],
  )
}

/**
 * Build a miniature monorepo shaped like the caller's workspace, plant two real
 * violations in every tree it scans, and return what the whole sweep said.
 *
 * The temporary tree is removed before returning, in a `finally`: the sweep's
 * output is plain strings, so nothing outlives the call.
 */
export function sweepAPlantedWorkspace(
  shape: WorkspaceShape,
): CompositionSweep {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), 'workspace-import-ownership-')),
  )
  try {
    const write = (path: string, contents: string): void => {
      const absolute = join(root, path)
      mkdirSync(dirname(absolute), { recursive: true })
      writeFileSync(absolute, contents)
    }

    write(
      'package.json',
      JSON.stringify({
        name: 'composition-canary-root',
        private: true,
        workspaces: ['apps/*', 'packages/*'],
      }),
    )

    // The subject: a workspace declaring exactly one sibling, like both apps.
    write(
      'apps/subject/package.json',
      JSON.stringify({
        name: 'subject',
        private: true,
        dependencies: { [DECLARED_PACKAGE]: '*' },
      }),
    )
    for (const tsconfig of new Set(shape.trees.map((tree) => tree.tsconfig))) {
      write(join('apps', 'subject', tsconfig), TSCONFIG)
    }

    // The undeclared sibling — ownership's own question. It exports a TYPE,
    // because the reach into it is written `import type` (round 6): that is
    // the carrier the whole run chased, and a value export here would quietly
    // let the fixture drift back to a value import.
    write(
      `apps/${UNDECLARED_APP}/package.json`,
      JSON.stringify({ name: UNDECLARED_APP, private: true }),
    )
    write(
      `apps/${UNDECLARED_APP}/src/private.ts`,
      'export type Secret = number\n',
    )

    // The declared sibling — round 5's question: it is entered by name or not
    // at all, so its `exports` opens one door and its private file is not it.
    write(
      `packages/${DECLARED_PACKAGE}/package.json`,
      JSON.stringify({
        name: DECLARED_PACKAGE,
        private: true,
        type: 'module',
        main: './src/index.ts',
        types: './src/index.ts',
        exports: { '.': './src/index.ts' },
      }),
    )
    write(
      `packages/${DECLARED_PACKAGE}/src/index.ts`,
      'export const front = 1\n',
    )
    write(
      `packages/${DECLARED_PACKAGE}/src/private.ts`,
      'export const back = 1\n',
    )

    // npm's workspace symlink farm, mirrored: the resolver finds a declared
    // sibling here, and `realpath` lands it back inside `packages/`.
    mkdirSync(join(root, 'node_modules'), { recursive: true })
    symlinkSync(
      join(root, 'packages', DECLARED_PACKAGE),
      join(root, 'node_modules', DECLARED_PACKAGE),
      'dir',
    )

    const planted: PlantedImport[] = []
    const plantedFiles: string[] = []
    for (const tree of shape.trees) {
      const file = ['apps', 'subject', tree.dir, 'entry.ts'].join('/')
      const treeDirectory = join(root, 'apps', 'subject', tree.dir)
      const intoUndeclared = specifierFrom(
        treeDirectory,
        join(root, 'apps', UNDECLARED_APP, 'src', 'private'),
      )
      const pastTheDoor = specifierFrom(
        treeDirectory,
        join(root, 'packages', DECLARED_PACKAGE, 'src', 'private'),
      )
      const forbidden: readonly {
        readonly plant: PlantedImport
        readonly binding: string
      }[] = [
        {
          plant: {
            file,
            specifier: intoUndeclared,
            expectedReason: `resolves into the '${UNDECLARED_APP}' workspace`,
            form: 'import type',
          },
          binding: 'Secret',
        },
        {
          plant: {
            file,
            specifier: pastTheDoor,
            expectedReason: 'may only be entered through its package name',
            form: 'import',
          },
          binding: 'back',
        },
      ]
      write(
        file,
        [
          `import { front } from '${DECLARED_PACKAGE}'`,
          // `form` is not a label beside the line — it IS the line. One fact,
          // one derivation, so rewriting the FIELD moves the claim the suites
          // assert rather than quietly leaving it behind. Rewriting this
          // template does not: round 7 found that mutating the writer alone
          // splits the two silently, which is why `emitted` below reads the
          // file back instead of trusting this derivation to hold.
          ...forbidden.map(
            ({ plant, binding }) =>
              `${plant.form} { ${binding} } from '${plant.specifier}'`,
          ),
          'export const used: Secret[] = [front, back]',
          '',
        ].join('\n'),
      )
      planted.push(...forbidden.map(({ plant }) => plant))
      plantedFiles.push(file)
    }

    // Read the files back before anything judges them: `planted` above is what
    // was asked for, `emitted` is what was written. Two readers, so a writer
    // that stops honouring `form` splits them instead of moving both.
    const emitted = plantedFiles.flatMap((file) => emittedImportsOf(root, file))

    const lines = createWorkspaceImportOwnership({
      workspaceDir: join(root, 'apps', 'subject'),
      trees: shape.trees,
      devDependenciesInProduction: shape.devDependenciesInProduction,
    }).violations()

    return { lines, planted, emitted, legalSpecifier: DECLARED_PACKAGE }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
