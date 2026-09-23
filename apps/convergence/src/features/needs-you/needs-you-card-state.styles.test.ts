import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { cardStateTone, cardStateToneKeys } from './needs-you-card-state.styles'

const sourceRoot = resolve(__dirname, '../..')
const roots = ['features/needs-you', 'widgets/sidebar']
const home = 'features/needs-you/needs-you-card-state.styles.ts'

/**
 * Files where one of these classes paints a different fact than a card's
 * state, so a match there is not a copy of the tone. Adding a file here is a
 * decision; a new copy of the card tone fails the pin instead.
 */
const otherFacts: Readonly<Record<string, readonly string[]>> = {
  // The PR chip colours the pull request's own state (closed, changes asked).
  'features/needs-you/needs-you-pr.presentational.tsx': [
    'text-warning-foreground',
    'text-destructive',
  ],
  // The Delete items of the sidebar's context menus.
  'widgets/sidebar/global-chat-session-list.presentational.tsx': [
    'text-destructive',
  ],
  'widgets/sidebar/project-tree.container.tsx': ['text-destructive'],
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

it('MAR-3366 R6 each card tone class lives in one non-test file — mutation: the strip keeps its own copy of the classes turns red', () => {
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
    expect({ token, holders }).toEqual({ token, holders: [home] })
  }
})
