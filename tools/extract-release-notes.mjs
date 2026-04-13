import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

function usage() {
  console.error(
    'Usage: node tools/extract-release-notes.mjs <version> [output-file]',
  )
  process.exit(1)
}

const version = process.argv[2]
const outputFile = process.argv[3]

if (!version) {
  usage()
}

const changelogPath = resolve(process.cwd(), 'CHANGELOG.md')

if (!existsSync(changelogPath)) {
  const fallback = `Release ${version}\n\nCHANGELOG.md has not been generated yet for this repository.`

  if (outputFile) {
    writeFileSync(resolve(process.cwd(), outputFile), `${fallback}\n`)
  } else {
    process.stdout.write(`${fallback}\n`)
  }

  process.exit(0)
}

const changelog = readFileSync(changelogPath, 'utf8')

const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const sectionPattern = new RegExp(
  `^##\\s+\\[?${escapedVersion}\\]?[^\\n]*\\n([\\s\\S]*?)(?=^##\\s+\\[?\\d|\\Z)`,
  'm',
)

const match = changelog.match(sectionPattern)

const notes = match
  ? match[1].trim()
  : `Release ${version}\n\nNo changelog entry was found for this version.`

if (outputFile) {
  writeFileSync(resolve(process.cwd(), outputFile), `${notes}\n`)
} else {
  process.stdout.write(`${notes}\n`)
}
