import type { Meta, StoryObj } from '@storybook/react-vite'
import type { PromptLibraryEntry } from '@/entities/prompt-library'
import { expect, fn } from 'storybook/test'
import { ComposerPromptInjectionPicker } from './composer-prompt-injection-picker.presentational'

const prompts: PromptLibraryEntry[] = [
  {
    id: 'prompt-review',
    title: 'Independent review',
    description: 'Review the branch against master as a second agent would.',
    shortDescription: 'Review the branch as a second agent',
    path: '/Users/me/.prompts/independent-review.md',
    relativePath: 'independent-review.md',
    scope: 'global',
    sourceLabel: 'Global',
    kind: 'markdown',
    tags: ['review', 'loop', 'quality', 'extra'],
    sizeBytes: 2_400,
  },
  {
    id: 'prompt-ship',
    title: 'Ship it',
    description: '',
    shortDescription: null,
    path: '/Users/me/Projects/convergence/.prompts/ship-it.md',
    relativePath: '.prompts/ship-it.md',
    scope: 'project',
    sourceLabel: 'Project',
    kind: 'markdown',
    tags: [],
    sizeBytes: 1_100,
  },
]

const meta = {
  title: 'Features/Composer/ComposerPromptInjectionPicker',
  component: ComposerPromptInjectionPicker,
  args: {
    open: true,
    listId: 'prompts',
    items: prompts,
    highlightedIndex: 0,
    isLoading: false,
    error: null,
    onSelect: fn(),
    onHover: fn(),
    onDismiss: fn(),
  },
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="relative mt-72 w-144 max-w-full rounded-md border border-border bg-card p-3 text-sm text-muted-foreground">
        <Story />
        ::prompt::
      </div>
    ),
  ],
} satisfies Meta<typeof ComposerPromptInjectionPicker>

export default meta

type Story = StoryObj<typeof meta>

/** The prompt library, under ::prompt::; picking one injects it. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    // A named list that holds only its options (MAR-3616 DS3e).
    await expect(canvas.getByRole('listbox')).toHaveAccessibleName('Prompts')
    const review = canvas.getByRole('option', { name: /Independent review/ })
    await expect(review).toHaveAttribute('aria-selected', 'true')
    // At most three tags, and the path when nothing describes it.
    await expect(canvas.queryByText('extra')).toBeNull()
    await expect(canvas.getByText('.prompts/ship-it.md')).toBeVisible()
    await userEvent.click(canvas.getByRole('option', { name: /Ship it/ }))
    await expect(args.onSelect).toHaveBeenCalledWith(prompts[1])
  },
}

/** Reading the library. */
export const Busy: Story = {
  args: { items: [], isLoading: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Loading prompts...')).toBeVisible()
  },
}

/** The library could not be read. */
export const Failed: Story = {
  args: {
    items: [],
    error: 'Could not read ~/.prompts: permission denied',
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/permission denied/)).toBeVisible()
  },
}

/** Nothing matches. */
export const Empty: Story = {
  args: { items: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No matching prompts.')).toBeVisible()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

export const ReducedMotion: Story = {
  ...Busy,
  globals: { motion: 'reduced' },
}
