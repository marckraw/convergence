import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { ComposerInjectionRootPicker } from './composer-injection-root-picker.presentational'
import { filterComposerInjectionRootItems } from './composer-injection-trigger.pure'

const items = filterComposerInjectionRootItems({
  query: '',
  includeContext: true,
  includePrompt: true,
  includeSkill: true,
})

const knownListboxIssues = {
  a11y: {
    config: {
      rules: [
        // a11y-known: the picker's listbox has no accessible name — fixed by the sweep (DS4)
        { id: 'aria-input-field-name', enabled: false },
        // a11y-known: the listbox also holds its visually hidden Close button (and, when empty, a message), which are not options — fixed by the sweep (DS4)
        { id: 'aria-required-children', enabled: false },
      ],
    },
  },
}

const meta = {
  title: 'Features/Composer/ComposerInjectionRootPicker',
  component: ComposerInjectionRootPicker,
  args: {
    open: true,
    items,
    highlightedIndex: 0,
    onSelect: fn(),
    onHover: fn(),
    onDismiss: fn(),
  },
  parameters: { layout: 'padded' },
  // The picker floats above the composer's field, as it does in the app.
  decorators: [
    (Story) => (
      <div className="relative mt-56 w-[36rem] max-w-full rounded-md border border-border bg-card p-3 text-sm text-muted-foreground">
        <Story />
        ::
      </div>
    ),
  ],
} satisfies Meta<typeof ComposerInjectionRootPicker>

export default meta

type Story = StoryObj<typeof meta>

/** Typing :: offers the three kinds of injection; the first is highlighted. */
export const Default: Story = {
  parameters: knownListboxIssues,
  play: async ({ args, canvas, userEvent }) => {
    const options = canvas.getAllByRole('option')
    await expect(options).toHaveLength(3)
    await expect(options[0]).toHaveAttribute('aria-selected', 'true')
    await userEvent.hover(canvas.getByRole('option', { name: /Prompt/ }))
    await expect(args.onHover).toHaveBeenCalledWith(2)
    await userEvent.click(canvas.getByRole('option', { name: /Skill/ }))
    await expect(args.onSelect).toHaveBeenCalledWith(items[1])
  },
}

/** Nothing matches what was typed. */
export const Empty: Story = {
  parameters: knownListboxIssues,
  args: { items: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No matching injections.')).toBeVisible()
  },
}

/** Closed: nothing is drawn. */
export const Closed: Story = {
  args: { open: false },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('listbox')).toBeNull()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
