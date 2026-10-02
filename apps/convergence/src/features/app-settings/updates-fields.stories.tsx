import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { UpdatesFields } from './updates-fields.presentational'

const meta = {
  title: 'Features/AppSettings/UpdatesFields',
  component: UpdatesFields,
  args: {
    status: {
      phase: 'not-available',
      currentVersion: '0.98.0',
      lastChecked: '2026-10-01T09:45:00.000Z',
    },
    currentVersion: '0.98.0',
    prefs: { backgroundCheckEnabled: true },
    isDev: false,
    isSaving: false,
    now: new Date('2026-10-01T12:00:00.000Z'),
    onToggleBackground: fn(),
    onCheckNow: fn(),
    onDownload: fn(),
    onInstall: fn(),
    onOpenReleaseNotes: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-140">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof UpdatesFields>

export default meta

type Story = StoryObj<typeof meta>

/** Up to date: the version, the background check, and Check now. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByText('Up to date (last check 2 hours ago).'),
    ).toBeVisible()
    await userEvent.click(
      canvas.getByRole('switch', { name: 'Check for updates automatically' }),
    )
    await expect(args.onToggleBackground).toHaveBeenCalledWith(false)
    await userEvent.click(canvas.getByRole('button', { name: 'Check now' }))
    await expect(args.onCheckNow).toHaveBeenCalledOnce()
    await expect(
      canvas.queryByRole('button', { name: 'Release notes…' }),
    ).toBeNull()
  },
}

/** An update is out: Download it, or read its notes first. */
export const Available: Story = {
  args: {
    status: {
      phase: 'available',
      version: '0.99.0',
      releaseNotesUrl: 'https://github.com/marckraw/convergence/releases',
      detectedAt: '2026-10-01T11:58:00.000Z',
    },
  },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Download v0.99.0' }),
    )
    await expect(args.onDownload).toHaveBeenCalledOnce()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Release notes…' }),
    )
    await expect(args.onOpenReleaseNotes).toHaveBeenCalledOnce()
  },
}

/** Busy, downloading: Check now waits and the percent shows. */
export const Busy: Story = {
  args: {
    status: {
      phase: 'downloading',
      version: '0.99.0',
      percent: 42.4,
      bytesPerSecond: 3_200_000,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Downloading v0.99.0… 42%')).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: 'Check now' }),
    ).toBeDisabled()
  },
}

/** Downloaded: Install restarts into the new version. */
export const Downloaded: Story = {
  args: {
    status: {
      phase: 'downloaded',
      version: '0.99.0',
      releaseNotesUrl: 'https://github.com/marckraw/convergence/releases',
    },
  },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Install v0.99.0' }),
    )
    await expect(args.onInstall).toHaveBeenCalledOnce()
  },
}

/** Failed: the check's error, and Check now to try again. */
export const Failed: Story = {
  args: {
    status: {
      phase: 'error',
      message: 'getaddrinfo ENOTFOUND api.github.com',
      lastChecked: null,
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(
        "Couldn't check for updates: getaddrinfo ENOTFOUND api.github.com",
      ),
    ).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: 'Check now' }),
    ).toBeEnabled()
  },
}

/** Disabled: a development build never updates itself. */
export const Disabled: Story = {
  args: { isDev: true, currentVersion: null },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('Auto-updates are disabled in development builds.'),
    ).toBeVisible()
    await expect(canvas.getByText('unknown')).toBeVisible()
    await expect(
      canvas.getByRole('switch', { name: 'Check for updates automatically' }),
    ).toBeDisabled()
  },
}

export const Dark: Story = {
  ...Available,
  name: 'Dark',
  globals: { theme: 'dark' },
}
