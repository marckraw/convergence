/// <reference types="vite/client" />
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import tokensCss from '../styles/tokens.css?raw'

/**
 * Every colour token in tokens.css, read from the file itself so none can be
 * missing here, as a swatch with its name, in both themes side by side. Each
 * side is a subtree with its own data-theme, the way the terminal dock is
 * dark in a light app: the swatch is painted with var(--token), and the
 * subtree's color-scheme picks the half of light-dark().
 */

type Token = { name: string; light: string; dark: string }

const FAMILIES: ReadonlyArray<readonly [string, RegExp]> = [
  ['Surfaces', /^(canvas|surface|raised|sheet|glass|scrim|viewer)/],
  [
    'Text, strong and highlight',
    /^(ink|strong|on-strong|highlight|on-highlight)/,
  ],
  ['Lines and focus', /^(line|control-|focus)/],
  ['Overlays, chosen and selected (R7)', /^(hairline|fill-|chip)/],
  ['Status (R1)', /^(neutral|info|success|warning|danger|on-danger)/],
  ['Categories (R1)', /^(tag-|merged)/],
  ['Crews', /^crew-/],
  ['Providers', /^provider-/],
  ['Charts', /^chart-/],
  ['Diffs and the agent', /^(diff-|avatar-|on-avatar-)/],
  ['Window chrome', /^(chrome-|scrollbar-)/],
  ['The terminal, dark in both (R12)', /^terminal-/],
]

const COLOUR = /^(light-dark\(|#|rgba?\(|oklch\()/

function splitLightDark(value: string): [string, string] {
  const inner = /^light-dark\((.*)\)$/.exec(value)?.[1]
  if (inner === undefined) return [value, value]
  let depth = 0
  for (let index = 0; index < inner.length; index++) {
    if (inner[index] === '(') depth++
    else if (inner[index] === ')') depth--
    else if (inner[index] === ',' && depth === 0) {
      return [inner.slice(0, index).trim(), inner.slice(index + 1).trim()]
    }
  }
  return [value, value]
}

/** The colour tokens of tokens.css's top-level :root, aliases included. */
function readColourTokens(css: string): Token[] {
  const root = /^:root \{([\s\S]*?)^\}/m
    .exec(css.replace(/\/\*[\s\S]*?\*\//g, ''))?.[1]
    ?.replace(/\s+/g, ' ')
  if (!root) throw new Error('tokens.css has no :root block')
  const declared = [...root.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map(
    ([, name, value]) => [name, value.trim()] as const,
  )
  const values = new Map(declared)
  const isColour = (value: string): boolean => {
    const alias = /^var\(--([a-z0-9-]+)\)$/.exec(value)?.[1]
    return alias ? isColour(values.get(alias) ?? '') : COLOUR.test(value)
  }
  return declared
    .filter(([, value]) => isColour(value))
    .map(([name, value]) => {
      const [light, dark] = splitLightDark(value)
      return { name, light, dark }
    })
}

const TOKENS = readColourTokens(tokensCss)
const GROUPS = FAMILIES.map(
  ([family, pattern]) =>
    [family, TOKENS.filter(({ name }) => pattern.test(name))] as const,
)

function Swatch({ token, theme }: { token: Token; theme: 'light' | 'dark' }) {
  return (
    <li className="flex items-center gap-3" data-token={token.name}>
      {/* Over the panel's canvas, as a translucent token is seen in the app. */}
      <span
        aria-hidden
        data-swatch
        className="h-8 w-12 shrink-0 rounded-md border border-line"
        style={{ backgroundColor: `var(--${token.name})` }}
      />
      <span className="min-w-0">
        <span className="block font-mono text-xs">--{token.name}</span>
        <span className="block truncate font-mono text-2xs text-ink-muted">
          {theme === 'light' ? token.light : token.dark}
        </span>
      </span>
    </li>
  )
}

function ThemePanel({ theme }: { theme: 'light' | 'dark' }) {
  const label = theme === 'light' ? 'Light' : 'Dark'
  return (
    <section
      aria-label={label}
      data-theme={theme}
      className="flex-1 bg-canvas p-6 text-ink"
    >
      <h2 className="mb-4 text-lg font-semibold">{label}</h2>
      {GROUPS.map(([family, tokens]) => (
        <div key={family} className="mb-6">
          <h3 className="mb-2 text-xs font-medium tracking-eyebrow text-ink-muted uppercase">
            {family}
          </h3>
          <ul
            aria-label={`${family}, ${label.toLowerCase()}`}
            className="grid gap-2"
          >
            {tokens.map((token) => (
              <Swatch key={token.name} token={token} theme={theme} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

function Colors() {
  return (
    <div className="flex">
      <ThemePanel theme="light" />
      <ThemePanel theme="dark" />
    </div>
  )
}

const meta = {
  title: 'Foundations/Colors',
  component: Colors,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Colors>

export default meta

type Story = StoryObj<typeof meta>

/** Every colour token, light on the left and dark on the right. */
export const Default: Story = {
  play: async ({ canvas }) => {
    const light = within(canvas.getByRole('region', { name: 'Light' }))
    const dark = within(canvas.getByRole('region', { name: 'Dark' }))
    // Every colour token in tokens.css has a swatch on each side, and each
    // lands in a family: none is left out.
    await expect(TOKENS.length).toBeGreaterThan(100)
    await expect(GROUPS.flatMap(([, tokens]) => tokens)).toHaveLength(
      TOKENS.length,
    )
    await expect(light.getAllByRole('listitem')).toHaveLength(TOKENS.length)
    await expect(dark.getAllByRole('listitem')).toHaveLength(TOKENS.length)

    const paint = (side: typeof light, name: string) =>
      getComputedStyle(
        side
          .getByText(`--${name}`)
          .closest('li')!
          .querySelector('[data-swatch]')!,
      ).backgroundColor
    // A themed token resolves per side: the subtree's data-theme picks it.
    await expect(paint(light, 'canvas')).not.toBe(paint(dark, 'canvas'))
    await expect(paint(light, 'ink')).not.toBe(paint(dark, 'ink'))
    // The terminal is one colour in both (R12).
    await expect(paint(light, 'terminal-bg')).toBe(paint(dark, 'terminal-bg'))
  },
}
