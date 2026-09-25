import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { WALK_TEST_TIMEOUT_MS } from './walk-budget'

const WORKSPACE = fileURLToPath(new URL('../', import.meta.url))

/**
 * The tests that answer a question by reading a source tree (MAR-2989).
 *
 * Listed here rather than discovered, for the same reason the real-git budget
 * lists its suites: adding a walk without a budget should be a decision
 * somebody makes on purpose, and a discovery rule would have to guess which
 * `readdirSync` is a tree and which is one folder.
 */
const TREE_WALKING_TESTS = [
  'electron/backend/context-drill/context-alert-boundary.test.ts',
  'electron/backend/crew/ajv-import-guard.test.ts',
  'src/features/command-center/command-palette-orphans.test.ts',
  'workspace-import-ownership.test.ts',
  // This file's own sweep below reads every `*.pure.test.ts` in both trees.
  'test/walk-budget.test.ts',
  // Every docblock in both trees documents something (MAR-3151).
  'electron/backend/docblock-shape.walk.test.ts',
  // No guided-review paper in the repo skills or specs (MAR-3317).
  'test/guided-review-paper.walk.test.ts',
  // Every repo `.md` path the agent-facing docs name exists (MAR-3178).
  'test/doc-links.walk.test.ts',
  // No DialogTrigger whose value starts with a Tooltip root (MAR-3358).
  'src/widgets/sidebar/sidebar-settings-trigger.walk.test.ts',
  // No surface draws the raw SessionBadge (MAR-3288). Already on the budget.
  'src/entities/session/session-badge-sites.test.ts',
  // Each card-state tone class lives in one non-test file (MAR-3366).
  'src/features/needs-you/needs-you-card-state.styles.test.ts',
  // No source says the app starts a ready ticket by itself (MAR-2981 R15).
  'src/features/waves/learn-loom-copy.walk.test.ts',
  // No plugin motion token survives in non-test source (MAR-3319).
  'src/shared/ui/motion.styles.walk.test.ts',
  // The sidebar's hover hints stay on the shared Tooltip (MAR-3314).
  'src/widgets/sidebar/sidebar-tooltip-sites.test.ts',
]

/**
 * Recursive walks of a directory the test itself created (MAR-3385).
 *
 * An exemption is a name, not a rule. A new test that walks a temp folder
 * the same way stays red until someone writes its path here, with a reason.
 * These do not spend `WALK_TEST_TIMEOUT_MS`: their size does not grow with
 * the repository, so the budget loop above does not read this list.
 */
const TEMP_TREE_WALKS = [
  // `sumRegularFileBytes` walks the temp lane copy the test just built, never the repo.
  'electron/backend/lane/lane.service.test.ts',
]

/** The configs that run one of the walkers above. */
const CONFIGS_RUNNING_A_WALK = [
  'vitest.pure.config.ts',
  'vitest.unit.config.ts',
]

/** Enumerating a directory — the cost that grows with the repository. */
const DIRECTORY_ENUMERATION =
  /\breaddirSync\b|\breaddir\b|\bglobSync\b|\bopendirSync\b/

function pureModuleTests(directory: string): string[] {
  return readdirSync(directory, { recursive: true })
    .map(String)
    .filter((file) => file.endsWith('.pure.test.ts'))
    .map((file) => join(directory, file))
}

/** A directory read. `mkdir` / `rm` with `recursive: true` are not walks. */
const DIRECTORY_READ = /\b(?:readdirSync|readdir|globSync|opendirSync)\s*\(/g

function skipSpace(source: string, index: number): number {
  let i = index
  while (i < source.length) {
    if (/\s/.test(source[i])) {
      i++
      continue
    }
    if (source.startsWith('//', i)) {
      const nl = source.indexOf('\n', i)
      i = nl < 0 ? source.length : nl + 1
      continue
    }
    if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2)
      i = end < 0 ? source.length : end + 2
      continue
    }
    break
  }
  return i
}

/** Index of the matching closer, respecting strings and comments. */
function matchingCloser(
  source: string,
  openIndex: number,
  open: string,
  close: string,
): number {
  let depth = 0
  let quote: string | null = null
  for (let i = openIndex; i < source.length; i++) {
    const char = source[i]
    if (quote) {
      if (char === '\\') {
        i++
        continue
      }
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }
    if (char === '/' && source[i + 1] === '/') {
      const nl = source.indexOf('\n', i)
      i = nl < 0 ? source.length : nl
      continue
    }
    if (char === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      i = end < 0 ? source.length : end + 1
      continue
    }
    if (char === open) depth++
    else if (char === close) {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * Where a return type ends and the body can start.
 *
 * An object type (`: { a: string }`) is skipped: after its closing brace the
 * next token is another `{` (a function) or `=>` (an arrow). The brace that
 * is not followed by either of those is the function body.
 */
function returnTypeEnds(source: string, from: number, arrow: boolean): number {
  let angle = 0
  let paren = 0
  let brace = 0
  let bracket = 0
  let quote: string | null = null
  for (let i = from; i < source.length; i++) {
    const char = source[i]
    if (quote) {
      if (char === '\\') {
        i++
        continue
      }
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }
    if (char === '/' && source[i + 1] === '/') {
      const nl = source.indexOf('\n', i)
      i = nl < 0 ? source.length : nl
      continue
    }
    if (char === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      i = end < 0 ? source.length : end + 1
      continue
    }
    if (char === '<') angle++
    else if (char === '>') angle = Math.max(0, angle - 1)
    else if (char === '(') paren++
    else if (char === ')') paren = Math.max(0, paren - 1)
    else if (char === '[') bracket++
    else if (char === ']') bracket = Math.max(0, bracket - 1)
    else if (char === '{') {
      if (angle === 0 && paren === 0 && bracket === 0 && brace === 0) {
        const close = matchingCloser(source, i, '{', '}')
        if (close < 0) return i
        const next = skipSpace(source, close + 1)
        const typeBrace =
          source[next] === '{' || (arrow && source.startsWith('=>', next))
        if (typeBrace) {
          i = close
          continue
        }
        return i
      }
      brace++
    } else if (char === '}') brace = Math.max(0, brace - 1)
    else if (
      arrow &&
      angle === 0 &&
      paren === 0 &&
      brace === 0 &&
      bracket === 0 &&
      source.startsWith('=>', i)
    ) {
      return i
    }
  }
  return source.length
}

/** Index of the function body `{`, or -1 when the declaration is not a block. */
function bodyOpen(source: string, paramsClose: number, arrow: boolean): number {
  let i = skipSpace(source, paramsClose + 1)
  if (source[i] === ':')
    i = skipSpace(source, returnTypeEnds(source, i + 1, arrow))
  if (arrow) {
    if (!source.startsWith('=>', i)) return -1
    i = skipSpace(source, i + 2)
  }
  return source[i] === '{' ? i : -1
}

function functionBodies(source: string): Array<{ name: string; body: string }> {
  const found: Array<{ name: string; body: string }> = []
  const consider = (name: string, paren: number, arrow: boolean) => {
    const paramsClose = matchingCloser(source, paren, '(', ')')
    if (paramsClose < 0) return
    const open = bodyOpen(source, paramsClose, arrow)
    if (open < 0) return
    const close = matchingCloser(source, open, '{', '}')
    if (close < 0) return
    found.push({ name, body: source.slice(open + 1, close) })
  }

  const functionDecl =
    /(?:^|[\s;}])(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g
  for (const match of source.matchAll(functionDecl)) {
    consider(match[1], match.index + match[0].length - 1, false)
  }

  const assigned =
    /(?:^|[\s;}])(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function(?:\s+[A-Za-z_$][\w$]*)?\s*\(|\()/g
  for (const match of source.matchAll(assigned)) {
    const arrow = !match[0].includes('function')
    consider(match[1], match.index + match[0].length - 1, arrow)
  }
  return found
}

function readsDirectoryRecursively(source: string): boolean {
  for (const match of source.matchAll(DIRECTORY_READ)) {
    const open = match.index + match[0].length - 1
    const close = matchingCloser(source, open, '(', ')')
    if (close < 0) continue
    if (/\brecursive\s*:\s*true\b/.test(source.slice(open, close + 1))) {
      return true
    }
  }
  return false
}

/**
 * A helper that reads a directory and calls itself — the walk that descends
 * into subdirectories without passing `recursive: true`.
 */
function callsItselfOnSubdirectories(source: string): boolean {
  const call = /\b(?:readdirSync|readdir|globSync|opendirSync)\s*\(/
  return functionBodies(source).some(
    ({ name, body }) =>
      call.test(body) && new RegExp(`\\b${name}\\s*\\(`).test(body),
  )
}

function isRecursiveTreeWalk(source: string): boolean {
  return (
    readsDirectoryRecursively(source) || callsItselfOnSubdirectories(source)
  )
}

/** Every `*.test.ts` / `*.test.tsx` under `src/` and `electron/`. */
function testSources(): string[] {
  return ['src', 'electron'].flatMap((tree) =>
    readdirSync(join(WORKSPACE, tree), { recursive: true })
      .map(String)
      .filter((file) => !file.includes('node_modules'))
      .map((file) => file.split('\\').join('/'))
      .filter((file) => /\.test\.tsx?$/.test(file))
      .map((file) => `${tree}/${file}`),
  )
}

describe('the tree-walk time budget', () => {
  it('is patient enough to survive a loaded suite', () => {
    // The recorded failures died at vitest's 5s default while the walk was
    // still reading. Anything near that boundary would just move the flake.
    expect(WALK_TEST_TIMEOUT_MS).toBeGreaterThanOrEqual(20_000)
  })

  it('is in force in every test that walks a tree', () => {
    // Guards the actual failure: a budget that exists in a constants file but
    // is not applied is indistinguishable from no budget at all.
    for (const walker of TREE_WALKING_TESTS) {
      const source = readFileSync(join(WORKSPACE, walker), 'utf8')

      expect(
        source.includes('WALK_TEST_TIMEOUT_MS'),
        `${walker} walks a tree but does not spend the named budget`,
      ).toBe(true)
    }
  })

  it('leaves no inline walk timeout behind it', () => {
    // The literals MAR-2989 replaced: 30_000 in the AJV guard, 20_000 in the
    // import-ownership sweep. One name, one place, or the drift comes back.
    for (const walker of TREE_WALKING_TESTS) {
      const source = readFileSync(join(WORKSPACE, walker), 'utf8')

      expect(
        /timeout:\s*[0-9_]+|\}\s*,\s*[0-9_]{4,}\s*\)/.test(source),
        `${walker} still carries an inline timeout literal`,
      ).toBe(false)
    }
  })

  it(
    'keeps directory walks out of the tests named for pure modules',
    { timeout: WALK_TEST_TIMEOUT_MS },
    () => {
      // `*.pure.test.ts` is the test OF a `*.pure.ts` module — all 230 of them
      // sit beside the module they name. A directory walk filed in one buys
      // repository-sized, load-sensitive cost inside a module suite, which is
      // exactly how the AJV guard became the test that lost the race. Walks
      // belong in their own file, where what timed out is never in doubt.
      const walkers = ['src', 'electron']
        .flatMap((tree) => pureModuleTests(join(WORKSPACE, tree)))
        .filter((file) =>
          DIRECTORY_ENUMERATION.test(readFileSync(file, 'utf8')),
        )
        .map((file) => file.slice(WORKSPACE.length))

      expect(walkers).toEqual([])
    },
  )

  it(
    'names every recursive tree walk under src and electron',
    { timeout: WALK_TEST_TIMEOUT_MS },
    () => {
      // MAR-3385. The old sweep only opened `*.pure.test.ts`, so a walk filed
      // in a render test or a styles test never had to be listed. Every
      // recursive walk under these two trees is now either budgeted by name
      // or exempt by name. A temp-folder walk is not a kind: it stays red
      // until its path is written into `TEMP_TREE_WALKS`.
      const found = testSources()
        .filter((file) =>
          isRecursiveTreeWalk(readFileSync(join(WORKSPACE, file), 'utf8')),
        )
        .sort()
      const named = [...TREE_WALKING_TESTS, ...TEMP_TREE_WALKS]
        .filter(
          (file) => file.startsWith('src/') || file.startsWith('electron/'),
        )
        .sort()

      expect(found).toEqual(named)
    },
  )

  it('keeps the budget local rather than raising it for everything', () => {
    // A raised global default would hide a genuine hang anywhere in the suite.
    for (const config of CONFIGS_RUNNING_A_WALK) {
      expect(
        readFileSync(join(WORKSPACE, config), 'utf8'),
        `${config} raises the default for every test instead of the walks`,
      ).not.toMatch(/testTimeout/)
    }
  })
})
