import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { MarkdownPresentational } from './markdown.presentational'

/** An agent's answer, with one of each thing Markdown draws. */
const ANSWER = `## The sidebar overflow

The list clips because \`overflow-hidden\` sits on the wrong element. See [the layout notes](https://example.com/layout) before changing it.

- Move the clip to the scroll container
- Keep the row's own \`min-w-0\`

> Measure it on a small window first.

| File | Change |
| --- | --- |
| sidebar.container.tsx | the clip |
| project-tree.container.tsx | the row |
`

const meta = {
  title: 'Components/Shared/Markdown',
  component: MarkdownPresentational,
  args: { content: ANSWER },
  decorators: [
    (Story) => (
      <div className="w-160 max-w-full bg-canvas p-4 text-ink">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MarkdownPresentational>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The conversation's answer, at the transcript's size: a heading, a link that
 * leaves for the browser, inline code a hair under the words around it, a
 * list, a quote and a table.
 */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('heading', { name: 'The sidebar overflow' }),
    ).toBeVisible()
    const link = canvas.getByRole('link', { name: 'the layout notes' })
    await expect(link).toHaveAttribute('href', 'https://example.com/layout')
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute(
      'rel',
      expect.stringContaining('noreferrer'),
    )
    // Inline code is relative to its sentence: 0.92 of the 14 px body.
    const code = canvas.getByText('overflow-hidden')
    await expect(
      Number.parseFloat(getComputedStyle(code).fontSize),
    ).toBeCloseTo(14 * 0.92, 1)
    await expect(canvas.getAllByRole('listitem')).toHaveLength(2)
    await expect(canvas.getByRole('table')).toBeVisible()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** The compact size, for side panels and cards: the same parts in smaller print. */
export const Compact: Story = {
  args: { size: 'sm' },
  play: async ({ canvas }) => {
    const code = await canvas.findByText('overflow-hidden')
    await expect(
      Number.parseFloat(getComputedStyle(code).fontSize),
    ).toBeCloseTo(12 * 0.92, 1)
  },
}

/** A long link breaks anywhere rather than pushing the column wider. */
export const Long: Story = {
  args: {
    content:
      'Opened https://github.com/marckraw/convergence/pull/931/files#diff-2a4d6c0b9e1f8a7c3b5d2e6f4a1c9b7d8e0f2a3c4b5d6e7f8a9b0c1d2e3f4a5b6 for review.',
  },
  play: async ({ canvas, canvasElement }) => {
    const link = await canvas.findByRole('link')
    await expect(link.getBoundingClientRect().right).toBeLessThanOrEqual(
      canvasElement.getBoundingClientRect().right,
    )
  },
}
