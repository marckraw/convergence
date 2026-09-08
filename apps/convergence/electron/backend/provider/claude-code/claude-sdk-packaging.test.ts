import { readFileSync } from 'fs'
import { expect, it } from 'vitest'

it('keeps the SDK and bundled binaries out of production dependencies — promote the SDK lock entry to production turns red', () => {
  const lock = JSON.parse(
    readFileSync(
      new URL('../../../../../../package-lock.json', import.meta.url),
      'utf8',
    ),
  ) as { packages: Record<string, { dev?: boolean; version?: string }> }
  const sdk = Object.entries(lock.packages).filter(([path]) =>
    /node_modules\/@anthropic-ai\/claude-agent-sdk(?:-|$)/.test(path),
  )
  const build = readFileSync(
    new URL('../../../../electron.vite.config.ts', import.meta.url),
    'utf8',
  )
  expect({
    present: sdk.length > 0,
    developmentOnly: sdk.every(([, entry]) => entry.dev === true),
    bundled: build.includes("'@anthropic-ai/claude-agent-sdk'"),
  }).toEqual({ present: true, developmentOnly: true, bundled: true })
})
