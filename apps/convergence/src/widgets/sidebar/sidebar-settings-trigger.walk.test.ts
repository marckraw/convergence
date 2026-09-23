import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { WALK_TEST_TIMEOUT_MS } from '../../../test/walk-budget'

/**
 * MAR-3358 R3. `DialogTrigger asChild` merges the open handler onto its
 * child. `Tooltip` is a Radix Root: it renders no element and drops that
 * handler, so a gear wrapped as `trigger={<Tooltip>…}` shows its hint and
 * never opens. The walk fails when a trigger prop's value starts with
 * `<Tooltip` anywhere under `src/`.
 *
 * Not a `*.pure.test.ts`: that name is reserved for a module's own suite,
 * and a directory walk filed there is the race MAR-2989 removed. This file
 * spends the shared walk budget instead.
 */
const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const TRIGGER_STARTS_WITH_TOOLTIP = /trigger=\{\s*<Tooltip\b/g

const REASON =
  'a Radix Root renders no element; `asChild` has nothing to put the handler on'

function sourceTsxFiles(dir: string): string[] {
  const files: string[] = []
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue
        walk(path)
        continue
      }
      if (!entry.name.endsWith('.tsx')) continue
      if (entry.name.includes('.test.')) continue
      files.push(path)
    }
  }
  walk(dir)
  return files.sort()
}

describe('MAR-3358 R3: a trigger prop must not start with Tooltip', () => {
  it(
    'no trigger value under src/ starts with <Tooltip',
    { timeout: WALK_TEST_TIMEOUT_MS },
    () => {
      const offenders: string[] = []
      for (const path of sourceTsxFiles(SRC_ROOT)) {
        const source = readFileSync(path, 'utf8')
        for (const match of source.matchAll(TRIGGER_STARTS_WITH_TOOLTIP)) {
          const index = match.index ?? 0
          const line = source.slice(0, index).split('\n').length
          offenders.push(`${relative(SRC_ROOT, path)}:${line} ${REASON}`)
        }
      }
      // Mutation: re-add trigger={<Tooltip at one gear -> red with file:line.
      expect(offenders).toEqual([])
    },
  )
})
