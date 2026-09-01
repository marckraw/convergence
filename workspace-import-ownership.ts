import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'
import ts from 'typescript'

/**
 * The workspace-ownership organ (MAR-2737, round 4 — Marcin's ruling: "B").
 *
 * ONE fact, ONE organ. The question a monorepo boundary actually asks is not
 * "how is this import spelled?" but **"where does this import RESOLVE?"** —
 * and rounds 2 and 3 proved, twice, that a text rule can only ever answer the
 * first. `(^|/)apps/` missed the workspace-name spelling; the allowlist that
 * replaced it missed `../../.././convergence/src/…`, because a regex has to
 * see `../` and `convergence` adjacent and path normalization does not care.
 * Four spellings of one fact, four rounds, and a fifth spelling was always one
 * clone away.
 *
 * So this asks the compiler. `ts.resolveModuleName` — the resolver `tsc`,
 * electron-vite and every editor already use, loaded with each tree's own
 * tsconfig so `@/*` resolves exactly as the build resolves it — turns a
 * specifier into an absolute path, and the judgement is made on that path:
 *
 *   - inside the owning workspace              -> allowed
 *   - inside `node_modules/<name>`, `<name>` a
 *     declared dependency of that workspace    -> allowed
 *   - inside a sibling workspace that IS a
 *     declared dependency, AND spelled as that
 *     workspace's package name                 -> allowed
 *   - anything else, including a sibling
 *     workspace that is NOT a declared
 *     dependency, and a declared one reached
 *     past its `exports` door                  -> FAILS, by resolved path
 *   - unresolvable                             -> FAILS loud, never skipped
 *
 * Spelling is thereby irrelevant: `convergence/electron/…`,
 * `../../../convergence/src/…`, `../../.././convergence/src/…` and
 * `../../../../node_modules/convergence/src/…` all land on the same absolute
 * path and all fail on it. A spelling nobody has thought of yet lands there
 * too.
 *
 * OWNERSHIP IS NOT THE WHOLE CONTRACT (round 5). Once a resolved path lands in
 * a sibling workspace this one DOES declare, one question remains: was it
 * entered through the front door? A declared package is legal by its package
 * name and by nothing else — `../../packages/client/src/private`,
 * `../node_modules/@scope/client/src/private` and a subpath the package's
 * `exports` map never opened all resolve to a private file that disappears the
 * day the package builds to `dist` or publishes, while every gate today blesses
 * them. The name is the only spelling that goes through `exports`; the resolver
 * then decides which entries that door actually has.
 *
 * WHAT IS SCANNED, exactly: each workspace names its own trees, and for the
 * apps that is `src/**` AND `electron/**` — round 4 found the Electron trees
 * had never been guarded at all, which is the side most likely to grow daemon
 * integration next. Workspace-root files (this organ, the tests that drive it,
 * the vitest and electron-vite configs) are not scanned: they are tooling, they
 * ship in nothing (`files: ["src"]` for the package, build output only for the
 * apps), and this organ is one of them.
 *
 * NODE BUILTINS are allowed by specifier, before resolution: `node:fs` and
 * `fs` are the platform, not anyone's dependency. `electron` needs no such
 * exception — both apps declare it, so it passes as a declared dependency,
 * which is the truer statement. Whether a *renderer* may import Electron is a
 * different question, and chaperone's renderer rules answer it.
 */

/** A tree of source files, plus the tsconfig whose options resolve it. */
export interface TreeSpec {
  /** Directory relative to the workspace root, e.g. `src` or `electron`. */
  readonly dir: string
  /** tsconfig relative to the workspace root, e.g. `tsconfig.node.json`. */
  readonly tsconfig: string
}

export interface OwnershipOptions {
  /** Absolute path of the workspace whose source is being judged. */
  readonly workspaceDir: string
  readonly trees: readonly TreeSpec[]
  /**
   * Whether a *production* file may import a `devDependencies` entry.
   *
   * True for the apps: their runtime modules are devDependencies on purpose,
   * because electron-vite bundles them (see `BUNDLED_WORKSPACE_PACKAGES`).
   * False for a shared package, whose production files must stay inside its
   * `dependencies`/`peerDependencies` — a test runner or a compiler leaking
   * into public types is the exact coupling the extraction exists to prevent.
   * `*.test.ts` files get `devDependencies` either way; `*.fixture.ts` files
   * do not, because they are exported (see `TEST_FILE`).
   */
  readonly devDependenciesInProduction: boolean
}

export type OwnershipVerdict =
  | { readonly ok: true; readonly owner: string }
  | { readonly ok: false; readonly reason: string }

/** Extensions that can carry an import. Broader than the trees hold today. */
const MODULE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]

/**
 * A test file, and ONLY a test file, may spend the `devDependencies` grant.
 *
 * `*.fixture.ts` deliberately does not qualify (round 5). A fixture in this
 * repo is re-exported from its package's `index.ts` — it is public surface by
 * construction — so a test runner or a compiler reaching one of them stands in
 * the package's own types, which is the exact coupling the production rule
 * exists to forbid one file over. Fixtures are production.
 */
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/

const NODE_BUILTINS = new Set(builtinModules)

interface Manifest {
  name?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  workspaces?: string[]
}

function readManifest(directory: string): Manifest {
  return JSON.parse(
    readFileSync(join(directory, 'package.json'), 'utf-8'),
  ) as Manifest
}

/** The directory holding the root manifest that declares the workspaces. */
function findRepoRoot(from: string): string {
  let current = from
  for (;;) {
    const candidate = join(current, 'package.json')
    if (existsSync(candidate)) {
      const manifest = JSON.parse(readFileSync(candidate, 'utf-8')) as Manifest
      if (manifest.workspaces !== undefined) return current
    }
    const parent = dirname(current)
    if (parent === current) {
      throw new Error(`no workspace root above ${from}`)
    }
    current = parent
  }
}

function isInside(directory: string, candidate: string): boolean {
  const rel = relative(directory, candidate)
  return rel !== '' && !rel.startsWith('..') && !rel.startsWith(sep)
}

/** `@scope/name/deep/path` -> `@scope/name`; `name/deep` -> `name`. */
function packageNameOf(specifier: string): string {
  const segments = specifier.split('/')
  return specifier.startsWith('@')
    ? segments.slice(0, 2).join('/')
    : segments[0]
}

function realpathOrSelf(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

function collectFiles(directory: string, into: string[]): void {
  if (!existsSync(directory)) return
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      collectFiles(path, into)
    } else if (MODULE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      into.push(path)
    }
  }
}

/**
 * Every module specifier a file names, in every form the language offers:
 * static imports and re-exports, `import type`, `import()` expressions and
 * types, `import x = require()`, and bare `require()` calls. Read off the AST
 * rather than by regex, for the same reason the resolution is: a text scan
 * answers a question about text.
 *
 * That list is a promise, so it has a line that enforces it: round 6 pins all
 * seven forms in one snippet, each asserted by name, in
 * `workspace-import-ownership.syntax.test.ts`. Until then it was prose only —
 * dropping type-only declarations here left every gate in the repo green while
 * `import type { … } from '…/convergence/…'`, the escape that opened MAR-2737,
 * walked through the boundary untouched.
 */
export function importSpecifiersOf(filePath: string): string[] {
  const source = ts.createSourceFile(
    filePath,
    readFileSync(filePath, 'utf-8'),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    filePath.endsWith('.tsx') || filePath.endsWith('.jsx')
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS,
  )
  const specifiers: string[] = []

  const record = (node: ts.Node | undefined): void => {
    if (node !== undefined && ts.isStringLiteralLike(node)) {
      specifiers.push(node.text)
    }
  }

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      record(node.moduleSpecifier)
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      record(node.moduleReference.expression)
    } else if (ts.isImportTypeNode(node)) {
      if (ts.isLiteralTypeNode(node.argument)) record(node.argument.literal)
    } else if (ts.isCallExpression(node)) {
      const isDynamicImport =
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      const isRequire =
        ts.isIdentifier(node.expression) && node.expression.text === 'require'
      if (isDynamicImport || isRequire) record(node.arguments[0])
    }
    ts.forEachChild(node, visit)
  }

  ts.forEachChild(source, visit)
  return specifiers
}

/**
 * The tsconfig's own `paths` substitution, applied by hand.
 *
 * Only ever reached for a specifier the TypeScript resolver refused, which in
 * this repo means an alias pointing at a file TypeScript has no resolution for
 * at all: `@/shared/assets/sounds/chime-soft.wav`. The mapping is the tree's
 * real one, read from its real tsconfig, so the alias lands where the build
 * lands it — and the result is judged as any other resolved path. An `@/*`
 * that ever pointed into a sibling workspace would fail here, not pass.
 */
function applyPathsMapping(
  specifier: string,
  resolution: {
    readonly compilerOptions: ts.CompilerOptions
    readonly pathsBase: string
  },
): string | undefined {
  const paths = resolution.compilerOptions.paths
  if (paths === undefined) return undefined

  let matched:
    | { substitutions: readonly string[]; wildcard: string }
    | undefined
  let bestPrefix = -1
  for (const [pattern, substitutions] of Object.entries(paths)) {
    const star = pattern.indexOf('*')
    if (star === -1) {
      if (pattern === specifier) {
        matched = { substitutions, wildcard: '' }
        bestPrefix = Number.POSITIVE_INFINITY
      }
      continue
    }
    const prefix = pattern.slice(0, star)
    const suffix = pattern.slice(star + 1)
    if (specifier.length < prefix.length + suffix.length) continue
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue
    if (prefix.length <= bestPrefix) continue
    bestPrefix = prefix.length
    matched = {
      substitutions,
      wildcard: specifier.slice(
        prefix.length,
        specifier.length - suffix.length,
      ),
    }
  }
  if (matched === undefined) return undefined

  for (const substitution of matched.substitutions) {
    const candidate = resolve(
      resolution.pathsBase,
      substitution.replace('*', matched.wildcard),
    )
    if (existsSync(candidate)) return realpathOrSelf(candidate)
  }
  return undefined
}

/**
 * The check itself, bound to one workspace.
 *
 * @see the module docblock for the ruling this implements.
 */
export function createWorkspaceImportOwnership(options: OwnershipOptions) {
  const workspaceDir = realpathOrSelf(options.workspaceDir)
  const repoRoot = findRepoRoot(workspaceDir)
  const manifest = readManifest(workspaceDir)

  const namesIn = (...tables: (Record<string, string> | undefined)[]) =>
    new Set(tables.flatMap((table) => Object.keys(table ?? {})))

  const productionDependencies = namesIn(
    manifest.dependencies,
    manifest.peerDependencies,
    manifest.optionalDependencies,
    options.devDependenciesInProduction ? manifest.devDependencies : undefined,
  )
  const testDependencies = namesIn(
    manifest.dependencies,
    manifest.peerDependencies,
    manifest.optionalDependencies,
    manifest.devDependencies,
  )

  /** Absolute directory -> package name, for every workspace in the repo. */
  const siblingWorkspaces = new Map<string, string>()
  const remember = (directory: string): void => {
    if (directory === workspaceDir) return
    if (!existsSync(join(directory, 'package.json'))) return
    const name = readManifest(directory).name
    if (name !== undefined) siblingWorkspaces.set(directory, name)
  }
  for (const pattern of readManifest(repoRoot).workspaces ?? []) {
    if (!pattern.endsWith('/*')) {
      remember(realpathOrSelf(join(repoRoot, pattern)))
      continue
    }
    const group = join(repoRoot, pattern.slice(0, -2))
    if (!existsSync(group)) continue
    for (const entry of readdirSync(group, { withFileTypes: true })) {
      if (entry.isDirectory()) remember(realpathOrSelf(join(group, entry.name)))
    }
  }

  interface TreeResolution {
    readonly compilerOptions: ts.CompilerOptions
    readonly cache: ts.ModuleResolutionCache
    /** What the tsconfig's relative `paths` substitutions resolve against. */
    readonly pathsBase: string
  }

  const resolutionByTree = new Map<string, TreeResolution>()
  for (const tree of options.trees) {
    const configPath = join(workspaceDir, tree.tsconfig)
    const read = ts.readConfigFile(configPath, ts.sys.readFile)
    if (read.error !== undefined) {
      throw new Error(`cannot read ${configPath}`)
    }
    const parsed = ts.parseJsonConfigFileContent(
      read.config,
      ts.sys,
      dirname(configPath),
    )
    resolutionByTree.set(tree.dir, {
      compilerOptions: parsed.options,
      cache: ts.createModuleResolutionCache(
        workspaceDir,
        (x) => x,
        parsed.options,
      ),
      pathsBase: parsed.options.baseUrl ?? dirname(configPath),
    })
  }

  const filesByTree = new Map<string, string[]>()
  for (const tree of options.trees) {
    const found: string[] = []
    collectFiles(join(workspaceDir, tree.dir), found)
    filesByTree.set(tree.dir, found.sort())
  }

  const treeOf = (file: string): TreeSpec => {
    const owning = options.trees.find((tree) =>
      isInside(join(workspaceDir, tree.dir), file),
    )
    if (owning === undefined) {
      throw new Error(`${file} lies in no scanned tree of ${workspaceDir}`)
    }
    return owning
  }

  /**
   * Resolve, or say so. The TypeScript resolver answers for everything the
   * compiler understands; the fallback exists only for the extensions it
   * deliberately does not — `import './global.css'`,
   * `import '@xterm/xterm/css/xterm.css'`, a `.wav` behind the `@/` alias.
   * It changes only WHETHER a path is produced, never how one is judged: a
   * stylesheet reached at `../../../convergence/src/…` is still a resolved
   * path inside another workspace and still fails.
   */
  const resolveSpecifier = (
    specifier: string,
    containingFile: string,
    tree: TreeSpec,
  ): string | undefined => {
    const resolution = resolutionByTree.get(tree.dir)
    if (resolution === undefined) {
      throw new Error(`no compiler options for tree ${tree.dir}`)
    }
    const resolved = ts.resolveModuleName(
      specifier,
      containingFile,
      resolution.compilerOptions,
      ts.sys,
      resolution.cache,
    ).resolvedModule?.resolvedFileName
    if (resolved !== undefined) return realpathOrSelf(resolved)

    if (specifier.startsWith('.')) {
      const candidate = resolve(dirname(containingFile), specifier)
      return existsSync(candidate) ? realpathOrSelf(candidate) : undefined
    }

    const mapped = applyPathsMapping(specifier, resolution)
    if (mapped !== undefined) return mapped

    const name = packageNameOf(specifier)
    let directory = dirname(containingFile)
    for (;;) {
      const candidate = join(directory, 'node_modules', name)
      if (existsSync(candidate)) return realpathOrSelf(candidate)
      const parent = dirname(directory)
      if (parent === directory) return undefined
      directory = parent
    }
  }

  const check = (file: string, specifier: string): OwnershipVerdict => {
    if (
      specifier.startsWith('node:') ||
      NODE_BUILTINS.has(packageNameOf(specifier))
    ) {
      return { ok: true, owner: 'node builtin' }
    }

    const containingFile = realpathOrSelf(file)
    const resolved = resolveSpecifier(
      specifier,
      containingFile,
      treeOf(containingFile),
    )
    if (resolved === undefined) {
      return {
        ok: false,
        reason: `'${specifier}' resolves nowhere — an import this organ cannot place is a finding, not a skip`,
      }
    }

    const declared = TEST_FILE.test(containingFile)
      ? testDependencies
      : productionDependencies

    // A sibling workspace is asked about FIRST, and about everything under it
    // including its own `node_modules`: reaching THROUGH another workspace's
    // directory is reaching into it, whatever sits at the end of the path.
    // The directory ITSELF counts as inside, because that is where a subpath
    // the package refuses to export comes to rest.
    for (const [directory, name] of siblingWorkspaces) {
      if (resolved !== directory && !isInside(directory, resolved)) continue
      if (!declared.has(name)) {
        return {
          ok: false,
          reason: `'${specifier}' resolves into the '${name}' workspace (${resolved}), which ${manifest.name} does not declare as a dependency`,
        }
      }
      // Declaring a workspace buys the right to depend on it, not the right to
      // reach past its front door. `exports` is that door, and the package name
      // is the only spelling that knocks on it (round 5).
      return specifier === name
        ? { ok: true, owner: name }
        : {
            ok: false,
            reason: `'${specifier}' reaches into the declared '${name}' workspace by path (${resolved}); a declared workspace may only be entered through its package name — import '${name}' instead`,
          }
    }

    const nodeModulesAt = resolved.lastIndexOf(`${sep}node_modules${sep}`)
    if (nodeModulesAt === -1 && isInside(workspaceDir, resolved)) {
      return { ok: true, owner: manifest.name ?? workspaceDir }
    }

    // Own `node_modules` included: npm nests a package there on a version
    // conflict, and a nested copy is still a dependency this workspace must
    // declare.
    if (nodeModulesAt !== -1) {
      const after = resolved.slice(
        nodeModulesAt + `${sep}node_modules${sep}`.length,
      )
      const name = packageNameOf(after.split(sep).join('/'))
      return declared.has(name)
        ? { ok: true, owner: name }
        : {
            ok: false,
            reason: `'${specifier}' resolves to '${name}' (${resolved}), which ${manifest.name} does not declare`,
          }
    }

    return {
      ok: false,
      reason: `'${specifier}' resolves to ${resolved}, which belongs to no workspace and no declared dependency`,
    }
  }

  const sourceFiles = options.trees.flatMap(
    (tree) => filesByTree.get(tree.dir) ?? [],
  )

  return {
    /** Every scanned file, absolute. */
    sourceFiles,
    /** The scanned files of one tree, so a test can prove the tree is reached. */
    filesIn: (treeDir: string): string[] => filesByTree.get(treeDir) ?? [],
    check,
    /** The whole sweep: one formatted line per import that is not owned. */
    violations: (): string[] =>
      sourceFiles.flatMap((file) =>
        importSpecifiersOf(file).flatMap((specifier) => {
          const verdict = check(file, specifier)
          return verdict.ok
            ? []
            : [`${relative(repoRoot, file)}: ${verdict.reason}`]
        }),
      ),
  }
}
