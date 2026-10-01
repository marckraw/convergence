#!/usr/bin/env node
// Finds copied code with jscpd, the version this project pins (why, and how: copied-code.pure.mjs).
// What to read and how long a copy has to be come from jscpd's own config, .jscpd.json at the root
// unless --config names another; the copies kept on purpose, from copied-code.json beside the
// guard (`{ "allowlist": [{ "files": [a, b], "reason": "…" }] }`, optional) unless --allowlist
// names another. Copy the two files into another project, add jscpd as a dev dependency and a
// .jscpd.json, and it works there.
//
//   node scripts/guards/copied-code.mjs                     this checkout
//   node scripts/guards/copied-code.mjs --root <dir>        another tree (the canaries use this)
//   node scripts/guards/copied-code.mjs --config <file>     another jscpd config
//   node scripts/guards/copied-code.mjs --allowlist <file>  another allowlist
//
// Exits 0 when all is well, 1 with one line per problem, 2 when it can't check.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import {
  allowlistProblems,
  copiedCodeProblems,
  jscpdArgsOf,
} from './copied-code.pure.mjs'

const { values } = parseArgs({
  options: {
    root: { type: 'string', default: '.' },
    config: { type: 'string' },
    allowlist: {
      type: 'string',
      default: fileURLToPath(new URL('./copied-code.json', import.meta.url)),
    },
  },
})

const fail = (message) => {
  console.error(`copied-code: ${message}`)
  process.exit(2)
}

const root = resolve(values.root)
const config = resolve(values.config ?? join(root, '.jscpd.json'))
let settings
try {
  settings = JSON.parse(readFileSync(config, 'utf8'))
} catch (error) {
  fail(`can't read the config ${config}: ${error.message}`)
}

const allowlistFile = resolve(values.allowlist)
let allowlist = []
if (existsSync(allowlistFile)) {
  try {
    allowlist = JSON.parse(readFileSync(allowlistFile, 'utf8')).allowlist ?? []
  } catch (error) {
    fail(`can't read the allowlist ${allowlistFile}: ${error.message}`)
  }
  const wrong = allowlistProblems(allowlist)
  if (wrong.length > 0) fail(`${allowlistFile}: ${wrong.join('; ')}`)
}

let jscpd
try {
  jscpd = createRequire(import.meta.url).resolve('jscpd/run-jscpd.js')
} catch {
  fail(
    "jscpd isn't installed: add it as a dev dependency (npm install -D jscpd)",
  )
}

const output = mkdtempSync(join(tmpdir(), 'copied-code-'))
const run = spawnSync(
  process.execPath,
  [jscpd, ...jscpdArgsOf({ config, output })],
  {
    cwd: root,
    encoding: 'utf8',
  },
)
const reportFile = join(output, 'jscpd-report.json')
if (run.error || !existsSync(reportFile)) {
  rmSync(output, { recursive: true, force: true })
  fail(
    `jscpd gave no report (exit ${run.status}): ${run.error?.message ?? run.stderr.trim()}`,
  )
}
const report = JSON.parse(readFileSync(reportFile, 'utf8'))
rmSync(output, { recursive: true, force: true })

if ((report.statistics?.total?.sources ?? 0) === 0) {
  fail(
    `jscpd read no files in ${root}: check the config's path, pattern and ignore`,
  )
}
const problems = copiedCodeProblems({
  report,
  threshold: settings.threshold,
  allowlist,
})
for (const problem of problems) console.error(problem)
if (problems.length > 0) {
  console.error(
    `Make a copy one shared part. Keep one on purpose by naming its two files in ${relative(process.cwd(), allowlistFile)}, with a reason, or between jscpd:ignore-start and jscpd:ignore-end comments that say why.`,
  )
}
process.exit(problems.length > 0 ? 1 : 0)
