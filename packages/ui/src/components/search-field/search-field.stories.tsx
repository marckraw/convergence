import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, waitFor } from 'storybook/test'
import type { ControlSize } from '#lib/control-frame.styles'
import { SearchField } from './search-field'

type FilterProps = {
  defaultValue?: string
  trailing?: string
  disabled?: boolean
  size?: ControlSize
  onValueChange: (value: string) => void
}

/** The sidebar's filter: a controlled field with its clear button. */
function Filter({ defaultValue = '', onValueChange, ...props }: FilterProps) {
  const [value, setValue] = useState(defaultValue)
  const change = (next: string) => {
    setValue(next)
    onValueChange(next)
  }
  return (
    <div className="w-72">
      <SearchField
        aria-label="Filter conversations"
        placeholder="Filter conversations"
        value={value}
        onChange={(event) => change(event.target.value)}
        onClear={() => change('')}
        {...props}
      />
    </div>
  )
}

const meta = {
  title: 'Components/SearchField',
  component: Filter,
  args: { onValueChange: fn() },
} satisfies Meta<typeof Filter>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Typing filters; the one clear button appears once there's something to
 * clear, empties the field and puts the focus back in it. The ring draws
 * around the box while the input has the keyboard's focus.
 */
export const Default: Story = {
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    const field = canvas.getByRole('searchbox', {
      name: 'Filter conversations',
    })
    await expect(
      canvas.queryByRole('button', { name: 'Clear search' }),
    ).toBeNull()
    await userEvent.tab()
    await expect(field).toHaveFocus()
    const box = canvasElement.querySelector('[data-slot="search-field"]')
    if (!box) throw new Error('no search field box')
    await expect(getComputedStyle(box).outlineStyle).toBe('solid')
    await expect(box.getBoundingClientRect().height).toBe(32)
    await userEvent.keyboard('loom')
    await expect(field).toHaveValue('loom')
    await expect(args.onValueChange).toHaveBeenLastCalledWith('loom')
    await userEvent.click(canvas.getByRole('button', { name: 'Clear search' }))
    await expect(field).toHaveValue('')
    await expect(field).toHaveFocus()
    await expect(
      canvas.queryByRole('button', { name: 'Clear search' }),
    ).toBeNull()
  },
}

/** Busy: a word at the end says the work is under way. */
export const Busy: Story = {
  args: { defaultValue: 'loom', trailing: 'Searching…' },
  play: async ({ canvas }) => {
    // It fades in.
    await waitFor(() => expect(canvas.getByText('Searching…')).toBeVisible())
    await expect(
      canvas.getByRole('button', { name: 'Clear search' }),
    ).toBeVisible()
  },
}

/** Long: a query wider than the field scrolls inside it; the clear button keeps its place. */
export const Long: Story = {
  args: {
    defaultValue:
      'conversations about the terminal dock that mention light-dark tokens and ThemeScope',
  },
  play: async ({ canvas }) => {
    const field = canvas.getByRole('searchbox', {
      name: 'Filter conversations',
    })
    await expect(field.scrollWidth).toBeGreaterThan(field.clientWidth)
    const clear = canvas.getByRole('button', { name: 'Clear search' })
    await expect(clear.getBoundingClientRect().left).toBeGreaterThan(
      field.getBoundingClientRect().right - 1,
    )
  },
}

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas, userEvent }) => {
    const field = canvas.getByRole('searchbox', {
      name: 'Filter conversations',
    })
    await expect(field).toBeDisabled()
    await userEvent.tab()
    await expect(field).not.toHaveFocus()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
