#!/usr/bin/env node
import { spawnSync } from 'child_process'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { build } from 'esbuild'

/**
 * Runs the Door probe's self-test under the REAL Electron binary and under
 * plain Node (MAR-3173, The Door S0, rule R4).
 *
 * Same shape as `run-lane-electron-canary.mjs`: bundle once with esbuild into
 * one CommonJS file (the `@modelcontextprotocol/*` v2 packages included), then
 * hand that bundle to the `electron` binary — or, with `--node`, to the Node
 * that runs this script. The bundle starts the hello server on an ephemeral
 * loopback port, a v2 client calls `hello` over HTTP, the server closes, and
 * the bundle prints one JSON line and exits.
 *
 * The assertion lives HERE, not in the bundle: the child's exit code must be 0
 * AND the JSON line it printed must carry the fixed string the client got
 * back. A bundle that exits 0 without having served a request fails.
 */

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(appRoot, '..', '..')
const underNode = process.argv.includes('--node')

const outDir = mkdtempSync(join(tmpdir(), 'cvg-door-build-'))
const bundlePath = join(outDir, 'mcp-door-self-test.cjs')

/**
 * The bundle's entry. `process.exit` is explicit because a script run by the
 * Electron binary keeps the app's event loop alive until told otherwise.
 */
const ENTRY = `
import { HELLO_TEXT, runSelfTest } from './tools/probe-mcp-door.mjs'
runSelfTest().then(
  (result) => {
    console.log('DOOR_SELF_TEST ' + JSON.stringify({ ...result, expected: HELLO_TEXT }))
    process.exit(0)
  },
  (error) => {
    console.error(error instanceof Error ? error.stack : error)
    process.exit(1)
  },
)
`

let exitCode = 1
try {
  await build({
    stdin: { contents: ENTRY, resolveDir: appRoot, loader: 'js' },
    outfile: bundlePath,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
    logLevel: 'warning',
    // The probe's "run directly?" check reads `import.meta.url`, which a CJS
    // bundle empties -- exactly what keeps `main()` from running in here.
    logOverride: { 'empty-import-meta': 'silent' },
  })

  const runner = underNode
    ? process.execPath
    : join(repoRoot, 'node_modules', '.bin', 'electron')
  // `--no-sandbox`: no window, no renderer; see run-lane-electron-canary.mjs.
  const runnerArguments = underNode ? [] : ['--no-sandbox']
  const runtime = underNode ? 'node' : 'electron'

  const { status, error, stdout, stderr } = spawnSync(
    runner,
    [...runnerArguments, bundlePath],
    { cwd: repoRoot, encoding: 'utf8', timeout: 60_000 },
  )
  if (stderr) process.stderr.write(stderr)

  if (error) {
    console.error(`Could not start ${runner}:`, error.message)
  } else {
    const line = (stdout ?? '')
      .split('\n')
      .find((candidate) => candidate.startsWith('DOOR_SELF_TEST '))
    const result = line
      ? JSON.parse(line.slice('DOOR_SELF_TEST '.length))
      : null
    if (status !== 0) {
      console.error(`FAILED under ${runtime}: exit ${status}`)
    } else if (!result || result.text !== result.expected) {
      console.error(
        `FAILED under ${runtime}: hello returned ${JSON.stringify(result?.text)}`,
      )
    } else {
      console.log(
        `PASSED under ${runtime}: ${JSON.stringify({
          runtime: result.runtime,
          node: result.node,
          text: result.text,
          methods: result.methods,
          statuses: result.statuses,
        })}`,
      )
      exitCode = 0
    }
  }
} finally {
  rmSync(outDir, { recursive: true, force: true })
}

process.exit(exitCode)
