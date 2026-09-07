import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Decide one application's tag independently of every other workspace. */
export function resolveReleaseTag(
  version,
  previousVersion,
  prefix,
  existingTags,
) {
  const tag = `${prefix}${version}`
  return {
    version,
    tag,
    version_changed: version !== previousVersion,
    tag_exists: existingTags.includes(tag),
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [manifest, prefix] = process.argv.slice(2)
  if (!manifest || !prefix)
    throw new Error('Usage: resolve-release-tag.mjs <manifest> <prefix>')
  const git = (...args) =>
    execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  const { version } = JSON.parse(readFileSync(manifest, 'utf8'))
  let previousVersion
  let parentManifest
  try {
    parentManifest = git('show', `HEAD^:${manifest}`)
  } catch {
    // A root commit or a newly introduced workspace has no parent manifest.
  }
  if (parentManifest) previousVersion = JSON.parse(parentManifest).version
  const state = resolveReleaseTag(
    version,
    previousVersion,
    prefix,
    git('tag', '--list').split('\n'),
  )
  const output =
    Object.entries(state)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n'
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, output)
  else process.stdout.write(output)
}
