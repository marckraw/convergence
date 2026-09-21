import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { WALK_TEST_TIMEOUT_MS } from '../../../test/walk-budget'

/**
 * No surface draws the raw `SessionBadge` (MAR-3288 lap 2 item B).
 *
 * The shared glyph takes a `compacting` prop it cannot answer itself. When
 * eight sites passed it by hand, setting it to `false` at five of them at once
 * left 230 tests green: a busy conversation would have worn the green
 * "finished" check again with nothing to say so. Those sites now draw
 * `SessionStateBadge`, which takes the session and answers the prop from
 * `isSessionCompacting`. This reads the renderer and refuses any other file
 * that names `SessionBadge`, so the prop cannot be forgotten by going around
 * the wrapper.
 *
 * Allowed, by name and reason:
 * - the glyph's own definition;
 * - the wrapper, which is the one place the prop is answered;
 * - `AttentionIndicator`, which draws it for a labelled attention only AFTER
 *   its own `isSessionCompacting` branch has returned, so no compacting
 *   session reaches it (pinned by the header R5 tests).
 *
 * Test files are skipped: a test may draw the glyph directly to pin it.
 */

const RENDERER_ROOT = resolve(__dirname, '../..')
const RAW_BADGE = /\bSessionBadge\b/

const ALLOWED = new Set([
  'shared/ui/session-badge.presentational.tsx',
  'entities/session/session-state-badge.presentational.tsx',
  'entities/session/attention-indicator.presentational.tsx',
])

function filesNamingRawBadge(directory: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      found.push(...filesNamingRawBadge(path))
      continue
    }
    if (!/\.tsx?$/.test(entry.name)) continue
    if (/\.test\.tsx?$/.test(entry.name)) continue
    if (RAW_BADGE.test(readFileSync(path, 'utf8'))) {
      found.push(relative(RENDERER_ROOT, path).split('\\').join('/'))
    }
  }
  return found
}

describe('a session badge cannot forget the compaction', () => {
  it(
    'no file outside the session entity draws the raw SessionBadge — mutation put SessionBadge back at any site turns red',
    () => {
      const offenders = filesNamingRawBadge(RENDERER_ROOT).filter(
        (file) => !ALLOWED.has(file),
      )
      expect(offenders).toEqual([])
    },
    WALK_TEST_TIMEOUT_MS,
  )

  it(
    'every allowed file still exists, so the list cannot rot into a blanket pass',
    () => {
      const naming = new Set(filesNamingRawBadge(RENDERER_ROOT))
      for (const file of ALLOWED) expect(naming.has(file)).toBe(true)
    },
    WALK_TEST_TIMEOUT_MS,
  )
})
