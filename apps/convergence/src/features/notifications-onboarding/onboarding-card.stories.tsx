import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { NotificationsOnboardingCard } from './onboarding-card.presentational'

const meta = {
  title: 'Features/NotificationsOnboarding/OnboardingCard',
  component: NotificationsOnboardingCard,
  args: {
    onOpenSettings: fn(),
    onDismiss: fn(),
  },
} satisfies Meta<typeof NotificationsOnboardingCard>

export default meta

type Story = StoryObj<typeof meta>

/** The card names itself, points at Settings, and can be put away for good. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const card = canvas.getByRole('region', {
      name: 'Notifications onboarding',
    })
    await expect(card).toHaveTextContent('Settings → Notifications')
    await userEvent.click(canvas.getByRole('button', { name: 'Open Settings' }))
    await expect(args.onOpenSettings).toHaveBeenCalledOnce()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Don’t show again' }),
    )
    await expect(args.onDismiss).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
