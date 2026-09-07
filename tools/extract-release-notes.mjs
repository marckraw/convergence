import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function extractReleaseNotes(changelog, version) {
  const lines = changelog.split(/\r?\n/)
  const start = lines.findIndex((line) => line === `## ${version}`)
  if (start < 0) throw new Error(`No release notes for ${version}`)
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => line.startsWith('## '))
  const notes = rest
    .slice(0, end < 0 ? undefined : end)
    .join('\n')
    .trim()
  if (!notes) throw new Error(`Empty release notes for ${version}`)
  return `${notes}\n`
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [changelog, version, output] = process.argv.slice(2)
  if (!changelog || !version || !output)
    throw new Error(
      'Usage: extract-release-notes.mjs <changelog> <version> <output>',
    )
  writeFileSync(
    output,
    extractReleaseNotes(readFileSync(changelog, 'utf8'), version),
  )
}
