import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { expect, it } from 'vitest'

it.each([
  ['convergence', 'convergence'],
  ['backpack-studio', 'backpack-studio'],
])('pins %s feed — mutation: cross-wire its publish repo', (app, repo) => {
  const config = parse(
    readFileSync(
      fileURLToPath(
        new URL(`../apps/${app}/electron-builder.yml`, import.meta.url),
      ),
      'utf8',
    ),
  )
  expect(config.publish).toEqual([
    { provider: 'github', owner: 'marckraw', repo, releaseType: 'release' },
  ])
})
