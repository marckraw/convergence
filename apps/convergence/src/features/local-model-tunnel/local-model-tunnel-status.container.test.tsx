import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { UiProvider } from '@convergence/ui'
import {
  useLocalModelTunnelStore,
  type LocalModelTunnelProfile,
  type LocalModelTunnelProfileWithStatus,
  type LocalModelTunnelSnapshot,
} from '@/entities/local-model-tunnel'
import { LocalModelTunnelStatusContainer } from './local-model-tunnel-status.container'

function tunnel(id: string, name: string): LocalModelTunnelProfileWithStatus {
  const profile: LocalModelTunnelProfile = {
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
  }
  return {
    profile,
    status: {
      profileId: id,
      state: 'stopped',
      managed: true,
      pid: null,
      error: null,
      lastCheckedAt: null,
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
      commandPreview: `ssh -N marcin@${id}.example.com`,
    },
  }
}

const snapshot: LocalModelTunnelSnapshot = {
  profiles: [tunnel('gpu-box', 'GPU box'), tunnel('lab-box', 'Lab box')],
  updatedAt: '2026-10-01T12:00:00.000Z',
}

const api = {
  getSnapshot: vi.fn(async () => snapshot),
  createProfile: vi.fn(async () => snapshot),
  onChanged: vi.fn(() => () => undefined),
}

async function openTunnels() {
  render(
    <UiProvider>
      <LocalModelTunnelStatusContainer />
    </UiProvider>,
  )
  fireEvent.click(await screen.findByTestId('local-model-tunnel-pill'))
  fireEvent.click(await screen.findByRole('button', { name: 'Edit…' }))
  const dialog = await screen.findByRole('dialog', {
    name: 'Local model tunnels',
  })
  const name = await within(dialog).findByLabelText('Display name')
  return { dialog, name }
}

describe('Local model tunnels: unsaved edits to a profile (DLG-10)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      localModelTunnel: api,
    }
    useLocalModelTunnelStore.setState({
      snapshot: null,
      isLoading: false,
      isMutatingProfileId: null,
      error: null,
    })
  })

  afterEach(cleanup)

  it('asks before another profile in the rail drops them, and keeps them on "Keep editing" — mutation: the check only on Done turns red', async () => {
    const { dialog, name } = await openTunnels()
    expect(name).toHaveValue('GPU box')
    fireEvent.change(name, { target: { value: 'GPU box, renamed' } })

    fireEvent.click(within(dialog).getByRole('button', { name: /^Lab box/ }))

    const question = await screen.findByRole('alertdialog', {
      name: 'Discard your changes to “GPU box”?',
    })
    fireEvent.click(
      within(question).getByRole('button', { name: 'Keep editing' }),
    )
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    )
    expect(within(dialog).getByLabelText('Display name')).toHaveValue(
      'GPU box, renamed',
    )

    fireEvent.click(within(dialog).getByRole('button', { name: /^Lab box/ }))
    fireEvent.click(
      within(
        await screen.findByRole('alertdialog', {
          name: 'Discard your changes to “GPU box”?',
        }),
      ).getByRole('button', { name: 'Discard' }),
    )
    await waitFor(() =>
      expect(within(dialog).getByLabelText('Display name')).toHaveValue(
        'Lab box',
      ),
    )
  })

  it('asks before a new profile drops them, and makes none until answered', async () => {
    const { dialog, name } = await openTunnels()
    fireEvent.change(name, { target: { value: 'GPU box, renamed' } })

    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Add local model tunnel profile',
      }),
    )

    const question = await screen.findByRole('alertdialog', {
      name: 'Discard your changes to “GPU box”?',
    })
    expect(api.createProfile).not.toHaveBeenCalled()
    fireEvent.click(
      within(question).getByRole('button', { name: 'Keep editing' }),
    )
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    )
    expect(api.createProfile).not.toHaveBeenCalled()
  })

  it('switches without a question when nothing is unsaved', async () => {
    const { dialog } = await openTunnels()

    fireEvent.click(within(dialog).getByRole('button', { name: /^Lab box/ }))

    await waitFor(() =>
      expect(within(dialog).getByLabelText('Display name')).toHaveValue(
        'Lab box',
      ),
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
