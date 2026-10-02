import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { MetaLine } from './meta-line'

type FactsProps = {
  /** The facts, one per item; empty ones drop out. */
  facts: string[]
}

/** A meta line under a title, as a list row's second line. */
function Facts({ facts }: FactsProps) {
  return (
    <div className="w-80 max-w-full rounded-md bg-canvas p-3">
      <p className="text-sm font-medium text-ink">Rewrite the importer</p>
      <MetaLine className="text-xs text-ink-muted">
        {facts.map((fact) => (
          <span key={fact}>{fact}</span>
        ))}
        {''}
        {false}
      </MetaLine>
    </div>
  )
}

const meta = {
  title: 'Components/MetaLine',
  component: Facts,
  args: { facts: ['convergence', 'main', '4 min ago'] },
} satisfies Meta<typeof Facts>

export default meta

type Story = StoryObj<typeof meta>

/**
 * One "·" between each two facts, hidden from screen readers, which hear a
 * comma; empty facts leave no dot behind.
 */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const line = canvasElement.querySelector(
      '[data-slot="meta-line"]',
    ) as HTMLElement
    const dots = line.querySelectorAll('[aria-hidden="true"]')
    await expect(dots).toHaveLength(2)
    await expect(line.textContent).toBe('convergence, · main, · 4 min ago')
  },
}

export const Dark: Story = {
  globals: { theme: 'dark' },
}

/** Long: one line, ending in an ellipsis. */
export const Long: Story = {
  args: {
    facts: [
      'convergence',
      'ui/ds3d-display-parts-for-the-design-system',
      'Claude Code',
      'edited 14 files',
      '4 min ago',
    ],
  },
  play: async ({ canvasElement }) => {
    const line = canvasElement.querySelector(
      '[data-slot="meta-line"]',
    ) as HTMLElement
    await expect(getComputedStyle(line).textOverflow).toBe('ellipsis')
    await expect(line.scrollWidth).toBeGreaterThan(line.clientWidth)
    await expect(line.getBoundingClientRect().height).toBeLessThan(20)
  },
}

/**
 * Wrapped: facts that must be read whole (a path, a reason) go onto more
 * lines, and no line starts with a dot: each dot keeps to the fact before it.
 */
export const Wrapped: Story = {
  render: () => (
    <div className="w-56 rounded-md bg-canvas p-3">
      <MetaLine wrap className="text-xs text-ink-muted">
        <span>/Users/marcin/Projects/convergence/apps/convergence/src</span>
        <span>Blocked by the sandbox for writes outside the workspace</span>
      </MetaLine>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const line = canvasElement.querySelector(
      '[data-slot="meta-line"]',
    ) as HTMLElement
    await expect(getComputedStyle(line).textOverflow).not.toBe('ellipsis')
    await expect(line.getBoundingClientRect().height).toBeGreaterThan(20)
    await expect(line.scrollWidth).toBeLessThanOrEqual(line.clientWidth)
    // The dot sits on the line of the fact before it, never first on a line.
    const dot = line.querySelector('[aria-hidden="true"]') as HTMLElement
    const facts = line.querySelectorAll(
      ':scope > span:not([aria-hidden]):not(.sr-only)',
    )
    const first = facts[0].getBoundingClientRect()
    const dotBox = dot.getBoundingClientRect()
    await expect(dotBox.bottom).toBeLessThanOrEqual(first.bottom + 1)
  },
}
