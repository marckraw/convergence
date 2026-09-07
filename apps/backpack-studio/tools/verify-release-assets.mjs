import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'

// Manifest canary: rename an asset or remove either ZIP entry to turn this red.
const release = process.argv[2] ?? 'release'
const manifest = parse(readFileSync(join(release, 'latest-mac.yml'), 'utf8'))
const zips = manifest.files
  .filter((file) => file.url.endsWith('.zip'))
  .map((file) => file.url)
  .sort()
assert.deepEqual(
  zips,
  [
    `Backpack-Studio-${manifest.version}-arm64.zip`,
    `Backpack-Studio-${manifest.version}-x64.zip`,
  ],
  'The update manifest must list both architectures',
)
for (const { url, size } of manifest.files) {
  assert.equal(
    statSync(join(release, url)).size,
    size,
    `Manifest asset must exist at its published name and size: ${url}`,
  )
}
console.log(
  'PASS: both ZIPs and every manifest asset exist at the published name and size',
)
