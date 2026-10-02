import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import type {
  LocalModelTunnelProfileWithStatus,
  LocalModelTunnelState,
} from '@/entities/local-model-tunnel'
import { TunnelProfileList } from './tunnel-profile-list.presentational'

/** A tunnel profile in the given state, forwarding to a GPU box. */
const profile = (
  id: string,
  name: string,
  state: LocalModelTunnelState,
): LocalModelTunnelProfileWithStatus => ({
  profile: {
    id,
    name,
    connectionKind: 'ssh-tunnel',
    sshTarget: `marcin@${id}.example.com`,
    allowExternal: false,
    autoStart: false,
    useCustomLocalBindHost: false,
    localBindHost: '127.0.0.1',
    localPort: 11435,
    remoteHost: '127.0.0.1',
    remotePort: 11434,
    healthCheckEnabled: false,
    healthCheckUrl: '',
    routeCandidates: [],
    createdAt: '2026-09-20T10:00:00.000Z',
    updatedAt: '2026-09-30T10:00:00.000Z',
  },
  status: {
    profileId: id,
    state,
    managed: true,
    pid: null,
    error: null,
    lastCheckedAt: '2026-10-01T12:00:00.000Z',
    health: {
      state: 'unknown',
      probeKind: null,
      checkedAt: null,
      latencyMs: null,
      statusCode: null,
      modelCount: null,
      modelNames: null,
      isOllama: null,
      failureKind: null,
      error: null,
    },
    activeRouteId: null,
    activeRouteLabel: null,
    diagnostics: [],
    commandPreview: `ssh -N -L 127.0.0.1:11435:127.0.0.1:11434 marcin@${id}.example.com`,
  },
})

const meta = {
  title: 'Features/LocalModelTunnel/TunnelProfileList',
  component: TunnelProfileList,
  args: {
    profiles: [
      profile('gpu-box', 'GPU box', 'running'),
      profile('studio', 'Studio Mac', 'stopped'),
      profile('lab', 'Lab server', 'failed'),
    ],
    selectedProfileId: 'gpu-box',
    onSelect: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TunnelProfileList>

export default meta

type Story = StoryObj<typeof meta>

/** Each profile a row with its state's dot; the chosen one is selected (R7). */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole('navigation', { name: 'Tunnel profiles' }),
    ).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: /^GPU box/ }),
    ).toHaveAttribute('aria-current', 'true')
    await userEvent.click(canvas.getByRole('button', { name: /^Studio Mac/ }))
    await expect(args.onSelect).toHaveBeenCalledWith('studio')
  },
}

/** Empty: no profiles yet, so the list is bare. */
export const Empty: Story = {
  args: { profiles: [], selectedProfileId: null },
  play: async ({ canvas }) => {
    await expect(canvas.queryAllByRole('button')).toHaveLength(0)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
