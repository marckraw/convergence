import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Convergence's half of the manifest wire (MAR-2737).
 *
 * The twin of `apps/backpack-studio/workspace-manifest.test.ts`, and
 * deliberately not a shared helper: the whole point is that each consumer's
 * declaration is pinned on its own, so losing one turns exactly one test red.
 * npm workspaces links every workspace package into the root `node_modules`
 * regardless of who declares it, which is why no typecheck and no build can
 * notice the loss.
 *
 * `devDependencies` and not `dependencies` is itself the decision being pinned:
 * the package ships TypeScript source through `exports`, so both electron-vite
 * configs bundle it and nothing ever `require`s it at runtime. If it were ever
 * moved to `dependencies`, electron-builder would start shipping it as an
 * unbundled runtime dependency and this test should be the thing that asks why.
 *
 * Mutation: delete `"@convergence/execution-host-client"` from
 * `apps/convergence/package.json` and this file goes red while Studio's
 * identical test stays green.
 */

const manifestPath = join(
  dirname(fileURLToPath(import.meta.url)),
  'package.json',
)

const PACKAGE_NAME = '@convergence/execution-host-client'

interface Manifest {
  name: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

function readManifest(): Manifest {
  return JSON.parse(readFileSync(manifestPath, 'utf-8')) as Manifest
}

describe("Convergence's manifest", () => {
  it('is the manifest this test claims to read', () => {
    expect(readManifest().name).toBe('convergence')
  })

  it('declares the shared client core', () => {
    const manifest = readManifest()
    const declaredIn = (['dependencies', 'devDependencies'] as const).filter(
      (field) => manifest[field]?.[PACKAGE_NAME] !== undefined,
    )
    expect(declaredIn).toEqual(['devDependencies'])
  })
})
