import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { tokenColor } from '../../../.storybook/color-testing'
import { Divider } from './divider'

/** Two groups with a plain rule between them, and a row split by a vertical one. */
function Groups() {
  return (
    <div className="flex w-72 flex-col gap-3 rounded-md bg-canvas p-4 text-sm text-ink">
      <p>Provider settings</p>
      <Divider />
      <p>Account settings</p>
      <div className="flex h-5 items-center gap-2 text-xs text-ink-muted">
        <span>main</span>
        <Divider orientation="vertical" />
        <span>3 files</span>
      </div>
    </div>
  )
}

const meta = {
  title: 'Components/Divider',
  component: Groups,
} satisfies Meta<typeof Groups>

export default meta

type Story = StoryObj<typeof meta>

/** A 1 px rule in the quiet border colour, as a separator, either way. */
export const Default: Story = {
  play: async ({ canvas }) => {
    const [across, down] = canvas.getAllByRole('separator')
    await expect(across).toHaveAttribute('aria-orientation', 'horizontal')
    await expect(down).toHaveAttribute('aria-orientation', 'vertical')
    await expect(across.getBoundingClientRect().height).toBe(1)
    await expect(down.getBoundingClientRect().width).toBe(1)
    await expect(getComputedStyle(across).backgroundColor).toBe(
      tokenColor('--line'),
    )
  },
}

/** Labelled: rule, words, rule; the words name the separator. */
export const Labelled: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-3 rounded-md bg-canvas p-4 text-sm text-ink">
      <p>…the importer now reads every format.</p>
      <Divider label="Compacted 42 turns" />
      <p>Where were we?</p>
    </div>
  ),
  play: async ({ canvas }) => {
    const marker = canvas.getByRole('separator', {
      name: 'Compacted 42 turns',
    })
    await expect(getComputedStyle(marker).fontSize).toBe('12px')
  },
}

export const Dark: Story = {
  globals: { theme: 'dark' },
  render: Labelled.render,
}
