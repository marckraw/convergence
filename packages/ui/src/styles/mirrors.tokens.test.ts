import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { crewTokens } from './crew.tokens'
import { layoutPx } from './layout.tokens'
import { terminalTokens } from './terminal.tokens'

/**
 * The TypeScript mirrors of tokens.css (MAR-3615 DS2): for code that can't
 * read CSS (xterm) or does arithmetic on what CSS draws (the dock decision).
 * Each value must be the token's, so the two can't drift apart.
 */
const css = readFileSync(join(__dirname, 'tokens.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)

const token = (name: string): string => {
  const value = css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]
  if (value === undefined) throw new Error(`tokens.css has no --${name}`)
  return value.trim().replace(/\s+/g, ' ')
}

const pixels = (value: string): number => {
  if (value.endsWith('rem')) return Number.parseFloat(value) * 16
  if (value.endsWith('px')) return Number.parseFloat(value)
  throw new Error(`not a length: ${value}`)
}

describe('layout.tokens.ts mirrors the --layout-* tokens', () => {
  it.each([
    ['conversation', 'layout-conversation'],
    ['conversationGutter', 'layout-conversation-gutter'],
    ['sidePanel', 'layout-side-panel'],
    ['workPanel', 'layout-work-panel'],
    ['dialog', 'layout-dialog'],
    ['dialogHeight', 'layout-dialog-height'],
  ] as const)('layoutPx.%s is --%s', (key, name) => {
    expect(layoutPx[key]).toBe(pixels(token(name)))
  })

  it('leaves the conversation whole beside a docked panel: 672 + 2 × 24', () => {
    expect(layoutPx.conversation + 2 * layoutPx.conversationGutter).toBe(720)
  })
})

describe('terminal.tokens.ts mirrors the --terminal-* tokens', () => {
  it.each([
    ['bg', 'terminal-bg'],
    ['ink', 'terminal-ink'],
    ['cursor', 'terminal-cursor'],
    ['selection', 'terminal-selection'],
  ] as const)('terminalTokens.%s is --%s', (key, name) => {
    expect(terminalTokens[key]).toBe(token(name))
  })

  it.each(Object.keys(terminalTokens.ansi))(
    'the ANSI %s, plain and bright',
    (colour) => {
      const key = colour as keyof typeof terminalTokens.ansi
      expect(terminalTokens.ansi[key]).toBe(token(`terminal-ansi-${colour}`))
      expect(terminalTokens.ansiBright[key]).toBe(
        token(`terminal-ansi-bright-${colour}`),
      )
    },
  )

  it('the type', () => {
    const quotes = (value: string) => value.replace(/"/g, "'")
    expect(quotes(terminalTokens.font)).toBe(quotes(token('terminal-font')))
    expect(terminalTokens.fontSize).toBe(pixels(token('terminal-font-size')))
    expect(terminalTokens.lineHeight).toBe(
      Number(token('terminal-line-height')),
    )
  })

  it('has one value in both themes: the terminal is dark in either (R12)', () => {
    const terminal = [...css.matchAll(/--(terminal-[a-z0-9-]+):\s*([^;]+);/g)]
    expect(terminal.length).toBeGreaterThan(20)
    for (const [, name, value] of terminal) {
      expect(value, `--${name}`).not.toMatch(/light-dark\(/)
    }
  })
})

describe('crew.tokens.ts mirrors the --crew-* tokens', () => {
  it.each(Object.entries(crewTokens))(
    'crewTokens.%s is --crew-%s, the same in both themes',
    (name, hex) => {
      expect(token(`crew-${name}`)).toBe(`light-dark(${hex}, ${hex})`)
    },
  )

  it('names every crew colour tokens.css has, and no other', () => {
    const declared = [...css.matchAll(/--crew-([a-z]+):/g)].map(
      ([, name]) => name,
    )
    expect(declared.sort()).toEqual(Object.keys(crewTokens).sort())
  })
})
