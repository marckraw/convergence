#!/usr/bin/env node
// `npm run canaries`: runs every deterministic check against canaries/, where
// each fixture breaks a rule on purpose, and fails unless every check fired,
// and unless every check has a canary. CI runs it in its own job. The
// bookkeeping, and why canaries exist: canaries.pure.mjs. Not the Electron lane
// canary (`npm run test:electron`), which is a test of the app, not of a check.
//
//   canaries/chaperone/  a small project tree: the pinned Chaperone
//                        (scripts/chaperone.mjs) runs on it with the repo's
//                        .chaperone.json and the presets it extends
//   canaries/eslint/     linted with the repo's eslint.config.mjs
//   canaries/guards/<n>/ a tree for one command check, with canary.json: its
//                        args and the output it must print. <n> is a guard in
//                        scripts/guards/<n>.mjs, or the id of a Chaperone
//                        command rule that runs another script, which runs
//                        with the rule's own command and arguments
//
// A fixture names the checks it trips in a `canary:` comment in its first five
// lines (JSON fixtures: canaries/chaperone/.canary.json). The repo's own
// Chaperone, ESLint and Prettier runs leave canaries/ out, and no tsconfig
// includes it.
import { spawnSync } from 'node:child_process'
import {
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
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

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const canaries = join(root, 'canaries')
const scratch = mkdtempSync(join(tmpdir(), 'convergence-canaries-'))

/** Every file below `dir`, relative to it. */
const filesIn = (dir) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))

/** { check, file } for every `canary:` line in a fixture tree, plus `extra` ones. */
const expectationsIn = (dir, extra = {}) => [
  ...filesIn(dir).flatMap((file) =>
    canaryHeaderOf(readFileSync(join(dir, file), 'utf8')).map((check) => ({
      check,
      file,
    })),
  ),
  ...Object.entries(extra).flatMap(([file, checks]) =>
    Array.isArray(checks) ? checks.map((check) => ({ check, file })) : [],
  ),
]

/** Runs a command; its stdout goes to a file, since a pipe can cut a big report short. */
const run = (command, args, options = {}) => {
  const outFile = join(
    scratch,
    `out-${Math.random().toString(36).slice(2)}.txt`,
  )
  const fd = openSync(outFile, 'w')
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    stdio: ['ignore', fd, 'pipe'],
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', CHAPERONE_NO_UPDATE_CHECK: '1' },
  })
  closeSync(fd)
  if (result.error) throw result.error
  return {
    status: result.status,
    stdout: readFileSync(outFile, 'utf8'),
    stderr: result.stderr,
  }
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

/**
 * Every command rule the Chaperone config runs, its own and its local presets'
 * (nested ones too), each with whether a preset defines it.
 */
const commandRulesOf = (file, inPreset = false) => {
  const config = readJson(file)
  const specifiers =
    typeof config.extends === 'string' ? [config.extends] : config.extends
  return [
    ...(specifiers ?? [])
      .filter(isLocalPreset)
      .flatMap((specifier) =>
        commandRulesOf(resolve(dirname(file), specifier), true),
      ),
    ...(config.rules?.custom ?? [])
      .filter((rule) => rule.type === 'command' && !rule.disabled)
      .map((rule) => ({ rule, inPreset })),
  ]
}

const commandRules = commandRulesOf(join(root, '.chaperone.json'))

const sections = []

// Chaperone: every custom and preset rule, on canaries/chaperone. Command rules
// run scripts, which have canaries of their own under canaries/guards.
{
  const config = readJson(join(root, '.chaperone.json'))
  const commands = new Map(
    commandRules.map(({ rule }) => [
      rule.id,
      `canaries/guards/${guardNameOf(rule)}`,
    ]),
  )
  const configFile = join(scratch, 'chaperone.json')
  const canaryConfig = canaryChaperoneConfigOf({
    config,
    presetCommandIds: commandRules
      .filter(({ inPreset }) => inPreset)
      .map(({ rule }) => rule.id),
    // Chaperone resolves a local preset from the config that names it, and
    // takes only ./ and ../ paths.
    extendsOf: (specifier) => relative(scratch, resolve(root, specifier)),
  })
  writeFileSync(configFile, JSON.stringify(canaryConfig))

  const dir = join(canaries, 'chaperone')
  const report = run('node', [
    join(root, 'scripts/chaperone.mjs'),
    'check',
    '--cwd',
    dir,
    '--config',
    configFile,
    '--format',
    'json',
  ])
  let parsed
  try {
    parsed = JSON.parse(report.stdout)
  } catch {
    console.error(
      `Chaperone gave no report (exit ${report.status}):\n${report.stdout}\n${report.stderr}`,
    )
    process.exit(2)
  }
  // A failed check is the point here; a refused configuration checked nothing.
  if (
    parsed.error !== undefined ||
    (parsed.diagnostics ?? []).some(
      (diagnostic) => diagnostic.level === 'error',
    )
  ) {
    console.error('Chaperone refused the configuration:', parsed.diagnostics)
    process.exit(2)
  }
  const extraFile = join(dir, '.canary.json')
  const extra = existsSync(extraFile) ? readJson(extraFile) : {}
  const checks = [...parsed.rules.map((rule) => rule.id), ...commands.keys()]
  sections.push({
    name: 'Chaperone',
    rows: verdictsOf({
      checks,
      expectations: expectationsIn(dir, extra),
      hits: parsed.results.map((result) => ({
        check: chaperoneRuleIdOf(result.rule),
        file: result.file,
      })),
      coveredElsewhere: commands,
    }),
  })
}

// ESLint: the rules eslint.config.mjs names itself, with the repo's own config,
// on canaries/eslint (`--no-ignore`: the repo's own run leaves canaries/ out).
// The presets it spreads are ESLint's and typescript-eslint's to keep firing.
{
  const { default: configs } = await import(
    pathToFileURL(join(root, 'eslint.config.mjs')).href
  )
  const { default: js } = await import('@eslint/js')
  const { default: tseslint } = await import('typescript-eslint')
  const presets = [js.configs.recommended, ...tseslint.configs.recommended]

  const dir = join(canaries, 'eslint')
  const report = run(join(root, 'node_modules/.bin/eslint'), [
    '--no-ignore',
    '--format',
    'json',
    relative(root, dir),
  ])
  let results
  try {
    results = JSON.parse(report.stdout)
  } catch {
    console.error(
      `ESLint gave no report (exit ${report.status}):\n${report.stdout}\n${report.stderr}`,
    )
    process.exit(2)
  }
  sections.push({
    name: 'ESLint',
    rows: verdictsOf({
      checks: eslintChecksOf(configs, presets),
      expectations: expectationsIn(dir),
      hits: eslintHitsOf(results, dir),
    }),
  })
}

// Guards: each scripts/guards/<name>.mjs, and each Chaperone command rule, on
// canaries/guards/<name>, which must make it fail.
{
  const guardsDir = join(root, 'scripts/guards')
  const guards = new Map(
    (existsSync(guardsDir)
      ? readdirSync(guardsDir, { withFileTypes: true })
      : []
    )
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith('.mjs') &&
          !entry.name.includes('.pure.') &&
          !entry.name.endsWith('.test.mjs'),
      )
      .map((entry) => {
        const name = entry.name.replace(/\.mjs$/, '')
        return [name, ['node', join(root, 'scripts/guards', entry.name)]]
      }),
  )
  for (const { rule } of commandRules) {
    const name = guardNameOf(rule)
    if (guards.has(name)) continue
    const [script, ...args] = rule.args ?? []
    guards.set(
      name,
      rule.command === 'node' && script
        ? ['node', resolve(root, script), ...args]
        : [rule.command, ...(rule.args ?? [])],
    )
  }
  const rows = [...guards].map(([guard, [command, ...commandArgs]]) => {
    const dir = join(canaries, 'guards', guard)
    const manifest = join(dir, 'canary.json')
    if (!existsSync(manifest))
      return { check: guard, verdict: NO_CANARY, canaries: [], silent: [] }
    const { args, expect } = readJson(manifest)
    const report = run(command, [...commandArgs, ...args], { cwd: dir })
    const { verdict, missing } = guardVerdictOf({
      status: report.status,
      output: `${report.stdout}${report.stderr}`,
      expect,
    })
    return {
      check: guard,
      verdict,
      canaries: [`canaries/guards/${guard}`],
      silent: missing,
    }
  })
  sections.push({ name: 'Guards (scripts/guards, command rules)', rows })
}

rmSync(scratch, { recursive: true, force: true })

console.log(
  'Canaries: every check, run against a fixture that breaks it on purpose.\n',
)
const all = []
for (const { name, rows } of sections) {
  console.log(`${name} (${rows.length})`)
  const width = Math.max(...rows.map((row) => row.check.length))
  for (const row of rows) {
    const where = row.canaries.join(', ') || '-'
    console.log(
      `  ${row.verdict.padEnd(9)} ${row.check.padEnd(width)}  ${where}`,
    )
    if (row.unknown)
      console.log(`            a fixture names a check that doesn't exist`)
    for (const silent of row.verdict === SILENT ? row.silent : []) {
      console.log(`            didn't fire: ${silent}`)
    }
  }
  console.log('')
  all.push(...rows)
}
const { ok, line } = summaryOf(all)
console.log(line)
if (!ok) {
  console.log(
    `\nA ${SILENT} check no longer catches what it was written for; a check with ${NO_CANARY} needs a fixture under canaries/ (see scripts/canaries.mjs). ${FIRED} is the only good verdict.`,
  )
}
process.exit(ok ? 0 : 1)
