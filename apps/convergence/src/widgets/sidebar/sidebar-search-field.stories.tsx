import type { Meta, StoryObj } from '@storybook/react-vite'
import { useRef, type ComponentProps } from 'react'
import { expect, fn } from 'storybook/test'
import { SidebarSearchField } from './sidebar-search-field.presentational'

/** The field with its own ref, as the search container gives it one. */
function SearchField(
  props: Omit<ComponentProps<typeof SidebarSearchField>, 'inputRef'>,
) {
  const inputRef = useRef<HTMLInputElement>(null)
  return <SidebarSearchField {...props} inputRef={inputRef} />
}

const meta = {
  title: 'Widgets/Sidebar/Sidebar search field',
  component: SearchField,
  args: {
    query: '',
    onQueryChange: fn(),
    onClear: fn(),
    onEscape: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-72 rounded-lg border border-line bg-canvas pb-2 text-ink">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SearchField>

export default meta

type Story = StoryObj<typeof meta>

/** A search landmark with one field; typing narrows, Escape leaves. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole('search', { name: 'Search conversations' }),
    ).toBeVisible()
    const field = canvas.getByRole('searchbox', {
      name: 'Search conversations',
    })
    await userEvent.type(field, 's')
    await expect(args.onQueryChange).toHaveBeenCalledWith('s')
    await userEvent.keyboard('{Escape}')
    await expect(args.onEscape).toHaveBeenCalledOnce()
    // Nothing typed, nothing to clear.
    await expect(
      canvas.queryByRole('button', { name: 'Clear search' }),
    ).toBeNull()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** With a query, a button clears it. */
export const Filled: Story = {
  args: { query: 'sidebar overflow' },
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole('searchbox', { name: 'Search conversations' }),
    ).toHaveValue('sidebar overflow')
    await userEvent.click(canvas.getByRole('button', { name: 'Clear search' }))
    await expect(args.onClear).toHaveBeenCalledOnce()
  },
}

/** A long query stays inside the field, clear of its clear button. */
export const Long: Story = {
  args: {
    query:
      'the conversation where we talked about the sidebar overflowing on small windows',
  },
  play: async ({ canvas }) => {
    const field = canvas.getByRole('searchbox', {
      name: 'Search conversations',
    })
    const clear = canvas.getByRole('button', { name: 'Clear search' })
    // The field's box is SearchField's frame: the words end where the clear
    // button starts, and the button sits inside the frame.
    const frame = field.closest('[data-slot="search-field"]') as HTMLElement
    await expect(field.scrollWidth).toBeGreaterThan(field.clientWidth)
    await expect(field.getBoundingClientRect().right).toBeLessThanOrEqual(
      clear.getBoundingClientRect().left,
    )
    await expect(clear.getBoundingClientRect().right).toBeLessThanOrEqual(
      frame.getBoundingClientRect().right,
    )
  },
}
