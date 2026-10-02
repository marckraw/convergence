import type { Meta, StoryObj } from '@storybook/react-vite'
import type { Space } from '@/entities/space'
import { expect, fn } from 'storybook/test'
import {
  SpaceContextPanel,
  type SpaceContextAttemptView,
} from './space-context-panel.presentational'

const space: Space = {
  id: 'space-ds',
  title: 'Design system sweep',
  status: 'implementing',
  attention: 'none',
  brief:
    'Move every screen onto @convergence/ui parts and tokens.\nStories first, so each part proves it renders in both themes before and after.',
  memory: '',
  createdAt: '2026-09-28T09:00:00.000Z',
  updatedAt: '2026-10-01T14:00:00.000Z',
}

const attempts: SpaceContextAttemptView[] = [
  {
    attempt: {
      id: 'attempt-1',
      spaceId: 'space-ds',
      sessionId: 'session-ds0',
      role: 'implementation',
      isPrimary: true,
      createdAt: '2026-09-28T09:10:00.000Z',
    },
    sessionName: 'DS0 · the package',
    projectName: 'convergence',
    branchName: 'ui/ds0-package',
    providerId: 'claude-code',
  },
  {
    attempt: {
      id: 'attempt-2',
      spaceId: 'space-ds',
      sessionId: 'session-review',
      role: 'review',
      isPrimary: false,
      createdAt: '2026-09-29T11:00:00.000Z',
    },
    sessionName: 'Independent review',
    projectName: 'convergence',
    branchName: null,
    providerId: 'codex',
  },
]

const meta = {
  title: 'Widgets/SessionView/SpaceContextPanel',
  component: SpaceContextPanel,
  args: {
    space,
    attempts,
    artifacts: [
      {
        id: 'artifact-915',
        spaceId: 'space-ds',
        kind: 'pull-request',
        label: '#915 The design system is its own package',
        value: 'https://github.com/marckraw/convergence/pull/915',
        sourceSessionId: 'session-ds0',
        status: 'in-progress',
        createdAt: '2026-09-30T09:00:00.000Z',
        updatedAt: '2026-10-01T14:00:00.000Z',
      },
    ],
    onOpenSpace: fn(),
  },
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="flex h-192 justify-end bg-canvas">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SpaceContextPanel>

export default meta

type Story = StoryObj<typeof meta>

/** The Space this session belongs to: its brief, attempts and artifacts. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText('Design system sweep')).toBeVisible()
    await expect(canvas.getByText('Primary')).toBeVisible()
    await expect(
      canvas.getByText('#915 The design system is its own package'),
    ).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Open Space Design system sweep' }),
    )
    await expect(args.onOpenSpace).toHaveBeenCalledWith('space-ds')
  },
}

/** A new Space: no brief and nothing produced yet. */
export const Empty: Story = {
  args: { space: { ...space, brief: '  ' }, artifacts: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No Space brief yet.')).toBeVisible()
    await expect(canvas.getByText('No Artifacts yet')).toBeVisible()
  },
}

/** A long brief and many attempts: the panel scrolls. */
export const Long: Story = {
  args: {
    space: {
      ...space,
      title:
        'Design system sweep across the conversation, Mission Control and every settings dialog',
      brief: Array.from(
        { length: 10 },
        (_, index) =>
          `${index + 1}. Move slice ${index + 1} onto the shared parts and tokens, then run its stories in light, dark and reduced motion.`,
      ).join('\n'),
    },
    attempts: Array.from({ length: 6 }, (_, index) => ({
      ...attempts[index % 2],
      attempt: { ...attempts[index % 2].attempt, id: `attempt-${index}` },
      sessionName: `Attempt ${index + 1}: stories for slice ${index + 1}`,
    })),
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
