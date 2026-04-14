import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(
  readFileSync(resolve(root, 'package.json'), 'utf8'),
)
const changelogPath = resolve(root, 'CHANGELOG.md')
const outputPath = resolve(
  root,
  'src/shared/generated/release-notes.generated.json',
)

function parseReleasesFromChangelog(markdown) {
  const headingRegex =
    /^##\s+\[?([0-9]+\.[0-9]+\.[0-9][^\]\s]*)\]?(?:\s*-\s*(\d{4}-\d{2}-\d{2}))?.*$/gm

  const matches = [...markdown.matchAll(headingRegex)]

  return matches.map((match, index) => {
    const version = match[1]
    const date = match[2] ?? null
    const start = match.index + match[0].length
    const end = matches[index + 1]?.index ?? markdown.length
    const notes = markdown.slice(start, end).trim()

    return {
      version,
      date,
      notes: notes || 'No release notes were generated for this version.',
    }
  })
}

let releases = []

if (existsSync(changelogPath)) {
  const changelog = readFileSync(changelogPath, 'utf8')
  releases = parseReleasesFromChangelog(changelog)
}

if (releases.length === 0) {
  releases = [
    {
      version: packageJson.version,
      date: null,
      notes:
        'Development build.\n\nRelease notes will appear here once versioned releases are generated.',
    },
  ]
}

const payload = {
  currentVersion: packageJson.version,
  releases,
}

mkdirSync(resolve(root, 'src/shared/generated'), { recursive: true })
const nextOutput = `${JSON.stringify(payload, null, 2)}\n`
const currentOutput = existsSync(outputPath)
  ? readFileSync(outputPath, 'utf8')
  : null

if (currentOutput !== nextOutput) {
  writeFileSync(outputPath, nextOutput)
}
