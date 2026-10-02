import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { SurfaceSwitcher } from './surface-switcher.presentational'

const meta = {
  title: 'Widgets/Sidebar/Surface switcher',
  component: SurfaceSwitcher,
  args: {
    activeSurface: 'code',
    missionControlActive: false,
    placement: 'row',
    onSelectSurface: fn(),
    onShowMissionControl: fn(),
  },
  decorators: [
    (Story) => (
      <div className="bg-canvas p-3 text-ink">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SurfaceSwitcher>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The shell's three places in the sidebar's header: the one on screen is the
 * raised chip and says aria-current="page" (R7); the others take a click.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole('navigation', { name: 'Surfaces' }),
    ).toBeVisible()
    const code = canvas.getByRole('button', { name: 'Show code surface' })
    const chat = canvas.getByRole('button', { name: 'Show chat surface' })
    await expect(code).toHaveAttribute('aria-current', 'page')
    await expect(chat).not.toHaveAttribute('aria-current')
    await expect(getComputedStyle(code).boxShadow).not.toBe('none')
    await expect(getComputedStyle(chat).boxShadow).toBe('none')

    await userEvent.click(chat)
    await expect(args.onSelectSurface).toHaveBeenCalledWith('chat')
    await userEvent.click(
      canvas.getByRole('button', { name: 'Show Mission Control' }),
    )
    await expect(args.onShowMissionControl).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/**
 * Mission Control on screen: it is the one current place, never beside a
 * Code or Chat that still looks chosen (NAV-3).
 */
export const MissionControl: Story = {
  name: 'Mission Control',
  args: { missionControlActive: true },
  play: async ({ canvas }) => {
    const current = canvas
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-current') === 'page')
    await expect(current).toHaveLength(1)
    await expect(current[0]).toHaveAccessibleName('Show Mission Control')
  },
}

/** The collapsed rail: the same places, stacked, tooltips to the right. */
export const Rail: Story = {
  args: { placement: 'rail', activeSurface: 'chat' },
  play: async ({ canvas }) => {
    const [code, chat, missionControl] = canvas.getAllByRole('button')
    await expect(chat).toHaveAttribute('aria-current', 'page')
    await expect(code.getBoundingClientRect().top).toBeLessThan(
      chat.getBoundingClientRect().top,
    )
    await expect(chat.getBoundingClientRect().top).toBeLessThan(
      missionControl.getBoundingClientRect().top,
    )
    await expect(chat).toHaveAttribute('data-tooltip-side', 'right')
  },
}

/** A window with no Mission Control: two places. */
export const WithoutMissionControl: Story = {
  name: 'Without Mission Control',
  args: { onShowMissionControl: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('button')).toHaveLength(2)
  },
}
