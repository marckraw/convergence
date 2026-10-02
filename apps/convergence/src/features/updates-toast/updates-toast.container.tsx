import { useEffect, useRef } from 'react'
import { notify } from '@convergence/ui'
import { RELEASE_NOTES_TITLE, useUpdatesStore } from '@/entities/updates'
import type { UpdatePhase, UpdateStatus } from '@/entities/updates'

const DOWNLOADING_TOAST_ID = 'updates:downloading'
const AVAILABLE_TOAST_ID = 'updates:available'
const READY_TOAST_ID = 'updates:ready'

export function UpdatesToastContainer() {
  const status = useUpdatesStore((s) => s.status)
  const lastTrigger = useUpdatesStore((s) => s.lastTrigger)
  const download = useUpdatesStore((s) => s.download)
  const install = useUpdatesStore((s) => s.install)
  const openReleaseNotes = useUpdatesStore((s) => s.openReleaseNotes)

  const lastFiredRef = useRef<UpdatePhase | null>(null)

  useEffect(() => {
    const phase = status.phase
    const prev = lastFiredRef.current
    // Both offers' second button opens the release notes (NAV-31).
    const releaseNotesAction = {
      label: RELEASE_NOTES_TITLE,
      onClick: () => {
        void openReleaseNotes()
      },
    }

    switch (phase) {
      case 'available': {
        notify.info(`Update available — Convergence v${status.version}`, {
          id: AVAILABLE_TOAST_ID,
          description: 'Download and install when you’re ready.',
          action: {
            label: 'Download',
            onClick: () => {
              void download()
            },
          },
          secondaryAction: releaseNotesAction,
          persistent: true,
        })
        break
      }
      case 'downloading': {
        notify.dismiss(AVAILABLE_TOAST_ID)
        notify.loading(`Downloading v${status.version}…`, {
          id: DOWNLOADING_TOAST_ID,
          description: formatProgressDescription(status),
          persistent: true,
        })
        break
      }
      case 'downloaded': {
        notify.dismiss(DOWNLOADING_TOAST_ID)
        notify.success(`Update v${status.version} ready`, {
          id: READY_TOAST_ID,
          description: 'Install now to restart into the new version.',
          action: {
            label: 'Install now',
            onClick: () => {
              void install()
            },
          },
          secondaryAction: releaseNotesAction,
          persistent: true,
        })
        break
      }
      case 'not-available': {
        if (phase !== prev && lastTrigger === 'user') {
          notify.message('You’re up to date.', {
            description: `Convergence v${status.currentVersion} is the latest release.`,
          })
        }
        break
      }
      case 'error': {
        if (phase !== prev && lastTrigger === 'user') {
          notify.failure('check for updates', status.message)
        }
        break
      }
      case 'checking':
      case 'idle':
        break
    }

    lastFiredRef.current = phase
  }, [status, lastTrigger, download, install, openReleaseNotes])

  return null
}

function formatProgressDescription(
  status: Extract<UpdateStatus, { phase: 'downloading' }>,
): string {
  const percent = clamp(Math.round(status.percent), 0, 100)
  const speed = humanSpeed(status.bytesPerSecond)
  return speed ? `${percent}% · ${speed}` : `${percent}%`
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function humanSpeed(bps: number): string | null {
  if (!Number.isFinite(bps) || bps <= 0) return null
  if (bps < 1024) return `${Math.round(bps)} B/s`
  const kb = bps / 1024
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB/s`
  const mb = kb / 1024
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB/s`
}
