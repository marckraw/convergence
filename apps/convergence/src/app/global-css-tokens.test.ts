import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

/**
 * Every custom property `global.css` reads is one the stylesheets define.
 *
 * A `var(--name)` with no definition and no fallback makes its whole
 * declaration invalid at computed-value time, and the browser drops it
 * without a word. The DS4 NAV sweep renamed the window wash's raw `black` to
 * `var(--media-backdrop)`, a token that never existed, and `.app-chrome`
 * quietly stopped drawing its background; every gate stayed green. This
 * test reads the references and the definitions from the files themselves.
 *
 * Properties the app sets at runtime, on the element that reads them, are
 * named below with where they come from.
 */
const require = createRequire(import.meta.url)
const GLOBAL_CSS = readFileSync(resolve(__dirname, 'global.css'), 'utf8')
const THEME_PATH = require.resolve('@convergence/ui/theme.css')
const THEME_CSS = readFileSync(THEME_PATH, 'utf8')
/** tokens.css sits beside theme.css; the package exports only the theme. */
const TOKENS_CSS = readFileSync(
  resolve(dirname(THEME_PATH), 'tokens.css'),
  'utf8',
)

/** Set inline by `features/mission-control/session-card-breathe.pure.ts`. */
const RUNTIME_PROPERTIES = new Set([
  '--breathe-blur',
  '--breathe-color',
  '--breathe-max',
  '--breathe-min',
  '--breathe-period',
  '--breathe-spread',
])

const definitions = (css: string): Set<string> =>
  new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(([, name]) => name))

describe('global.css reads only properties that exist', () => {
  it('every var() in global.css is defined by the tokens, the theme or itself', () => {
    const defined = new Set([
      ...definitions(TOKENS_CSS),
      ...definitions(THEME_CSS),
      ...definitions(GLOBAL_CSS),
    ])
    const read = [...GLOBAL_CSS.matchAll(/var\((--[a-z0-9-]+)/g)].map(
      ([, name]) => name,
    )
    // Mutation: write `var(--media-backdrop)` back into .app-chrome -> red.
    const missing = [...new Set(read)].filter(
      (name) => !defined.has(name) && !RUNTIME_PROPERTIES.has(name),
    )
    expect(missing).toEqual([])
  })

  it('the runtime list names only properties global.css still reads', () => {
    const read = new Set(
      [...GLOBAL_CSS.matchAll(/var\((--[a-z0-9-]+)/g)].map(([, name]) => name),
    )
    expect([...RUNTIME_PROPERTIES].filter((name) => !read.has(name))).toEqual(
      [],
    )
  })
})
