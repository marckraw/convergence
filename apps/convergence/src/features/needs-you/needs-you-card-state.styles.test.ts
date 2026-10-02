import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { WALK_TEST_TIMEOUT_MS } from '../../../test/walk-budget'
import { cardStateTone, cardStateToneKeys } from './needs-you-card-state.styles'

const sourceRoot = resolve(__dirname, '../..')
const roots = ['features/needs-you', 'widgets/sidebar']

/**
 * Files where one of these classes paints a different fact than a card's
 * state, so a match there is not a copy of the tone. Adding a file here is a
 * decision; a new copy of the card tone fails the pin instead.
 */
const otherFacts: Readonly<Record<string, readonly string[]>> = {
  // The PR chip colours the pull request's own state (closed, changes asked,
  // open), in the same tone inks.
  'features/needs-you/needs-you-pr.presentational.tsx': [
    'text-warning-ink',
    'text-danger-ink',
    'text-success-ink',
  ],
  // The Delete items of the sidebar's context menus (the danger ink, under
  // either name while the sweep renames it).
  'widgets/sidebar/global-chat-session-list.presentational.tsx': [
    'text-danger-ink',
    'text-danger-ink',
  ],
  'widgets/sidebar/project-tree.container.tsx': [
    'text-danger-ink',
    'text-danger-ink',
  ],
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.isFile() && !/\.(test|spec)\.[^.]+$/.test(entry.name)
      ? [path]
      : []
  })
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Two source trees, so this spends the shared walk budget (MAR-3385).
// The inks come from the kit's toneInk through the session's own map
// (NAV-1, SESSION_STATE_TONE), so no file in these trees types one: the
// card state's home holds names, not classes.
it(
  'MAR-3366 R6 no card tone class is typed in the feed or the sidebar — mutation: the strip keeps its own copy of the classes turns red',
  { timeout: WALK_TEST_TIMEOUT_MS },
  () => {
    const files = roots
      .flatMap((root) => sourceFiles(join(sourceRoot, root)))
      .map((path) => ({
        name: relative(sourceRoot, path),
        text: readFileSync(path, 'utf8'),
      }))
    const tokens = [
      ...new Set(
        cardStateToneKeys.flatMap((key) => cardStateTone[key].split(/\s+/)),
      ),
    ]
    expect(tokens.length).toBeGreaterThanOrEqual(cardStateToneKeys.length)
    for (const token of tokens) {
      const pattern = new RegExp(`(?<![\\w:/-])${escape(token)}(?![\\w-])`)
      const holders = files
        .filter(({ name, text }) => {
          if (!pattern.test(text)) return false
          return !otherFacts[name]?.includes(token)
        })
        .map(({ name }) => name)
      expect({ token, holders }).toEqual({ token, holders: [] })
    }
  },
)
