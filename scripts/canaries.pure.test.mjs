import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  canaryChaperoneConfigOf,
  canaryHeaderOf,
  chaperoneRuleIdOf,
  eslintChecksOf,
  eslintHitsOf,
  FIRED,
  guardNameOf,
  guardVerdictOf,
  isLocalPreset,
  NO_CANARY,
  SILENT,
  summaryOf,
  verdictsOf,
} from './canaries.pure.mjs'

describe('canaryHeaderOf', () => {
  it('reads the checks from a canary line in any comment style', () => {
    assert.deepEqual(canaryHeaderOf('// canary: a, b\nconst x = 1'), ['a', 'b'])
    assert.deepEqual(canaryHeaderOf('/* canary: no-raw-colors */\n.x {}'), [
      'no-raw-colors',
    ])
    assert.deepEqual(canaryHeaderOf('# canary: ci\nname: CI'), ['ci'])
    assert.deepEqual(
      canaryHeaderOf('-- canary: no-conflict-markers\nSELECT 1;'),
      ['no-conflict-markers'],
    )
  })

  it("is empty for a file that isn't a canary, or names one further down", () => {
    assert.deepEqual(canaryHeaderOf('export const x = 1\n'), [])
    assert.deepEqual(canaryHeaderOf('1\n2\n3\n4\n5\n// canary: late'), [])
  })
})

describe('chaperoneRuleIdOf', () => {
  it("drops the rule type, keeping a preset's own slash", () => {
    assert.equal(
      chaperoneRuleIdOf('forbidden-import/renderer-fsd-public-api-imports'),
      'renderer-fsd-public-api-imports',
    )
    assert.equal(
      chaperoneRuleIdOf('file-pairing/preset/pure-tests-need-source'),
      'preset/pure-tests-need-source',
    )
  })
})

describe('verdictsOf', () => {
  const expectations = [
    { check: 'a', file: 'one.ts' },
    { check: 'a', file: 'two.ts' },
    { check: 'b', file: 'one.ts' },
  ]

  it('fires a check only when it reported every fixture that names it', () => {
    const rows = verdictsOf({
      checks: ['a', 'b', 'c'],
      expectations,
      hits: [
        { check: 'a', file: 'one.ts' },
        { check: 'b', file: 'one.ts' },
        { check: 'b', file: 'other.ts' },
      ],
    })
    assert.deepEqual(
      rows.map(({ check, verdict, silent }) => ({ check, verdict, silent })),
      [
        { check: 'a', verdict: SILENT, silent: ['two.ts'] },
        { check: 'b', verdict: FIRED, silent: [] },
        { check: 'c', verdict: NO_CANARY, silent: [] },
      ],
    )
  })

  it('counts a check whose canary lives in another section', () => {
    const [row] = verdictsOf({
      checks: ['single-react-component-per-file'],
      expectations: [],
      hits: [],
      coveredElsewhere: new Map([
        [
          'single-react-component-per-file',
          'canaries/guards/single-react-component-per-file',
        ],
      ]),
    })
    assert.equal(row.verdict, FIRED)
    assert.deepEqual(row.canaries, [
      'canaries/guards/single-react-component-per-file',
    ])
  })

  it('flags a fixture that names a check nobody runs, which would otherwise pass unseen', () => {
    const rows = verdictsOf({
      checks: [],
      expectations: [{ check: 'typo', file: 'x.ts' }],
      hits: [],
    })
    assert.equal(rows[0].verdict, SILENT)
    assert.equal(rows[0].unknown, true)
  })
})

describe('isLocalPreset', () => {
  it('is a ./ or ../ path, never a built-in chaperone/ preset', () => {
    assert.equal(isLocalPreset('./apps/convergence/presets/a.json'), true)
    assert.equal(isLocalPreset('../shared/b.json'), true)
    assert.equal(isLocalPreset('chaperone/pure-functions'), false)
  })
})

describe('guardNameOf', () => {
  it("is a scripts/guards script's name, or else the rule's id", () => {
    assert.equal(
      guardNameOf({
        id: 'copied-code-guard',
        args: ['scripts/guards/copied-code.mjs'],
      }),
      'copied-code',
    )
    assert.equal(
      guardNameOf({
        id: 'single-react-component-per-file',
        args: ['apps/convergence/tools/chaperone/check.mjs', '--scope', 'src'],
      }),
      'single-react-component-per-file',
    )
    assert.equal(guardNameOf({ id: 'bare' }), 'bare')
  })
})

describe('canaryChaperoneConfigOf', () => {
  const config = {
    version: '1.0.0',
    extends: ['./presets/a.json', 'chaperone/pure-functions'],
    include: ['apps/convergence/src/**/*'],
    exclude: ['/canaries'],
    rules: {
      custom: [
        { id: 'regex-rule', type: 'regex' },
        { id: 'own-guard', type: 'command', command: 'node' },
      ],
    },
  }

  it('drops command rules and the tool runners, and resolves local presets from elsewhere', () => {
    const canary = canaryChaperoneConfigOf({
      config,
      presetCommandIds: ['preset-guard'],
      extendsOf: (specifier) => `../repo/${specifier.slice(2)}`,
    })
    assert.deepEqual(canary.extends, [
      '../repo/presets/a.json',
      'chaperone/pure-functions',
    ])
    assert.deepEqual(canary.include, config.include)
    assert.deepEqual(canary.exclude, config.exclude)
    assert.deepEqual(canary.rules, {
      typescript: { enabled: false },
      eslint: { enabled: false },
      prettier: { enabled: false },
      custom: [
        { id: 'regex-rule', type: 'regex' },
        { id: 'preset-guard', type: 'command', disabled: true },
      ],
    })
  })

  it('leaves a config without extends without them, and the original untouched', () => {
    const plain = { rules: { custom: [] } }
    const canary = canaryChaperoneConfigOf({
      config: plain,
      presetCommandIds: [],
      extendsOf: () => assert.fail('nothing to resolve'),
    })
    assert.equal('extends' in canary, false)
    assert.deepEqual(plain, { rules: { custom: [] } })
  })
})

describe('eslintChecksOf', () => {
  it('is every rule the repo names itself, not a spread preset’s, and not one switched off', () => {
    const recommended = { rules: { 'no-undef': 'error' } }
    const configs = [
      { ignores: ['**/out/'] },
      recommended,
      {
        files: ['**/*.ts'],
        rules: {
          '@typescript-eslint/no-unused-vars': ['error', { args: 'none' }],
          'no-console': 'off',
        },
      },
      {
        rules: {
          'react-hooks/rules-of-hooks': 'error',
          'react-hooks/exhaustive-deps': 1,
          'no-debugger': 0,
        },
      },
    ]
    assert.deepEqual(eslintChecksOf(configs, [recommended]), [
      '@typescript-eslint/no-unused-vars',
      'react-hooks/rules-of-hooks',
      'react-hooks/exhaustive-deps',
    ])
  })
})

describe('eslintHitsOf', () => {
  it("reads ESLint's JSON results relative to the canary folder, leaving out parse errors", () => {
    const hits = eslintHitsOf(
      [
        {
          filePath: '/repo/canaries/eslint/src/a.tsx',
          messages: [
            { ruleId: 'react-hooks/rules-of-hooks' },
            { ruleId: null, fatal: true },
          ],
        },
        { filePath: '/elsewhere/b.ts', messages: [{ ruleId: 'no-undef' }] },
      ],
      '/repo/canaries/eslint',
    )
    assert.deepEqual(hits, [
      { check: 'react-hooks/rules-of-hooks', file: 'src/a.tsx' },
      { check: 'no-undef', file: '/elsewhere/b.ts' },
    ])
  })
})

describe('guardVerdictOf', () => {
  it('fires when the guard failed and said everything expected', () => {
    assert.deepEqual(
      guardVerdictOf({
        status: 1,
        output: '- a.tsx: CardTitle (line 3), CardBody (line 7)',
        expect: ['CardBody (line 7)'],
      }),
      { verdict: FIRED, missing: [] },
    )
  })

  it('stays silent when the guard passed, crashed, or said something else', () => {
    assert.equal(
      guardVerdictOf({ status: 0, output: '', expect: ['x'] }).verdict,
      SILENT,
    )
    assert.deepEqual(
      guardVerdictOf({ status: 2, output: 'boom', expect: [] }).missing,
      ['exit code 2, not 1'],
    )
    assert.deepEqual(
      guardVerdictOf({ status: 1, output: 'other', expect: ['x'] }).missing,
      ['x'],
    )
  })
})

describe('summaryOf', () => {
  it('passes only when every check has a canary and every one fired', () => {
    assert.deepEqual(summaryOf([{ verdict: FIRED }, { verdict: FIRED }]), {
      ok: true,
      line: '2 of 2 checks have a canary; 2 fired.',
    })
    assert.deepEqual(
      summaryOf([
        { verdict: FIRED },
        { verdict: SILENT },
        { verdict: NO_CANARY },
      ]),
      {
        ok: false,
        line: '2 of 3 checks have a canary; 1 fired, 1 stayed silent, 1 have none.',
      },
    )
  })
})
