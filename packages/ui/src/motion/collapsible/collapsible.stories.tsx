import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor } from 'storybook/test'
import { settled } from '../../../.storybook/motion-testing'
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from './collapsible'

/** A tool call in the transcript, its output folded away. */
function ToolCall() {
  return (
    <div className="w-80 rounded-md bg-canvas p-3 text-sm text-ink">
      <Collapsible>
        <CollapsibleTrigger className="text-xs text-ink-muted hover:text-ink">
          Ran npm test
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <p className="pt-2 text-xs text-ink-muted">
            Tests 142 passed (142) in 4.1 s.
          </p>
        </CollapsiblePanel>
      </Collapsible>
    </div>
  )
}

const meta = {
  title: 'Motion/Collapsible',
  component: ToolCall,
} satisfies Meta<typeof ToolCall>

export default meta

type Story = StoryObj<typeof meta>

const panelIn = (canvasElement: HTMLElement) =>
  canvasElement.querySelector<HTMLElement>('[data-slot="collapsible-panel"]')

/**
 * Closed, the panel isn't there; the trigger says so with aria-expanded.
 * Opening grows it and fades it in, and its chevron turns a quarter.
 */
export const Default: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Ran npm test' })
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect(canvas.queryByText(/Tests 142 passed/)).toBeNull()
    await userEvent.click(trigger)
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const panel = panelIn(canvasElement) as HTMLElement
    await expect(trigger).toHaveAttribute('aria-controls', panel.id)
    await waitFor(() =>
      expect(canvas.getByText(/Tests 142 passed/)).toBeVisible(),
    )
    await settled(panel)
    await expect(panel.getBoundingClientRect().height).toBeGreaterThan(0)
    const chevron = canvasElement.querySelector(
      '[data-slot="collapsible-chevron"]',
    ) as SVGElement
    await settled(chevron)
    await expect(getComputedStyle(chevron).rotate).toBe('90deg')
    await userEvent.click(trigger)
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() => expect(panelIn(canvasElement)).toBeNull())
  },
}

export const Dark: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Ran npm test' }))
    await settled(panelIn(canvasElement) as HTMLElement)
  },
}

/** Reduced motion: it opens at once, keeping only the fade. */
export const ReducedMotion: Story = {
  globals: { motion: 'reduced' },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Ran npm test' }))
    const panel = panelIn(canvasElement) as HTMLElement
    await expect(getComputedStyle(panel).transitionProperty).toBe('opacity')
    const chevron = canvasElement.querySelector(
      '[data-slot="collapsible-chevron"]',
    ) as SVGElement
    await expect(getComputedStyle(chevron).transitionProperty).toBe('none')
    await settled(panel)
  },
}
