import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, spyOn, waitFor } from 'storybook/test'
import { CopyButton } from './copy-button'

const meta = {
  title: 'Primitives/CopyButton',
  component: CopyButton,
  args: {
    text: 'git checkout ui/ds0-package',
    label: 'Copy command',
  },
  // The clipboard is the browser's; the story only needs to know what was
  // written, so it never depends on the test browser granting access.
  beforeEach: () => {
    spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
  },
} satisfies Meta<typeof CopyButton>

export default meta

type Story = StoryObj<typeof meta>

/** The icon button: it copies, says so, and goes back to its own name. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Copy command' }))
    await expect(navigator.clipboard.writeText).toHaveBeenCalledWith(args.text)
    await expect(canvas.getByRole('button', { name: 'Copied' })).toBeVisible()
    await waitFor(
      () =>
        expect(
          canvas.getByRole('button', { name: 'Copy command' }),
        ).toBeVisible(),
      { timeout: 3_000 },
    )
  },
}

/** The labelled button, for places with room for words. */
export const WithLabel: Story = {
  args: { variant: 'button' },
  play: async ({ args, canvas, userEvent }) => {
    const button = canvas.getByRole('button', { name: 'Copy command' })
    await expect(button).toHaveTextContent('Copy command')
    await userEvent.click(button)
    await expect(navigator.clipboard.writeText).toHaveBeenCalledWith(args.text)
    await expect(
      canvas.getByRole('button', { name: 'Copied' }),
    ).toHaveTextContent('Copied')
  },
}

/** Failed: when the clipboard refuses, it keeps its own name. */
export const Failed: Story = {
  beforeEach: () => {
    spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
      new DOMException('Write permission denied.', 'NotAllowedError'),
    )
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Copy command' }))
    await expect(navigator.clipboard.writeText).toHaveBeenCalled()
    await expect(canvas.queryByRole('button', { name: 'Copied' })).toBeNull()
    await expect(
      canvas.getByRole('button', { name: 'Copy command' }),
    ).toBeVisible()
  },
}

export const Dark: Story = {
  ...WithLabel,
  globals: { theme: 'dark' },
}
