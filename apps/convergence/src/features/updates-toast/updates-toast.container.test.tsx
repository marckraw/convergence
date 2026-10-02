import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { notify } from '@convergence/ui'
import {
  DEFAULT_UPDATE_PREFS,
  INITIAL_UPDATE_STATUS,
  useUpdatesStore,
  type UpdateStatus,
} from '@/entities/updates'
import { UpdatesToastContainer } from './updates-toast.container'

vi.mock('@convergence/ui', () => ({
  notify: {
    info: vi.fn(),
    loading: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
    failure: vi.fn(),
    dismiss: vi.fn(),
  },
}))

const notifyMock = vi.mocked(notify)

const download = vi.fn<() => Promise<void>>()
const install = vi.fn<() => Promise<void>>()
const openReleaseNotes = vi.fn<() => Promise<void>>()

function resetStore(status: UpdateStatus = INITIAL_UPDATE_STATUS) {
  useUpdatesStore.setState({
    status,
    currentVersion: '0.16.0',
    isDev: false,
    prefs: DEFAULT_UPDATE_PREFS,
    isLoaded: true,
    lastTrigger: null,
    error: null,
    unsubscribe: null,
    download,
    install,
    openReleaseNotes,
  })
}

describe('UpdatesToastContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    download.mockReset()
    install.mockReset()
    openReleaseNotes.mockReset()
    resetStore()
  })

  it('renders Download toast when phase becomes available', () => {
    const { rerender } = render(<UpdatesToastContainer />)
    useUpdatesStore.setState({
      status: {
        phase: 'available',
        version: '0.17.0',
        releaseNotesUrl: 'https://example.test/v0.17.0',
        detectedAt: '2026-04-22T17:00:00.000Z',
      },
    })
    rerender(<UpdatesToastContainer />)
    expect(notifyMock.info).toHaveBeenCalledWith(
      'Update available — Convergence v0.17.0',
      expect.objectContaining({
        id: 'updates:available',
        action: expect.objectContaining({ label: 'Download' }),
        secondaryAction: expect.objectContaining({ label: 'Release notes' }),
        persistent: true,
      }),
    )
    const options = notifyMock.info.mock.calls.at(-1)?.[1]
    options?.action?.onClick()
    expect(download).toHaveBeenCalledTimes(1)
    // NAV-31: the second button is an action of its own, named as the dialog.
    options?.secondaryAction?.onClick()
    expect(openReleaseNotes).toHaveBeenCalledTimes(1)
  })

  it('renders a persistent loading toast while downloading and updates description', () => {
    const { rerender } = render(<UpdatesToastContainer />)
    useUpdatesStore.setState({
      status: {
        phase: 'downloading',
        version: '0.17.0',
        percent: 10,
        bytesPerSecond: 1024,
      },
    })
    rerender(<UpdatesToastContainer />)
    expect(notifyMock.loading).toHaveBeenCalledWith(
      'Downloading v0.17.0…',
      expect.objectContaining({
        id: 'updates:downloading',
        description: '10% · 1.0 KB/s',
      }),
    )

    useUpdatesStore.setState({
      status: {
        phase: 'downloading',
        version: '0.17.0',
        percent: 55,
        bytesPerSecond: 2 * 1024 * 1024,
      },
    })
    rerender(<UpdatesToastContainer />)
    expect(notifyMock.loading).toHaveBeenLastCalledWith(
      'Downloading v0.17.0…',
      expect.objectContaining({ description: '55% · 2.0 MB/s' }),
    )
  })

  it('replaces with Install toast when phase becomes downloaded', () => {
    const { rerender } = render(<UpdatesToastContainer />)
    useUpdatesStore.setState({
      status: {
        phase: 'downloaded',
        version: '0.17.0',
        releaseNotesUrl: 'https://example.test/v0.17.0',
      },
    })
    rerender(<UpdatesToastContainer />)
    expect(notifyMock.dismiss).toHaveBeenCalledWith('updates:downloading')
    expect(notifyMock.success).toHaveBeenCalledWith(
      'Update v0.17.0 ready',
      expect.objectContaining({
        id: 'updates:ready',
        action: expect.objectContaining({ label: 'Install now' }),
      }),
    )
    const call = notifyMock.success.mock.calls.at(-1)
    call?.[1]?.action?.onClick()
    expect(install).toHaveBeenCalledTimes(1)
  })

  it('error toast fires only after a user-triggered check', () => {
    const { rerender } = render(<UpdatesToastContainer />)
    useUpdatesStore.setState({
      status: {
        phase: 'error',
        message: 'Offline or GitHub unreachable.',
        lastChecked: '2026-04-22T17:00:00.000Z',
      },
      lastTrigger: 'background',
    })
    rerender(<UpdatesToastContainer />)
    expect(notifyMock.failure).not.toHaveBeenCalled()

    // reset tracking state and re-render with user trigger
    resetStore()
    rerender(<UpdatesToastContainer />)
    useUpdatesStore.setState({
      status: {
        phase: 'error',
        message: 'Offline or GitHub unreachable.',
        lastChecked: '2026-04-22T17:00:00.000Z',
      },
      lastTrigger: 'user',
    })
    rerender(<UpdatesToastContainer />)
    expect(notifyMock.failure).toHaveBeenCalledWith(
      'check for updates',
      'Offline or GitHub unreachable.',
    )
  })

  it('not-available toast fires only after a user-triggered check', () => {
    const { rerender } = render(<UpdatesToastContainer />)
    useUpdatesStore.setState({
      status: {
        phase: 'not-available',
        currentVersion: '0.16.0',
        lastChecked: '2026-04-22T17:00:00.000Z',
      },
      lastTrigger: 'background',
    })
    rerender(<UpdatesToastContainer />)
    expect(notifyMock.message).not.toHaveBeenCalled()

    resetStore()
    rerender(<UpdatesToastContainer />)
    useUpdatesStore.setState({
      status: {
        phase: 'not-available',
        currentVersion: '0.16.0',
        lastChecked: '2026-04-22T17:00:00.000Z',
      },
      lastTrigger: 'user',
    })
    rerender(<UpdatesToastContainer />)
    expect(notifyMock.message).toHaveBeenCalledWith(
      'You’re up to date.',
      expect.objectContaining({
        description: 'Convergence v0.16.0 is the latest release.',
      }),
    )
  })
})
