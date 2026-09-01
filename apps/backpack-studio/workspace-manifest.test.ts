import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Backpack Studio's half of the manifest wire (MAR-2737).
 *
 * The kickoff asked for a canary that goes red when this app stops declaring
 * `@convergence/execution-host-client`, and the obvious form does not work:
 * npm workspaces links every workspace package into the root `node_modules`
 * whether or not anything declares it, so TypeScript's upward walk and Vite's
 * resolver both find the package from an undeclared consumer. Codex removed the
 * declaration from *both* app manifests and every typecheck and build stayed
 * green.
 *
 * So the declaration is pinned where it actually lives: in this app's own
 * manifest, read off disk. One test per consumer, each reading only its own
 * file, so deleting one declaration turns exactly one test red and names the
 * app that lost it.
 *
 * Mutation: delete `"@convergence/execution-host-client"` from
 * `apps/backpack-studio/package.json` and this file goes red while
 * Convergence's identical test stays green.
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

describe("Backpack Studio's manifest", () => {
  it('is the manifest this test claims to read', () => {
    expect(readManifest().name).toBe('backpack-studio')
  })

  it('declares the shared client core', () => {
    const manifest = readManifest()
    const declaredIn = (['dependencies', 'devDependencies'] as const).filter(
      (field) => manifest[field]?.[PACKAGE_NAME] !== undefined,
    )
    expect(declaredIn).toEqual(['devDependencies'])
  })
})
