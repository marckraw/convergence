import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { WALK_TEST_TIMEOUT_MS } from '../../../test/walk-budget'

it(
  'has exactly one context percentage comparison across both processes',
  { timeout: WALK_TEST_TIMEOUT_MS },
  () => {
    const matches: string[] = []
    function walk(path: string) {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        const file = resolve(path, entry.name)
        if (entry.isDirectory()) walk(file)
        else if (
          /\.[cm]?[jt]sx?$/.test(file) &&
          !/\.(test|spec)\./.test(file) &&
          readFileSync(file, 'utf8').includes('usedPercentage >=')
        )
          matches.push(file)
      }
    }
    const root = resolve(import.meta.dirname, '..', '..', '..')
    walk(resolve(root, 'src'))
    walk(resolve(root, 'electron'))
    expect(matches).toEqual([
      resolve(root, 'src/shared/lib/context-alert.pure.ts'),
    ])
  },
)
