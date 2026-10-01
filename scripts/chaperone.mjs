#!/usr/bin/env node
// Runs the Chaperone version this repo pins, downloading it once into
// node_modules/.cache and checking it against the release's SHA256SUMS.txt.
// `npm run chaperone`, `npm run agent:pre-push`, `npm run canaries` and CI all
// go through here, so VERSION is the only thing to change when upgrading
// (MAR-3609). The global `chaperone` on your PATH is ignored on purpose: other
// repos pin other versions, and a check that answers differently on two
// machines is not a check.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const VERSION = '0.8.0'
const REPO = 'marckraw/chaperone-cli'

const ASSETS = {
  'darwin-arm64': 'chaperone-darwin-arm64',
  'darwin-x64': 'chaperone-darwin-x64',
  'linux-arm64': 'chaperone-linux-arm64',
  'linux-x64': 'chaperone-linux-x64',
  'win32-x64': 'chaperone-windows-x64.exe',
}

const fail = (message) => {
  console.error(`chaperone: ${message}`)
  process.exit(2)
}

const asset = ASSETS[`${process.platform}-${process.arch}`]
if (!asset) fail(`no release binary for ${process.platform}-${process.arch}`)

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const binary = join(root, 'node_modules', '.cache', 'chaperone', VERSION, asset)

if (!existsSync(binary)) await install()

const run = spawnSync(binary, process.argv.slice(2), { stdio: 'inherit' })
if (run.error) fail(run.error.message)
process.exit(run.status ?? 2)

async function install() {
  const base = `https://github.com/${REPO}/releases/download/v${VERSION}`
  const [bytes, sums] = await Promise.all([
    download(`${base}/${asset}`).then((res) => res.arrayBuffer()),
    download(`${base}/SHA256SUMS.txt`).then((res) => res.text()),
  ])
  const expected = sums
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .find(([, name]) => name === asset)?.[0]
  const actual = createHash('sha256').update(Buffer.from(bytes)).digest('hex')
  if (!expected)
    fail(`SHA256SUMS.txt for v${VERSION} has no entry for ${asset}`)
  if (actual !== expected) fail(`checksum mismatch for ${asset} v${VERSION}`)

  mkdirSync(dirname(binary), { recursive: true })
  const partial = `${binary}.${process.pid}.partial`
  writeFileSync(partial, Buffer.from(bytes))
  chmodSync(partial, 0o755)
  renameSync(partial, binary)
  console.error(`chaperone: installed v${VERSION} (${asset})`)
}

async function download(url) {
  const res = await fetch(url)
  if (!res.ok) fail(`GET ${url} returned ${res.status}`)
  return res
}
