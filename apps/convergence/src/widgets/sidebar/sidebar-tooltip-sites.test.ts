import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { WALK_TEST_TIMEOUT_MS } from '../../../test/walk-budget'

/**
 * The sidebar's hover hints use the shared Tooltip (MAR-3314 R2).
 *
 * The other half of this pin, no native `title=` hint on a page element, is
 * the drift rule `no-native-title` now, app-wide and with a canary (NAV-20,
 * MAR-3608): it read only the sidebar here. What stays is the sidebar's own:
 * a tooltip that floats over the title strip must be `no-drag` (MAR-3284);
 * since MAR-3616 the one tooltip host is, so the pin is that no sidebar file
 * builds a tooltip of its own again.
 */
const SIDEBAR_ROOT = resolve(dirname(fileURLToPath(import.meta.url)))

const OWN_TOOLTIP = /<TooltipContent\b/

function sidebarTsxFiles(): string[] {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(path)
        continue
      }
      if (!entry.name.endsWith('.tsx')) continue
      if (entry.name.includes('.test.')) continue
      files.push(path)
    }
  }
  walk(SIDEBAR_ROOT)
  return files.sort()
}

const SIDEBAR_FILES = sidebarTsxFiles()

describe('MAR-3314 R2: every sidebar tooltip is the no-drag host', () => {
  it.each(
    SIDEBAR_FILES.map((path) => [path.slice(SIDEBAR_ROOT.length + 1), path]),
  )(
    '%s builds no tooltip of its own',
    { timeout: WALK_TEST_TIMEOUT_MS },
    (_name, path) => {
      const source = readFileSync(path, 'utf8')
      // Mutation: bring back a per-instance `TooltipContent` in any sidebar
      // file -> red.
      expect(source).not.toMatch(OWN_TOOLTIP)
    },
  )
})
