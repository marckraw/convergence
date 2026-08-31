import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { UpdateStatus } from '@/entities/updates'
import {
  UpdatesFields,
  describeStatus,
  formatRelative,
} from './updates-fields.presentational'

const NOW = new Date('2026-04-22T17:00:00.000Z')

function makeProps(
  overrides: {
    status?: UpdateStatus
    isDev?: boolean
    isSaving?: boolean
    currentVersion?: string | null
    backgroundCheckEnabled?: boolean
  } = {},
) {
  return {
    status: overrides.status ?? {
      phase: 'idle' as const,
      lastChecked: null,
      lastError: null,
    },
    currentVersion:
      overrides.currentVersion === undefined
        ? '0.16.0'
        : overrides.currentVersion,
    prefs: {
      backgroundCheckEnabled: overrides.backgroundCheckEnabled ?? true,
    },
    isDev: overrides.isDev ?? false,
    isSaving: overrides.isSaving ?? false,
    now: NOW,
    onToggleBackground: vi.fn(),
    onCheckNow: vi.fn(),
    onDownload: vi.fn(),
    onInstall: vi.fn(),
    onOpenReleaseNotes: vi.fn(),
  }
}

describe('UpdatesFields', () => {
  it('renders the current version', () => {
    const props = makeProps()
    render(<UpdatesFields {...props} />)
    expect(screen.getByText('0.16.0')).toBeInTheDocument()
  })

  it('Check now button triggers onCheckNow', () => {
    const props = makeProps()
    render(<UpdatesFields {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Check now' }))
    expect(props.onCheckNow).toHaveBeenCalledTimes(1)
  })

  it('toggling the background switch calls onToggleBackground', () => {
    const props = makeProps()
    render(<UpdatesFields {...props} />)
    fireEvent.click(
      screen.getByRole('switch', { name: 'Check for updates automatically' }),
    )
    expect(props.onToggleBackground).toHaveBeenCalledWith(false)
  })

  it('in dev mode, disables the toggle and shows the dev notice', () => {
    const props = makeProps({ isDev: true })
    render(<UpdatesFields {...props} />)
    expect(
      screen.getByText('Auto-updates are disabled in development builds.'),
    ).toBeInTheDocument()
    const toggle = screen.getByRole('switch', {
      name: 'Check for updates automatically',
    })
    expect(toggle).toBeDisabled()
  })

  it('shows Download button and release-notes action when phase is available', () => {
    const props = makeProps({
      status: {
        phase: 'available',
        version: '0.17.0',
        releaseNotesUrl: 'https://example.test/v0.17.0',
        detectedAt: '2026-04-22T16:59:00.000Z',
      },
    })
    render(<UpdatesFields {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Download v0.17.0' }))
    expect(props.onDownload).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Release notes' }))
    expect(props.onOpenReleaseNotes).toHaveBeenCalled()
  })

  it('shows Install button when phase is downloaded', () => {
    const props = makeProps({
      status: {
        phase: 'downloaded',
        version: '0.17.0',
        releaseNotesUrl: 'https://example.test/v0.17.0',
      },
    })
    render(<UpdatesFields {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Install v0.17.0' }))
    expect(props.onInstall).toHaveBeenCalled()
  })
})

describe('describeStatus', () => {
  it('formats idle with no history', () => {
    expect(
      describeStatus(
        { phase: 'idle', lastChecked: null, lastError: null },
        '0.16.0',
        NOW,
      ),
    ).toBe('Never checked.')
  })

  it('formats idle with history', () => {
    expect(
      describeStatus(
        {
          phase: 'idle',
          lastChecked: '2026-04-22T16:50:00.000Z',
          lastError: null,
        },
        '0.16.0',
        NOW,
      ),
    ).toBe('Up to date. Last checked 10 minutes ago.')
  })

  it('formats idle with lastError', () => {
    expect(
      describeStatus(
        {
          phase: 'idle',
          lastChecked: null,
          lastError: 'Offline or GitHub unreachable.',
        },
        '0.16.0',
        NOW,
      ),
    ).toBe("Couldn't check for updates: Offline or GitHub unreachable.")
  })

  it('formats checking', () => {
    expect(
      describeStatus(
        { phase: 'checking', startedAt: '2026-04-22T16:59:55.000Z' },
        '0.16.0',
        NOW,
      ),
    ).toBe('Checking…')
  })

  it('formats available including both versions', () => {
    expect(
      describeStatus(
        {
          phase: 'available',
          version: '0.17.0',
          releaseNotesUrl: 'https://example.test/v0.17.0',
          detectedAt: '2026-04-22T17:00:00.000Z',
        },
        '0.16.0',
        NOW,
      ),
    ).toBe("Update available: v0.17.0 (you're on v0.16.0).")
  })

  it('formats downloading with clamped percent', () => {
    expect(
      describeStatus(
        {
          phase: 'downloading',
          version: '0.17.0',
          percent: 42.6,
          bytesPerSecond: 2048,
        },
        '0.16.0',
        NOW,
      ),
    ).toBe('Downloading v0.17.0… 43%')
  })

  it('formats downloaded', () => {
    expect(
      describeStatus(
        {
          phase: 'downloaded',
          version: '0.17.0',
          releaseNotesUrl: 'https://example.test/v0.17.0',
        },
        '0.16.0',
        NOW,
      ),
    ).toBe('Update v0.17.0 ready. Click Install to restart.')
  })

  it('formats not-available with relative time', () => {
    expect(
      describeStatus(
        {
          phase: 'not-available',
          currentVersion: '0.16.0',
          lastChecked: '2026-04-22T17:00:00.000Z',
        },
        '0.16.0',
        NOW,
      ),
    ).toBe('Up to date (last check just now).')
  })

  it('formats error with summarized message', () => {
    expect(
      describeStatus(
        {
          phase: 'error',
          message: 'Offline or GitHub unreachable.',
          lastChecked: null,
        },
        '0.16.0',
        NOW,
      ),
    ).toBe("Couldn't check for updates: Offline or GitHub unreachable.")
  })
})

describe('formatRelative', () => {
  it('returns just now for < 45s', () => {
    expect(formatRelative('2026-04-22T16:59:20.000Z', NOW)).toBe('just now')
  })

  it('returns minutes for < 1h', () => {
    expect(formatRelative('2026-04-22T16:45:00.000Z', NOW)).toBe(
      '15 minutes ago',
    )
  })

  it('returns singular minute', () => {
    expect(formatRelative('2026-04-22T16:58:30.000Z', NOW)).toBe('1 minute ago')
  })

  it('returns hours for < 24h', () => {
    expect(formatRelative('2026-04-22T10:00:00.000Z', NOW)).toBe('7 hours ago')
  })

  it('returns days for >= 24h', () => {
    expect(formatRelative('2026-04-19T17:00:00.000Z', NOW)).toBe('3 days ago')
  })
})
