import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor } from 'storybook/test'
import type {
  LocalModelTunnelProfile,
  LocalModelTunnelProfileInput,
  LocalModelTunnelProfileWithStatus,
  LocalModelTunnelRuntimeStatus,
} from '@/entities/local-model-tunnel'
import { TunnelProfileEditor } from './tunnel-profile-editor.presentational'

const profile: LocalModelTunnelProfile = {
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
}

const status: LocalModelTunnelRuntimeStatus = {
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
}

const item: LocalModelTunnelProfileWithStatus = { profile, status }

/** The editable fields of a profile, as the container seeds its draft. */
const draftOf = ({
  name,
  connectionKind,
  sshTarget,
  allowExternal,
  autoStart,
  useCustomLocalBindHost,
  localBindHost,
  localPort,
  remoteHost,
  remotePort,
  healthCheckEnabled,
  healthCheckUrl,
  routeCandidates,
}: LocalModelTunnelProfile): LocalModelTunnelProfileInput => ({
  name,
  connectionKind,
  sshTarget,
  allowExternal,
  autoStart,
  useCustomLocalBindHost,
  localBindHost,
  localPort,
  remoteHost,
  remotePort,
  healthCheckEnabled,
  healthCheckUrl,
  routeCandidates,
})

const meta = {
  title: 'Features/LocalModelTunnel/TunnelProfileEditor',
  component: TunnelProfileEditor,
  args: {
    item,
    draft: draftOf(profile),
    error: null,
    isMutating: false,
    onDraftChange: fn(),
    onStart: fn(),
    onStop: fn(),
    onRestart: fn(),
    onSave: fn(),
    onDelete: fn(),
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TunnelProfileEditor>

export default meta

type Story = StoryObj<typeof meta>

/**
 * An SSH tunnel: its name and runtime, the forwarding, the health check and
 * the command it runs; Save profile and Delete end it.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText('Display name'), '!')
    await expect(args.onDraftChange).toHaveBeenLastCalledWith({
      ...args.draft,
      name: 'GPU box!',
    })
    await userEvent.click(
      canvas.getByRole('switch', { name: 'Start when Convergence opens' }),
    )
    await expect(args.onDraftChange).toHaveBeenLastCalledWith({
      ...args.draft,
      autoStart: false,
    })
    await expect(canvas.getByLabelText('Local bind IP')).toBeDisabled()
    // The command is a CodeBlock (DS-10): a figure named by what it is.
    await expect(
      canvas.getByRole('figure', { name: 'Command preview' }),
    ).toHaveTextContent(
      'ssh -N -L 127.0.0.1:11435:127.0.0.1:11434 marcin@gpu.example.com',
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Save profile' }))
    await expect(args.onSave).toHaveBeenCalledOnce()
    await userEvent.click(canvas.getByRole('button', { name: 'Delete…' }))
    await expect(args.onDelete).toHaveBeenCalledOnce()
  },
}

/** The runtime is a select; choosing This Mac turns the SSH options off. */
export const ChooseRuntime: Story = {
  name: 'Choose runtime',
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('combobox'))
    await userEvent.click(
      await screen.findByRole('option', { name: 'This Mac' }),
    )
    await expect(args.onDraftChange).toHaveBeenLastCalledWith({
      ...args.draft,
      connectionKind: 'local-runtime',
      autoStart: false,
      allowExternal: false,
    })
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  },
}

/** Several routes, tried in order; each can be edited or removed. */
export const Routes: Story = {
  args: {
    draft: draftOf({
      ...profile,
      routeCandidates: [
        {
          id: 'route-1',
          label: 'Office LAN',
          sshTarget: 'marcin@10.0.0.12',
          useCustomLocalBindHost: false,
          localBindHost: '127.0.0.1',
          localPort: 11435,
          remoteHost: '127.0.0.1',
          remotePort: 11434,
          healthCheckUrl: 'http://127.0.0.1:11435/api/tags',
          connectTimeoutSeconds: 3,
        },
        {
          id: 'route-2',
          label: 'Tailscale',
          sshTarget: 'marcin@gpu.tail1234.ts.net',
          useCustomLocalBindHost: false,
          localBindHost: '127.0.0.1',
          localPort: 11435,
          remoteHost: '127.0.0.1',
          remotePort: 11434,
          healthCheckUrl: 'http://127.0.0.1:11435/api/tags',
          connectTimeoutSeconds: null,
        },
      ],
    }),
  },
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByText(
        'marcin@10.0.0.12: 127.0.0.1:11435 -> 127.0.0.1:11434 · 3s connect timeout',
      ),
    ).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Remove route Office LAN' }),
    )
    await expect(args.onDraftChange).toHaveBeenLastCalledWith({
      ...args.draft,
      routeCandidates: args.draft.routeCandidates?.slice(1),
    })
    await userEvent.click(canvas.getByRole('button', { name: 'Add route' }))
    await expect(args.onDraftChange).toHaveBeenCalledTimes(2)
  },
}

/** Ollama on this Mac: no SSH target, no forwarding, no command. */
export const LocalRuntime: Story = {
  name: 'Local runtime',
  args: {
    item: {
      profile: { ...profile, name: 'Ollama', connectionKind: 'local-runtime' },
      status: { ...status, managed: false },
    },
    draft: draftOf({
      ...profile,
      name: 'Ollama',
      connectionKind: 'local-runtime',
      localPort: 11434,
      healthCheckUrl: 'http://127.0.0.1:11434/api/tags',
    }),
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByLabelText('SSH target')).toBeNull()
    await expect(canvas.queryByText('Command preview')).toBeNull()
    await expect(canvas.getByRole('button', { name: 'Refresh' })).toBeVisible()
  },
}

/**
 * Failed: the tunnel's error, the save's error, the diagnostics, and a
 * warning that the health URL points at another port.
 */
export const Failed: Story = {
  args: {
    item: {
      profile,
      status: {
        ...status,
        state: 'failed',
        managed: false,
        error: 'ssh exited with code 255: Permission denied (publickey).',
        diagnostics: [
          { label: 'Exit code', value: '255' },
          {
            label: 'stderr',
            value: 'marcin@gpu.example.com: Permission denied (publickey).',
          },
        ],
      },
    },
    draft: draftOf({
      ...profile,
      healthCheckUrl: 'http://127.0.0.1:11434/api/tags',
    }),
    error: 'Could not save the profile: the local port 11435 is in use.',
  },
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByText('Health URL port does not match local tunnel port.'),
    ).toBeVisible()
    await expect(
      canvas.getByText(/Permission denied/, { selector: 'p' }),
    ).toBeVisible()
    await expect(
      canvas.getByText(/the local port 11435 is in use/),
    ).toBeVisible()
    // The diagnostics are terms and values (DS-10).
    await expect(canvas.getByText('Exit code').tagName).toBe('DT')
    await expect(canvas.getByText('255').closest('dd')).not.toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Retry' }))
    await expect(args.onStart).toHaveBeenCalledOnce()
  },
}

/** Busy: while a change is in flight, Save says so and Delete waits. */
export const Busy: Story = {
  args: { isMutating: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Saving…' }),
    ).toHaveAttribute('aria-busy', 'true')
    await expect(canvas.getByRole('button', { name: 'Delete…' })).toBeDisabled()
    await expect(canvas.getByRole('button', { name: 'Restart' })).toBeDisabled()
  },
}

/**
 * Someone else's tunnel holds the port: it is managed where it runs, so the
 * editor offers no action for it (no Manage that went nowhere; DLG note).
 */
export const External: Story = {
  args: {
    item: {
      profile: { ...profile, allowExternal: true },
      status: { ...status, state: 'external', managed: false, pid: null },
    },
    draft: draftOf({ ...profile, allowExternal: true }),
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button', { name: 'Manage' })).toBeNull()
    await expect(
      canvas.getByRole('button', { name: 'Save profile' }),
    ).toBeVisible()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
