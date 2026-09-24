#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkPerfBudget, perfTimingRows } from './perf-budget.pure.mjs'

const tools = dirname(fileURLToPath(import.meta.url))
const temp = mkdtempSync(join(tmpdir(), 'convergence-perf-budget-'))
const started = performance.now()
try {
  const out = join(temp, 'report.json')
  const run = spawnSync(
    process.execPath,
    [
      join(tools, 'perf-busy-day.mjs'),
      '--node',
      '--evidence',
      '--sessions',
      '2',
      '--streaming',
      '1',
      '--minutes',
      '0.1',
      '--out',
      out,
    ],
    { stdio: 'inherit' },
  )
  let report
  try {
    report = JSON.parse(readFileSync(out, 'utf8'))
  } catch (error) {
    console.error(`perf report: ${error.message}`)
  }
  console.log(
    'Performance diagnostics (CPU %, milliseconds, bytes; no timing bounds)',
  )
  console.table(perfTimingRows(report))
  console.log(
    `Performance contract elapsed: ${((performance.now() - started) / 1000).toFixed(2)} s`,
  )
  const failures = checkPerfBudget(report, run.status)
  if (run.error) console.error(run.error.message)
  for (const failure of failures) console.error(`FAIL ${failure}`)
  if (failures.length) process.exitCode = 1
  else console.log('PASS performance counter budgets')
} finally {
  rmSync(temp, { recursive: true, force: true })
}
