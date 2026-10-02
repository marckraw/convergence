import type { Meta, StoryObj } from '@storybook/react-vite'
import { Library } from 'lucide-react'
import { expect, waitFor } from 'storybook/test'
import { InlinePicker, InlinePickerState } from './inline-picker.presentational'

type PickerProps = {
  state: 'loading' | 'failed' | 'empty'
}

/** An inline picker over the composer's field, showing why it lists nothing. */
function Picker({ state }: PickerProps) {
  return (
    <div className="relative mt-56 w-144 max-w-full rounded-md border border-line bg-surface p-3 text-sm text-ink-muted">
      <InlinePicker
        testId="inline-picker"
        heading={{ icon: <Library />, title: 'Skills', detail: 'Claude Code' }}
        tall
      >
        {state === 'failed' ? (
          <InlinePickerState
            state="failed"
            title="Couldn't load skills"
            detail="The provider didn't answer."
          />
        ) : state === 'loading' ? (
          <InlinePickerState state="loading" title="Loading skills…" />
        ) : (
          <InlinePickerState state="empty" title="No matching skills" />
        )}
      </InlinePicker>
      Message the agent…
    </div>
  )
}

const meta = {
  title: 'Features/Composer/InlinePicker',
  component: Picker,
  args: { state: 'empty' },
} satisfies Meta<typeof Picker>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Nothing matches: the words stand in for the list. Nothing in it takes the
 * keyboard's focus: the field keeps it, and Escape there closes the picker
 * (ruling 5: no stop where the focus lands on nothing). Nothing makes it
 * scroll either.
 */
export const Empty: Story = {
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText('No matching skills')).toBeVisible()
    await userEvent.tab()
    await expect(canvas.getByTestId('inline-picker')).not.toContainElement(
      document.activeElement as HTMLElement,
    )
    const picker = canvas.getByTestId('inline-picker')
    await expect(picker.scrollHeight).toBe(picker.clientHeight)
  },
}

export const Dark: Story = {
  ...Empty,
  globals: { theme: 'dark' },
}

/** On its way: the words arrive after 300 ms, so a quick list never flashes them. */
export const Busy: Story = {
  args: { state: 'loading' },
  play: async ({ canvas }) => {
    const words = await canvas.findByText(
      'Loading skills…',
      {},
      { timeout: 2000 },
    )
    await waitFor(() => expect(words).toBeVisible())
  },
}

/** It couldn't load: an alert, with the reason under it. */
export const Failed: Story = {
  args: { state: 'failed' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      "Couldn't load skills",
    )
  },
}
