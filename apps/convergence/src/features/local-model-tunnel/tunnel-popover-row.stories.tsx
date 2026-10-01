import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import type {
  LocalModelTunnelProfile,
  LocalModelTunnelProfileWithStatus,
  LocalModelTunnelRuntimeStatus,
} from '@/entities/local-model-tunnel'
import { TunnelPopoverRow } from './tunnel-popover-row.presentational'

/** An SSH tunnel to a GPU box running Ollama, in the given state. */
const tunnel = (
  status: Partial<LocalModelTunnelRuntimeStatus> = {},
  profile: Partial<LocalModelTunnelProfile> = {},
): LocalModelTunnelProfileWithStatus => ({
  profile: {
    id: 'gpu-box',
    name: 'GPU box',
    connectionKind: 'ssh-tunnel',
    sshTarget: 'marcin@gpu.example.com',
    allowExternal: false,
    autoStart: true,
    useCustomLocalBindHost: false,
    localBindHost: '127.0.0.1',
    localPort: 11435,
    remoteHost: '127.0.0.1',
    remotePort: 11434,
    healthCheckEnabled: true,
    healthCheckUrl: 'http://127.0.0.1:11435/api/tags',
    routeCandidates: [],
    createdAt: '2026-09-20T10:00:00.000Z',
    updatedAt: '2026-09-30T10:00:00.000Z',
    ...profile,
  },
  status: {
    profileId: 'gpu-box',
    state: 'running',
    managed: true,
    pid: 48213,
    error: null,
    lastCheckedAt: '2026-10-01T12:00:00.000Z',
    health: {
      state: 'healthy',
      probeKind: 'http',
      checkedAt: '2026-10-01T12:00:00.000Z',
      latencyMs: 42,
      statusCode: 200,
      modelCount: 6,
      modelNames: ['qwen3-coder:30b'],
      isOllama: true,
      failureKind: null,
      error: null,
    },
    activeRouteId: null,
    activeRouteLabel: null,
    diagnostics: [],
    commandPreview:
      'ssh -N -L 127.0.0.1:11435:127.0.0.1:11434 marcin@gpu.example.com',
    ...status,
  },
})

const meta = {
  title: 'Features/LocalModelTunnel/TunnelPopoverRow',
  component: TunnelPopoverRow,
  args: {
    item: tunnel(),
    isMutating: false,
    onStart: fn(),
    onStop: fn(),
    onRestart: fn(),
    onManage: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-[360px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TunnelPopoverRow>

export default meta

type Story = StoryObj<typeof meta>

/** Running, and Convergence owns it: Restart and Stop. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText('GPU box')).toBeVisible()
    await expect(
      canvas.getByText(
        '127.0.0.1:11435 -> marcin@gpu.example.com:127.0.0.1:11434',
      ),
    ).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Restart' }))
    await expect(args.onRestart).toHaveBeenCalledOnce()
    await userEvent.click(canvas.getByRole('button', { name: 'Stop' }))
    await expect(args.onStop).toHaveBeenCalledOnce()
  },
}

/** Stopped: Start. */
export const Stopped: Story = {
  args: {
    item: tunnel({
      state: 'stopped',
      managed: false,
      pid: null,
      health: { ...tunnel().status.health, state: 'unknown', modelCount: null },
    }),
  },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Start' }))
    await expect(args.onStart).toHaveBeenCalledOnce()
  },
}

/** Busy, starting: Cancel stops it before it connects. */
export const Busy: Story = {
  args: { item: tunnel({ state: 'starting' }) },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }))
    await expect(args.onStop).toHaveBeenCalledOnce()
  },
}

/** Failed: the error under the endpoint, and Retry. */
export const Failed: Story = {
  args: {
    item: tunnel({
      state: 'failed',
      managed: false,
      error:
        'ssh: connect to host gpu.example.com port 22: Operation timed out',
    }),
  },
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText(/Operation timed out/)).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Retry' }))
    await expect(args.onStart).toHaveBeenCalledOnce()
  },
}

/** Someone else's tunnel owns the port: Manage opens the profile. */
export const External: Story = {
  args: {
    item: tunnel(
      { state: 'external', managed: false },
      { allowExternal: true },
    ),
  },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Manage' }))
    await expect(args.onManage).toHaveBeenCalledOnce()
  },
}

/** Ollama on this Mac: no tunnel to start, only Refresh. */
export const LocalRuntime: Story = {
  name: 'Local runtime',
  args: {
    item: tunnel(
      { managed: false },
      { name: 'Ollama', connectionKind: 'local-runtime', localPort: 11434 },
    ),
  },
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText('127.0.0.1:11434 on this Mac')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Refresh' }))
    await expect(args.onStart).toHaveBeenCalledOnce()
  },
}

/** Disabled: while another change is in flight, the actions wait. */
export const Disabled: Story = {
  args: { isMutating: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Restart' })).toBeDisabled()
    await expect(canvas.getByRole('button', { name: 'Stop' })).toBeDisabled()
  },
}

export const Dark: Story = {
  ...Failed,
  name: 'Dark',
  globals: { theme: 'dark' },
}
