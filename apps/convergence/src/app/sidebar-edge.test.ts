import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * NAV-10: the sidebar's right edge is drawn once. The aside carries the
 * hairline (`border-r border-hairline`, right in both themes), and the panel's
 * stylesheet used to add `inset -1px 0 0 var(--chrome-edge)` beside it: two
 * 1 px lines side by side, the inner one white in light. Neither file alone
 * shows the double edge, so this reads both.
 */
const LAYOUT = readFileSync(resolve(__dirname, 'App.layout.tsx'), 'utf8')
const GLOBAL_CSS = readFileSync(resolve(__dirname, 'global.css'), 'utf8')

/** The declarations of one rule, `.selector { … }`, without nested rules. */
const ruleBody = (css: string, selector: string): string => {
  const start = css.indexOf(`${selector} {`)
  expect(start).toBeGreaterThan(-1)
  return css.slice(start, css.indexOf('}', start))
}

describe('the sidebar has one right edge', () => {
  it('the aside draws the hairline', () => {
    expect(LAYOUT).toMatch(
      /'app-sidebar-panel[^']*\bborder-r border-hairline\b/,
    )
  })

  it('the panel draws no inset edge beside it — mutation: put the inset line back, red', () => {
    const panel = ruleBody(GLOBAL_CSS, '.app-sidebar-panel')
    expect(panel).not.toMatch(/inset\s+-1px\s+0\s+0/)
  })
})
