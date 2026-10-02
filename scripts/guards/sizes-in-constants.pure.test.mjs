import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  configProblems,
  expressionEnd,
  moduleOf,
  namesIn,
  resolverFor,
  sizeProblems,
  sizesInConstants,
} from './sizes-in-constants.pure.mjs'

/** The repo's Button pattern and the field pattern, as the config writes them. */
const BUTTON =
  '(?:size|h|w)-(?:\\d+(?:\\.5)?|px)|text-(?:3xs|2xs|xs|sm|base|lg|xl|[2-9]xl)|p[xytrbl]?-(?:\\d+(?:\\.5)?|px)|(?:min-|max-)?h-(?:\\d+(?:\\.5)?|px|control-[\\w-]+|\\(--[\\w-]+\\)|auto)'
const FIELD =
  'text-(?:3xs|2xs|xs|sm|base|lg|xl|[2-9]xl)|p[xy]?-(?:\\d+(?:\\.5)?|px)'

const config = {
  files: ['src/**/*.{ts,tsx}'],
  parts: [
    {
      tags: ['Button', 'IconButton'],
      attributes: ['className'],
      pattern: BUTTON,
      linkPattern: '(?:size|h|w)-(?:\\d+(?:\\.5)?|px)',
    },
    {
      tags: ['Wrapper', '*'],
      attributes: ['triggerClassName'],
      pattern: BUTTON,
      inPlace: true,
    },
    { tags: ['Notice', 'Input'], attributes: ['className'], pattern: FIELD },
  ],
  allowlist: [],
}

/** Runs the guard over a little tree of files, { path: text }. */
const run = (files, overrides = {}) => {
  const sources = Object.entries(files).map(([path, text]) => ({ path, text }))
  const paths = sources.map(({ path }) => path)
  return sizesInConstants({
    sources,
    config: { ...config, ...overrides },
    resolve: resolverFor(paths, { '@/': 'src/' }),
  })
}
const lines = (files, overrides) => sizeProblems(run(files, overrides))

describe('expressionEnd', () => {
  it('ends a value at a line that neither ends nor starts an operator', () => {
    const code = "const a =\n  'one' +\n  'two'\nconst b = 1"
    const from = code.indexOf('=') + 1
    assert.equal(
      code.slice(from, expressionEnd(code, from)).trim(),
      "'one' +\n  'two'",
    )
  })

  it("ends an object's value at its comma, and keeps an arrow's body", () => {
    const code = "{ a: cn('x',\n 'y'), b: (s) =>\n  s }"
    const from = code.indexOf(':') + 1
    assert.equal(
      code.slice(from, expressionEnd(code, from)).trim(),
      "cn('x',\n 'y')",
    )
    const b = code.indexOf('b:') + 2
    assert.equal(code.slice(b, expressionEnd(code, b)).trim(), '(s) =>\n  s')
  })
})

describe('moduleOf and namesIn', () => {
  it('knows declarations, imports and re-exports', () => {
    const module = moduleOf(
      [
        "import { a, b as c } from './x'",
        "import type { T } from '@/y'",
        "export { d as e } from './z'",
        "export * from './w'",
        "export const ROW = 'px-2'",
        'export function rowClass(on: boolean) {',
        "  return on ? 'h-auto' : ''",
        '}',
      ].join('\n'),
    )
    assert.deepEqual([...module.declarations.keys()], ['ROW', 'rowClass'])
    assert.deepEqual(module.imports.get('c'), { source: './x', imported: 'b' })
    assert.deepEqual(module.imports.get('T'), { source: '@/y', imported: 'T' })
    assert.deepEqual(
      module.reexports.map(({ source, names }) => [
        source,
        names && [...names],
      ]),
      [
        ['./z', [['e', 'd']]],
        ['./w', null],
      ],
    )
  })

  it('names the uses in a class expression, never a key or an attribute', () => {
    const code =
      'cn(styles.item, open && PILL, tone[x], rowClass(on), { key: 1 }, a ? b : c)'
    assert.deepEqual(
      namesIn(code, 0, code.length).map(({ name, members, computed }) => [
        name,
        members.join('.'),
        computed,
      ]),
      [
        ['cn', '', false],
        ['styles', 'item', false],
        ['open', '', false],
        ['PILL', '', false],
        ['tone', '', true],
        ['x', '', false],
        ['rowClass', '', false],
        ['on', '', false],
        ['a', '', false],
        ['b', '', false],
        ['c', '', false],
      ],
    )
  })
})

describe('sizesInConstants', () => {
  it('follows a constant, a member, a call and an import to the size they hand a Button', () => {
    const problems = lines({
      'src/row.styles.ts': [
        "const PILL = 'rounded-full px-4 text-sm'",
        'export const styles = {',
        '  trigger: `${PILL} w-24`,',
        "  quiet: 'text-ink-muted',",
        '}',
        'export function rowClass(on: boolean) {',
        "  return on ? 'h-auto bg-fill-selected' : 'h-auto'",
        '}',
      ].join('\n'),
      'src/index.ts': "export { styles as rowStyles } from './row.styles'",
      'src/row.presentational.tsx': [
        "import { rowStyles } from '@/index'",
        "import { rowClass } from './row.styles'",
        'export const Row = () => (',
        '  <>',
        '    <Button className={rowStyles.trigger}>Go</Button>',
        '    <Button className={rowStyles.quiet}>Quiet</Button>',
        '    <IconButton className={rowClass(true)} label="x" />',
        '  </>',
        ')',
      ].join('\n'),
    })
    assert.deepEqual(
      problems,
      [
        'src/row.presentational.tsx:5: <Button> className gets "px-4 text-sm" from rowStyles.trigger (src/row.styles.ts:1)',
        'src/row.presentational.tsx:5: <Button> className gets "w-24" from rowStyles.trigger (src/row.styles.ts:3)',
        'src/row.presentational.tsx:7: <IconButton> className gets "h-auto" from rowClass (src/row.styles.ts:7)',
        'src/row.presentational.tsx:7: <IconButton> className gets "h-auto" from rowClass (src/row.styles.ts:7)',
      ].filter((line, index, all) => all.indexOf(line) === index),
    )
  })

  it('reads every value of an object read by a computed key', () => {
    const problems = lines({
      'src/tone.tsx': [
        "const TONE = { a: 'bg-x', b: 'text-xs' }",
        'export const T = ({ k }) => <Notice className={TONE[k]} title="t" />',
      ].join('\n'),
    })
    assert.deepEqual(problems, [
      'src/tone.tsx:2: <Notice> className gets "text-xs" from TONE (src/tone.tsx:1)',
    ])
  })

  it('leaves what is written in place on a part to the regex rules, but reads it on a wrapper', () => {
    const problems = lines({
      'src/x.tsx': [
        'export const X = () => (<><Button className="px-2">a</Button><Input className={cn(\'text-xs\')} />',
        '<Wrapper triggerClassName="w-full px-2 text-xs" /></>)',
      ].join('\n'),
    })
    assert.deepEqual(problems, [
      'src/x.tsx:2: <Wrapper> triggerClassName gets "px-2 text-xs" written in place (src/x.tsx:2)',
    ])
  })

  it("reads the tag's own className, not one inside a prop", () => {
    const problems = lines({
      'src/y.tsx': [
        "const QUIET = 'text-ink-muted'",
        "const GLYPH = 'h-3.5 w-3.5'",
        'export const Y = () => (',
        '  <Button icon={<Zap className={GLYPH} />} className={QUIET}>y</Button>',
        ')',
      ].join('\n'),
    })
    assert.deepEqual(problems, [])
  })

  it('lets a link Button take a text size, but not a fixed height or width', () => {
    const problems = lines({
      'src/z.tsx': [
        "const WORDS = 'text-sm w-40'",
        'export const Z = () => <Button variant="link" className={WORDS}>z</Button>',
      ].join('\n'),
    })
    assert.deepEqual(problems, [
      'src/z.tsx:2: <Button> className gets "w-40" from WORDS (src/z.tsx:1)',
    ])
  })

  it('ignores a utility behind a variant, and an object key that looks like one', () => {
    const problems = lines({
      'src/v.tsx': [
        "const ICON = { 'h-4': 'hover:px-2 [&_svg]:size-4 sm:w-40' }",
        'export const V = ({ k }) => <Button className={ICON[k]}>v</Button>',
      ].join('\n'),
    })
    assert.deepEqual(problems, [])
  })

  it('keeps an allowlisted constant, and reports an entry nothing uses', () => {
    const files = {
      'src/a.styles.ts': "export const TAB = 'h-14 w-5'",
      'src/a.tsx': [
        "import { TAB } from './a.styles'",
        'export const A = () => <IconButton className={TAB} label="a" />',
      ].join('\n'),
    }
    const allowlist = [
      {
        path: 'src/a.styles.ts',
        name: 'TAB',
        utilities: ['h-14', 'w-5'],
        reason: 'an edge',
      },
      {
        path: 'src/a.styles.ts',
        name: 'GONE',
        utilities: ['px-1'],
        reason: 'was',
      },
    ]
    assert.deepEqual(lines(files, { allowlist }), [
      'src/a.styles.ts: GONE is allowlisted for "px-1", but no part gets them from it any more: take it off the allowlist',
    ])
  })
})

describe('resolverFor', () => {
  it('resolves relative and aliased sources to known files, and a package to null', () => {
    const resolve = resolverFor(
      ['src/a/b.styles.ts', 'src/c/index.ts', 'src/d.tsx'],
      { '@/': 'src/' },
    )
    assert.equal(resolve('src/a/x.tsx', './b.styles'), 'src/a/b.styles.ts')
    assert.equal(resolve('src/a/x.tsx', '@/c'), 'src/c/index.ts')
    assert.equal(resolve('src/a/x.tsx', '../d'), 'src/d.tsx')
    assert.equal(resolve('src/a/x.tsx', '@convergence/ui'), null)
  })
})

describe('configProblems', () => {
  it('accepts the shape and names what is missing', () => {
    assert.deepEqual(configProblems(config), [])
    assert.deepEqual(
      configProblems({
        files: [],
        parts: [{ tags: ['Button'], attributes: ['className'], pattern: '(' }],
        allowlist: [{ path: 'x', name: 'y', utilities: ['z'] }],
      }),
      [
        'files: a list of globs, at least one',
        'parts[0]: Invalid regular expression: /(/: Unterminated group',
        'allowlist[0]: needs path, name, utilities and a reason',
      ],
    )
  })
})
