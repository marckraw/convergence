import type { Meta, StoryObj } from '@storybook/react-vite'
import { RotateCcw } from 'lucide-react'
import { Button } from '@convergence/ui'
import { expect } from 'storybook/test'
import { DiffFileHeader } from './diff-file-header.presentational'

const meta = {
  title: 'Widgets/SessionView/DiffFileHeader',
  component: DiffFileHeader,
  args: {
    path: 'apps/convergence/src/features/composer/composer.container.tsx',
    status: 'M',
    subtitle: 'Turn 4',
  },
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="w-[32rem] max-w-full rounded-md border border-border bg-background">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DiffFileHeader>

export default meta

type Story = StoryObj<typeof meta>

/** The file's path with its git status, and a short label under it. */
export const Default: Story = {
  play: async ({ args, canvas }) => {
    const path = canvas.getByText(args.path)
    await expect(path).toBeVisible()
    // The whole path is in the tooltip, for when the row cuts it short.
    await expect(path).toHaveAttribute('title', args.path)
    await expect(canvas.getByText('M')).toBeVisible()
    await expect(canvas.getByText('Turn 4')).toBeVisible()
  },
}

/** A sentence under the path instead of a label. */
export const Description: Story = {
  args: {
    subtitle:
      'Uncommitted changes in the working tree, compared with the last commit on this branch.',
    subtitleVariant: 'description',
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(/Uncommitted changes in the working tree/),
    ).toBeVisible()
  },
}

/** Loading the diff: a spinner sits beside the path. */
export const Busy: Story = {
  args: { loading: true },
}

/** A path far wider than the pane, cut short with the actions still whole. */
export const Long: Story = {
  args: {
    path: 'packages/very-deeply/nested/workspace/that-nobody/remembers-creating/src/features/conversation/history/transcript-entry-view-model.pure.test.ts',
    actions: (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Reset visible diff context"
        className="h-6 w-6"
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
      </Button>
    ),
  },
  play: async ({ args, canvas }) => {
    const path = canvas.getByText(args.path)
    await expect(path.scrollWidth).toBeGreaterThan(path.clientWidth)
    await expect(
      canvas.getByRole('button', { name: 'Reset visible diff context' }),
    ).toBeVisible()
  },
}

/** Just the path: no status and no label. */
export const Empty: Story = {
  args: { status: undefined, subtitle: undefined },
  play: async ({ args, canvas }) => {
    await expect(canvas.getByText(args.path)).toBeVisible()
    await expect(canvas.queryByText('M')).toBeNull()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
