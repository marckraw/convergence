import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { UrlRequestForm } from './url-request-form.presentational'

const meta = {
  title: 'Widgets/SessionView/UrlRequestForm',
  component: UrlRequestForm,
  args: { onSubmit: fn() },
} satisfies Meta<typeof UrlRequestForm>

export default meta

type Story = StoryObj<typeof meta>

/** Accept the URL the server wants opened. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Accept' }))
    await expect(args.onSubmit).toHaveBeenCalledWith(
      { kind: 'url', action: 'accept' },
      'Accepted URL request',
    )
  },
}

/** Decline it. */
export const Declined: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Decline' }))
    await expect(args.onSubmit).toHaveBeenCalledWith(
      { kind: 'url', action: 'decline' },
      'Declined URL request',
    )
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
