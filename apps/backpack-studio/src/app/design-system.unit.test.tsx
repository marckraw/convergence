import { readFileSync, readdirSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Button, StoryPanel } from '../shared/ui'

const expectedTokens = {
  bg: '#faf8f5',
  nav: '#f0efe9',
  navInk: '#34463d',
  ink: '#242b28',
  muted: '#636d67',
  accent: '#275f49',
  line: '#e1e5de',
  soft: '#eaf0e4',
  surface: '#ffffff',
  connected: '#238251',
}

afterEach(() => {
  cleanup()
  document.head.replaceChildren()
})

describe('Studio design system (MAR-2853)', () => {
  it.each(Object.entries(expectedTokens))(
    'declares the %s token at the rendered root',
    (name, value) => {
      // Mutation: delete the named token from studio-theme.css.
      const style = document.createElement('style')
      style.textContent = readFileSync('src/shared/ui/studio-theme.css', 'utf8')
      document.head.append(style)
      render(<StoryPanel />)
      expect(
        getComputedStyle(document.documentElement)
          .getPropertyValue(`--studio-explore-${name}`)
          .trim(),
      ).toBe(value)
    },
  )
  it('renders the shared story copy and the real filled Backpack button', () => {
    // Mutations: remove a story line; replace Button with a native button or change its variant.
    render(
      <>
        <StoryPanel />
        <Button variant="filled" size="regular">
          Continue with Microsoft
        </Button>
      </>,
    )
    for (const text of [
      'backpack studio',
      'Good ideas.',
      'A little help.',
      'Real progress.',
      'Your work with an assistant that knows the tools.',
    ]) {
      expect(screen.getByText(text)).toBeTruthy()
    }
    expect(
      screen.getByRole('button').classList.contains('ef-button-filled'),
    ).toBe(true)
  })
})

it('keeps literal component colors in the theme file', () => {
  // Mutation: add color: '#ffffff' to a screen.
  const files = readdirSync('src', {
    recursive: true,
    withFileTypes: true,
  }).filter(
    (entry) =>
      entry.isFile() &&
      /\.(tsx?|css)$/.test(entry.name) &&
      !/test\.|studio-theme/.test(entry.name),
  )
  const violations = files
    .filter((entry) =>
      /#[0-9a-f]{3,8}\b/i.test(
        readFileSync(entry.parentPath + '/' + entry.name, 'utf8'),
      ),
    )
    .map((entry) => entry.name)
  expect(violations).toEqual([])
})
