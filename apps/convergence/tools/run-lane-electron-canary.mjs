#!/usr/bin/env node
import { spawnSync } from 'child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createPackage } from '@electron/asar'
import { build } from 'esbuild'

/**
 * Runs the lane canary under the REAL Electron runtime (MAR-2814).
 *
 * The canary has to execute inside a process that carries Electron's asar `fs`
 * patch, and vitest cannot be that process -- so this script bundles the
 * canary's TypeScript into one CommonJS file and hands it to the `electron`
 * binary. NOT `ELECTRON_RUN_AS_NODE`: measured on Electron 41, an
 * `ELECTRON_RUN_AS_NODE` child and a `utilityProcess` BOTH still carry the
 * patch, so either would have been a fine test of nothing in particular, but
 * only the real binary is the runtime the app ships.
 *
 * `--node` runs the SAME bundle under plain Node instead. That pair is the
 * instrument the fix is proved with: put the rollback back on Node's `rm`, or
 * the pre-scan back on a Node walk, or the copier back on Node's `cp`, and the
 * canary goes RED under Electron while staying GREEN under `--node`. An
 * assertion that cannot tell the two runtimes apart is exactly what let RUN40
 * ship a lane that could not be made.
 */

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(appRoot, '..', '..')
const underNode = process.argv.includes('--node')

const outDir = mkdtempSync(join(tmpdir(), 'cvg-canary-build-'))
const bundlePath = join(outDir, 'lane-electron-canary.cjs')
const packedAsarPath = join(outDir, 'app.asar')

/**
 * An archive holding a directory the lane's skip list REMOVES (`dist`), packed
 * here in plain Node because writing one from inside Electron would go through
 * the very patch under test.
 *
 * The canary plants it OUTSIDE `node_modules`, and that placement is the whole
 * point: `isLaneCopySkipped` returns false for everything under
 * `node_modules`, so an archive there is never a candidate for the prune and a
 * prune walking through the patch has nothing to trip over. Outside it, a
 * patched walk reads this file as a folder, finds `dist` inside, and tries to
 * `rm -rf` a path that is not on disk.
 */
async function packArchiveWithASkippedDirectory() {
  const source = join(outDir, 'asar-source')
  mkdirSync(join(source, 'dist'), { recursive: true })
  writeFileSync(join(source, 'index.js'), 'module.exports = 1\n')
  writeFileSync(join(source, 'dist', 'bundle.js'), 'packed build output\n')
  await createPackage(source, packedAsarPath)
  rmSync(source, { recursive: true, force: true })
}

// `process.exit()` skips `finally`, so the exit code is carried out of the
// block and spent only after the build directory is gone.
let exitCode = 1
try {
  await packArchiveWithASkippedDirectory()
  await build({
    entryPoints: [
      join(appRoot, 'electron', 'backend', 'lane', 'lane-electron-canary.ts'),
    ],
    outfile: bundlePath,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    // Native and Electron-provided modules are never bundled; `better-sqlite3`
    // only ever appears here as an erased type, and the canary's database is
    // the built-in `node:sqlite`.
    external: ['electron', 'better-sqlite3'],
    logLevel: 'warning',
  })

  const runner = underNode
    ? process.execPath
    : join(repoRoot, 'node_modules', '.bin', 'electron')

  /**
   * `--no-sandbox` on the Electron run: this canary opens no window and needs
   * no renderer, while Ubuntu restricts unprivileged user namespaces -- under
   * which an un-setuid `chrome-sandbox` out of `node_modules` makes Electron
   * abort at start (electron/electron#41066), and CI would fail on the
   * sandbox rather than on the lane. Plain Node would refuse the flag.
   */
  const runnerArguments = underNode ? [] : ['--no-sandbox']

  const { status, error } = spawnSync(
    runner,
    [...runnerArguments, bundlePath],
    {
      // The canary locates the real `*.asar` archives under `node_modules`, so
      // it must run from the repo root wherever it was invoked from.
      cwd: repoRoot,
      stdio: 'inherit',
      // The archive travels in the ENVIRONMENT, never in `argv`: Electron keeps
      // its own switches in `process.argv`, so adding `--no-sandbox` above would
      // shift every position by one and hand the canary its own bundle as the
      // "archive" -- a fixture that is a plain file cannot test the patch, and
      // the run would still print PASSED.
      env: { ...process.env, CVG_LANE_CANARY_ASAR: packedAsarPath },
    },
  )

  if (error) {
    console.error(`Could not start ${runner}:`, error.message)
  } else {
    exitCode = status ?? 1
  }
} finally {
  rmSync(outDir, { recursive: true, force: true })
}

process.exit(exitCode)
