import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  allowlistProblems,
  copiedCodeProblems,
  jscpdArgsOf,
} from './copied-code.pure.mjs'

const clone = (first, second, tokens, lines = 20) => ({
  format: 'tsx',
  lines,
  tokens,
  firstFile: { name: first[0], start: first[1], end: first[1] + lines - 1 },
  secondFile: { name: second[0], start: second[1], end: second[1] + lines - 1 },
})

const reportOf = (duplicates, percentage = 0.1) => ({
  duplicates,
  statistics: { total: { percentage, sources: 10, clones: duplicates.length } },
})

describe('copiedCodeProblems', () => {
  it('passes a report with no clones under the threshold', () => {
    assert.deepEqual(
      copiedCodeProblems({ report: reportOf([], 0.4), threshold: 1 }),
      [],
    )
  })

  it('names both places of every clone, the longest first', () => {
    const report = reportOf([
      clone(
        ['src/a/issues-header.tsx', 3],
        ['src/b/errors-header.tsx', 5],
        116,
        31,
      ),
      clone(['src/c/list.tsx', 40], ['src/d/list.tsx', 42], 201, 25),
    ])
    assert.deepEqual(copiedCodeProblems({ report, threshold: 1 }), [
      'src/c/list.tsx:40-64 and src/d/list.tsx:42-66: 25 lines (201 tokens) copied',
      'src/a/issues-header.tsx:3-33 and src/b/errors-header.tsx:5-35: 31 lines (116 tokens) copied',
    ])
  })

  it('fails a share of copied lines over the threshold, and only when there is one', () => {
    assert.deepEqual(
      copiedCodeProblems({ report: reportOf([], 1.234), threshold: 1 }),
      ['1.23% of the lines are copies, over the threshold of 1%'],
    )
    assert.deepEqual(copiedCodeProblems({ report: reportOf([], 1.234) }), [])
    assert.deepEqual(
      copiedCodeProblems({ report: reportOf([], 1), threshold: 1 }),
      [],
    )
  })

  it('leaves out a clone between two allowlisted files, named in either order', () => {
    const report = reportOf([
      clone(['src/a/list.tsx', 3], ['src/b/list.tsx', 5], 130),
      clone(['src/c/picker.tsx', 40], ['src/d/picker.tsx', 42], 114),
    ])
    const allowlist = [
      { files: ['src/b/list.tsx', 'src/a/list.tsx'], reason: 'measured apart' },
    ]
    assert.deepEqual(copiedCodeProblems({ report, threshold: 1, allowlist }), [
      'src/c/picker.tsx:40-59 and src/d/picker.tsx:42-61: 20 lines (114 tokens) copied',
    ])
  })

  it('reports an allowlist entry that no longer matches a copy', () => {
    const allowlist = [
      { files: ['src/a.tsx', 'src/b.tsx'], reason: 'gone since' },
    ]
    assert.deepEqual(
      copiedCodeProblems({ report: reportOf([]), threshold: 1, allowlist }),
      [
        'src/a.tsx and src/b.tsx: allowlisted, but no longer a copy: take it off the allowlist',
      ],
    )
  })

  it('reads a report without duplicates or statistics as clean', () => {
    assert.deepEqual(copiedCodeProblems({ report: {}, threshold: 1 }), [])
  })
})

describe('jscpdArgsOf', () => {
  it('runs jscpd on the root with the config, writing a JSON report the guard reads', () => {
    const args = jscpdArgsOf({
      config: '/repo/.jscpd.json',
      output: '/tmp/out',
    })
    assert.deepEqual(args.slice(0, 6), [
      '--config',
      '/repo/.jscpd.json',
      '--reporters',
      'json',
      '--output',
      '/tmp/out',
    ])
    assert.equal(args.at(-1), '.')
    assert.deepEqual(
      args.slice(args.indexOf('--exit-code'), args.indexOf('--exit-code') + 2),
      ['--exit-code', '0'],
    )
  })
})

describe('allowlistProblems', () => {
  it('passes entries with two files and a reason', () => {
    assert.deepEqual(
      allowlistProblems([{ files: ['a.ts', 'b.ts'], reason: 'why' }]),
      [],
    )
  })

  it("names every entry that's missing a file or its reason", () => {
    assert.deepEqual(
      allowlistProblems([
        { files: ['a.ts'], reason: 'why' },
        { files: ['a.ts', 'b.ts'] },
        { files: ['a.ts', 'b.ts'], reason: 'fine' },
      ]),
      [
        'allowlist[0]: needs files (two paths) and a reason',
        'allowlist[1]: needs files (two paths) and a reason',
      ],
    )
    assert.deepEqual(allowlistProblems({}), [
      'allowlist: a list of { files: [a, b], reason }',
    ])
  })
})
