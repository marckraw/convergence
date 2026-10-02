import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { layoutPx } from '../styles/layout.tokens'

/**
 * Layout: the widths CSS draws (each a --layout-* token, mirrored for the
 * TypeScript that does arithmetic on them), and the card grids, which take as
 * many columns as fit, each at least N spacing steps wide: `grid-cols-fill-*`
 * keeps the spare columns, `grid-cols-fit-*` lets the cards stretch into them.
 */
function Layout() {
  return (
    <div className="grid w-xl gap-6 bg-canvas p-6 text-ink">
      <section aria-label="Widths">
        <h2 className="mb-2 text-sm font-semibold">Widths</h2>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
          {Object.entries(layoutPx).map(([name, px]) => (
            <li key={name} className="flex justify-between font-mono">
              <span>{name}</span>
              <span className="text-ink-muted">{px} px</span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Card grids" className="grid gap-3">
        <h2 className="text-sm font-semibold">Card grids</h2>
        <p className="text-xs text-ink-muted">
          grid-cols-fill-32: columns of at least 128 px, spare ones kept
        </p>
        <ul data-grid="fill" className="grid grid-cols-fill-32 gap-2">
          {['One', 'Two'].map((word) => (
            <li
              key={word}
              className="rounded-md border border-line bg-surface px-3 py-2 text-xs"
            >
              {word}
            </li>
          ))}
        </ul>
        <p className="text-xs text-ink-muted">
          grid-cols-fit-32: the same columns, the cards stretched into the room
        </p>
        <ul data-grid="fit" className="grid grid-cols-fit-32 gap-2">
          {['One', 'Two'].map((word) => (
            <li
              key={word}
              className="rounded-md border border-line bg-surface px-3 py-2 text-xs"
            >
              {word}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

const meta = {
  title: 'Foundations/Layout',
  component: Layout,
} satisfies Meta<typeof Layout>

export default meta

type Story = StoryObj<typeof meta>

/** Fill keeps its empty columns, so two cards stay narrow; fit stretches them. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const fill = canvasElement.querySelector('[data-grid="fill"]')!
    const fit = canvasElement.querySelector('[data-grid="fit"]')!
    await expect(getComputedStyle(fill).gridTemplateColumns).not.toBe('none')
    const fillCard = fill.firstElementChild!.getBoundingClientRect().width
    const fitCard = fit.firstElementChild!.getBoundingClientRect().width
    await expect(fillCard).toBeGreaterThanOrEqual(128)
    await expect(fitCard).toBeGreaterThan(fillCard)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
