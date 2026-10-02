import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { crewTokens } from '@convergence/ui'
import { CrewMark, type CrewMarkCrew } from './crew-mark.presentational'

const horses: CrewMarkCrew = {
  name: 'convergence development',
  emoji: '🐎',
  accentColor: crewTokens.violet,
}

const plain: CrewMarkCrew = {
  name: 'spikes',
  emoji: null,
  accentColor: null,
}

/** Every way a crew is drawn, for one crew with a colour and one without. */
function CrewMarks({ crew }: { crew: CrewMarkCrew }) {
  return (
    <ul aria-label="Crew marks" className="flex items-center gap-4 text-xs">
      <li data-variant="chip">
        <CrewMark crew={crew} variant="chip" />
      </li>
      <li data-variant="glyph" className="flex items-center gap-1">
        <CrewMark crew={crew} variant="glyph" />
        {crew.name}
      </li>
      <li data-variant="dot" className="flex items-center gap-1">
        <CrewMark crew={crew} variant="dot" />
        {crew.name}
      </li>
      <li data-variant="swatch" className="flex items-center gap-1">
        <CrewMark crew={crew} variant="swatch" />
        {crew.name}
      </li>
    </ul>
  )
}

const meta = {
  title: 'Features/MissionControl/CrewMark',
  component: CrewMarks,
  args: { crew: horses },
} satisfies Meta<typeof CrewMarks>

export default meta

type Story = StoryObj<typeof meta>

/**
 * A crew with an emoji and a colour: the chip washed in its hue token, its
 * emoji as the glyph, a dot and a swatch in its colour. The chip says which
 * crew to a screen reader.
 */
export const Default: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByText('In crew convergence development'),
    ).toBeInTheDocument()
    const chip = canvasElement.querySelector('[data-slot="badge"]')!
    await expect(chip).toHaveAttribute('data-hue', 'crew-violet')
    const dot = canvasElement.querySelector<HTMLElement>(
      '[data-variant="dot"] [aria-hidden]',
    )!
    await expect(dot.style.backgroundColor).toBe('var(--crew-violet)')
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/**
 * A plain crew: the chip is neutral, the glyph is the people glyph, there is
 * no dot, and the swatch is slate.
 */
export const Empty: Story = {
  args: { crew: plain },
  play: async ({ canvasElement }) => {
    const chip = canvasElement.querySelector('[data-slot="badge"]')!
    await expect(chip).not.toHaveAttribute('data-hue')
    await expect(
      canvasElement.querySelector('[data-variant="glyph"] svg'),
    ).not.toBeNull()
    await expect(
      canvasElement.querySelector('[data-variant="dot"] [aria-hidden]'),
    ).toBeNull()
    const swatch = canvasElement.querySelector<HTMLElement>(
      '[data-variant="swatch"] [aria-hidden]',
    )!
    await expect(swatch.style.backgroundColor).toBe('var(--crew-slate)')
  },
}

export const EmptyDark: Story = {
  ...Empty,
  globals: { theme: 'dark' },
}
