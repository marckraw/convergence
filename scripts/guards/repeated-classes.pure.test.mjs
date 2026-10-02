import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  classKeyOf,
  classStringsOf,
  configProblems,
  looksLikeClasses,
  repeatedClasses,
  repeatedClassProblems,
  scanSource,
} from './repeated-classes.pure.mjs'

const where = { attributes: ['className'], functions: ['cn', 'cva'] }
const classesIn = (text, options = where) =>
  classStringsOf(text, options).map(({ classes }) => classes)

const config = {
  files: ['src/**/*.tsx'],
  attributes: ['className'],
  functions: ['cn'],
  minUtilities: 4,
  maxOccurrences: 2,
  allowlist: [],
}
const row = 'flex min-w-0 flex-1 items-center gap-2'

describe('scanSource', () => {
  it('finds string literals, and blanks them and comments out of the code', () => {
    const text = [
      'const a = "one two";',
      '// a comment with "a quote" and cn(\'x\')',
      "const b = 'three';",
      '/* a block with `a template` */',
      'const c = `four ${b} five`;',
      'const d = `six`;',
    ].join('\n')
    const { code, strings } = scanSource(text)
    assert.deepEqual(
      strings.map((string) => string.value),
      ['one two', 'three', null, 'six'],
    )
    assert.equal(code.length, text.length)
    assert.equal(code.split('\n').length, text.split('\n').length)
    assert.doesNotMatch(code, /quote|comment|block|one two|three/)
    assert.match(code, /const c = `[ ]+\$\{b\}[ ]+`;/)
  })

  it("isn't fooled by quotes in regular expressions, or by an apostrophe in JSX text", () => {
    const text = [
      'const re = /["\']/g;',
      'const ratio = total / count / 2;',
      "const view = <p>Don't panic</p>;",
      'const after = "seen";',
    ].join('\n')
    assert.deepEqual(
      scanSource(text).strings.map((string) => string.value),
      ['seen'],
    )
  })

  it("reads strings inside a template's expression as code's", () => {
    const text = 'const label = `${cn("a b c d")} done`;'
    const values = scanSource(text).strings.map((string) => string.value)
    assert.deepEqual(values, [null, 'a b c d'])
  })
})

describe('classStringsOf', () => {
  it('reads className strings, and every string inside className={…}', () => {
    const text = [
      'export function Row({ busy }) {',
      '  return (',
      `    <div className="${row}">`,
      `      <span className={busy ? "a b c d" : 'e f g h'} />`,
      `      <i className={\`i j k l\`} title="not a class string at all" />`,
      '    </div>',
      '  );',
      '}',
    ].join('\n')
    assert.deepEqual(classStringsOf(text, where), [
      { classes: row, line: 3 },
      { classes: 'a b c d', line: 4 },
      { classes: 'e f g h', line: 4 },
      { classes: 'i j k l', line: 5 },
    ])
  })

  it('reads the arguments of class functions, nested calls and conditions included', () => {
    const text = [
      'const a = cn("p q r s", open && "t u v w", sizes({ size: "sm" }), [x, "y z"]);',
      'const b = cva("base one two three", { variants: { size: { sm: "h-8 px-3 text-sm gap-1" } } });',
      'const c = notcn("ignored one two three");',
      'const d = other.cn("ignored too, it is a method");',
    ].join('\n')
    assert.deepEqual(classesIn(text), [
      'p q r s',
      't u v w',
      'sm',
      'y z',
      'base one two three',
      'h-8 px-3 text-sm gap-1',
    ])
  })

  it('reads every string in a class file, and nothing in comments', () => {
    const text = [
      '/** The row: `flex never counted`. */',
      `export const rowLink = "${row}";`,
      'export const ring = ["outline-none a b", "c d"].join(" ");',
    ].join('\n')
    assert.deepEqual(classesIn(text, { ...where, wholeFile: true }), [
      row,
      'outline-none a b',
      'c d',
      ' ',
    ])
  })

  it("leaves out a template literal with an expression: what it holds isn't known until it runs", () => {
    const text = 'const a = <div className={`flex gap-2 ${tone} p-4`} />;'
    assert.deepEqual(classesIn(text), [])
  })

  it('with constants, reads a class string a declaration or an object key holds, in any file', () => {
    const text = [
      `const row = "${row}";`,
      `export const styles = { root: '${row}', 'quoted-key': "flex-1 min-w-0 truncate block" };`,
      'const sentence = "Couldn\'t load the people.";',
      "const label = 'Mission control';",
      "call('flex items-center gap-2 px-2');",
    ].join('\n')
    assert.deepEqual(classesIn(text), [])
    assert.deepEqual(classesIn(text, { ...where, constants: true }), [
      row,
      row,
      'flex-1 min-w-0 truncate block',
    ])
  })

  it("isn't fooled by className or cn( in a comment or a string", () => {
    const text = [
      '// <div className="a b c d">',
      'const help = "write cn(\\"x y z w\\") here";',
    ].join('\n')
    assert.deepEqual(classesIn(text), [])
  })
})

describe('looksLikeClasses', () => {
  it('takes utilities, and never a sentence or a name', () => {
    assert.equal(looksLikeClasses('flex min-w-0 items-center gap-2'), true)
    assert.equal(
      looksLikeClasses('grid grid-cols-[auto_1fr] hover:bg-fill-hover'),
      true,
    )
    assert.equal(looksLikeClasses('relative truncate'), true)
    assert.equal(looksLikeClasses("Couldn't save the project."), false)
    assert.equal(looksLikeClasses('the quick brown fox'), false)
    assert.equal(looksLikeClasses('Mission Control'), false)
  })
})

describe('classKeyOf', () => {
  it('is the same for the same utilities in any order and spacing', () => {
    assert.equal(
      classKeyOf(' gap-2  flex\nitems-center flex'),
      'flex gap-2 items-center',
    )
    assert.equal(
      classKeyOf('items-center flex gap-2'),
      classKeyOf('gap-2 items-center flex'),
    )
  })
})

describe('repeatedClasses', () => {
  const source = (path, text, wholeFile = false) => ({ path, text, wholeFile })

  it('passes a class string used twice, and fails the third copy, in any order', () => {
    const twice = [
      source('src/a.tsx', `<div className="${row}" />`),
      source('src/b.styles.ts', `export const x = "${row}";`, true),
    ]
    assert.deepEqual(repeatedClasses({ sources: twice, config }), {
      repeats: [],
      stale: [],
    })

    const thrice = [
      ...twice,
      source(
        'src/c.tsx',
        "const c = cn('gap-2 items-center flex flex-1 min-w-0');",
      ),
    ]
    assert.deepEqual(repeatedClasses({ sources: thrice, config }).repeats, [
      { classes: row, at: ['src/a.tsx:1', 'src/b.styles.ts:1', 'src/c.tsx:1'] },
    ])
  })

  it('counts copies in one file too, and lets short strings repeat', () => {
    const text = [
      `<a className="${row}" />`,
      `<b className="${row}" />`,
      `<i className="${row}" />`,
      '<u className="flex items-center gap-2" />'.repeat(5),
    ].join('\n')
    const { repeats } = repeatedClasses({
      sources: [source('src/a.tsx', text)],
      config,
    })
    assert.deepEqual(
      repeats.map(({ classes, at }) => [classes, at.length]),
      [[row, 3]],
    )
  })

  it('leaves out allowlisted strings, and reports an allowlist entry nothing needs', () => {
    const sources = ['a', 'b', 'c'].map((name) =>
      source(`src/${name}.tsx`, `<div className="${row}" />`),
    )
    const allowlist = [
      {
        classes: 'items-center gap-2 flex min-w-0 flex-1',
        reason: 'the shared row, until MAR-1',
      },
      { classes: 'grid gap-4 p-4 text-sm', reason: 'gone since' },
    ]
    assert.deepEqual(
      repeatedClasses({ sources, config: { ...config, allowlist } }),
      {
        repeats: [],
        stale: ['grid gap-4 p-4 text-sm'],
      },
    )
  })

  it('puts the most copied string first', () => {
    const many = 'grid gap-4 p-4 text-sm'
    const sources = [1, 2, 3, 4].map((n) =>
      source(
        `src/${n}.tsx`,
        `<i className="${many}" />${n < 4 ? `<b className="${row}" />` : ''}`,
      ),
    )
    const { repeats } = repeatedClasses({ sources, config })
    assert.deepEqual(
      repeats.map(({ classes }) => classes),
      [many, row],
    )
  })
})

describe('repeatedClassProblems', () => {
  it('says what was copied, how often, and where', () => {
    const lines = repeatedClassProblems(
      {
        repeats: [{ classes: row, at: ['a.tsx:1', 'b.tsx:2', 'c.tsx:3'] }],
        stale: ['x y z w'],
      },
      config,
    )
    assert.equal(lines.length, 2)
    assert.match(
      lines[0],
      /^"flex min-w-0 flex-1 items-center gap-2": 3 copies, at most 2: /,
    )
    assert.match(lines[0], /a\.tsx:1, b\.tsx:2, c\.tsx:3/)
    assert.match(
      lines[1],
      /^"x y z w": allowlisted, but no longer copied more than 2 times/,
    )
  })
})

describe('configProblems', () => {
  it('passes a whole config', () => {
    assert.deepEqual(
      configProblems({
        ...config,
        exclude: [],
        classFiles: ['**/*.styles.ts'],
      }),
      [],
    )
  })

  it("names every field that's missing or wrong", () => {
    const problems = configProblems({
      files: [],
      classFiles: '**/*.styles.ts',
      minUtilities: 0,
      allowlist: [{ classes: 'a b c d' }],
    })
    assert.deepEqual(problems, [
      'files: a list of globs, at least one',
      'classFiles: a list of strings',
      'minUtilities: a whole number, 1 or more',
      'maxOccurrences: a whole number, 1 or more',
      'allowlist[0]: needs classes and a reason',
    ])
  })
})
