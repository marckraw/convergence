import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, within } from 'storybook/test'
import { MetaLine } from '@convergence/ui'
import { metaText } from '@/shared/testing/meta-line'
import { SessionDetails } from './session-details.presentational'
import { SessionHeaderDetailRow } from './session-header-detail-row.presentational'

const meta = {
  title: 'Widgets/SessionView/SessionDetails',
  component: SessionDetails,
  args: {
    parent: null,
    remote: null,
    branchName: 'agent/composer-focus',
    pullRequest: (
      <MetaLine>
        {'#915'}
        {'open'}
      </MetaLine>
    ),
    activity: null,
    elapsed: (
      <SessionHeaderDetailRow label="Agent working time" value="12m 40s" />
    ),
    context: '41% used',
    archived: false,
    harness: null,
    agent: null,
  },
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="w-80 max-w-full rounded-md border border-line bg-raised p-2">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SessionDetails>

export default meta

type Story = StoryObj<typeof meta>

/** A local session: its checkout's branch, its pull request and its readings. */
export const Default: Story = {
  play: async ({ canvas }) => {
    const session = canvas.getByRole('region', { name: 'Session' })
    // Terms and values (CONV-24): a screen reader hears each with its name.
    await expect(within(session).getByText('Checkout branch').tagName).toBe(
      'DT',
    )
    await expect(
      within(session).getByText('agent/composer-focus').tagName,
    ).toBe('DD')
    await expect(
      within(session).getByText(metaText('#915 · open')),
    ).toBeVisible()
    await expect(within(session).getByText('41% used')).toBeVisible()
    await expect(
      canvas.queryByRole('region', { name: 'Harness history' }),
    ).toBeNull()
  },
}

/** A remote session reads the daemon's rows, never the local checkout's. */
export const Remote: Story = {
  args: {
    remote: {
      worksIn: 'acme/app on main',
      remoteRepository: 'git@github.com:acme/app.git',
      branch: 'agent/remote-fix',
      requestedBranch: 'agent/fix',
      unreadable: null,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Remote daemon')).toBeVisible()
    await expect(canvas.getByText('agent/remote-fix')).toBeVisible()
    await expect(canvas.queryByText('Checkout branch')).toBeNull()
  },
}

/** Forked, archived, at work, with its harness history and agent meter. */
export const Long: Story = {
  args: {
    parent: { name: 'Audit the IPC handlers', onOpen: fn() },
    activity: 'Editing session-view.container.tsx',
    archived: true,
    harness: <p className="text-xs">Harness facts appear here.</p>,
    agent: <p className="text-xs">The agent meter appears here.</p>,
  },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Forked from: Audit the IPC handlers',
      }),
    )
    await expect(args.parent?.onOpen).toHaveBeenCalledOnce()
    await expect(canvas.getByText('Archived')).toBeVisible()
    await expect(
      canvas.getByRole('region', { name: 'Harness history' }),
    ).toHaveAttribute('data-details-section', 'harness')
    await expect(canvas.getByRole('region', { name: 'Agent' })).toHaveAttribute(
      'data-details-section',
      'agent',
    )
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
