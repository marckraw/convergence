import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor } from 'storybook/test'
import { ChatGptLinkMenu } from './chatgpt-link-menu.presentational'

const meta = {
  title: 'Features/AppSettings/ChatGptLinkMenu',
  component: ChatGptLinkMenu,
  args: {
    label: 'Sign in on ChatGPT',
    onChoose: fn(),
  },
} satisfies Meta<typeof ChatGptLinkMenu>

export default meta

type Story = StoryObj<typeof meta>

/** The button asks where the link goes: the browser, or the clipboard. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Sign in on ChatGPT' })
    await userEvent.click(trigger)
    await screen.findByRole('menu')
    await expect(screen.getAllByRole('menuitem')).toHaveLength(2)
    await userEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }))
    await expect(args.onChoose).toHaveBeenCalledWith('copy')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    await expect(trigger).toHaveFocus()
  },
}

/** The keyboard opens it and chooses the browser. */
export const Keyboard: Story = {
  play: async ({ args, canvas, userEvent }) => {
    canvas.getByRole('button', { name: 'Sign in on ChatGPT' }).focus()
    await userEvent.keyboard('{Enter}')
    await screen.findByRole('menu')
    await waitFor(() =>
      expect(
        screen.getByRole('menuitem', { name: 'Open in default browser' }),
      ).toHaveFocus(),
    )
    await userEvent.keyboard('{Enter}')
    await expect(args.onChoose).toHaveBeenCalledWith('open')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
