import { useEffect, useState, type FC } from 'react'
import {
  sessionCrewApi,
  trackerApi,
  type SessionCrew,
} from '@/entities/session-crew'
import type {
  TrackerCredentialStatus,
  TrackerProbeReading,
} from '@/shared/types/tracker.types'
import {
  TrackerBindingForm,
  type TrackerBindingDraft,
} from './tracker-binding-form.presentational'

function draftFrom(crew: SessionCrew): TrackerBindingDraft {
  return {
    projectId: crew.trackerBinding?.projectId ?? '',
    labelPrefix: crew.trackerBinding?.labelPrefix ?? 'horse:',
    wavePrefix: crew.trackerBinding?.wavePrefix ?? 'wave:',
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Wires the tracker form to its doors (MAR-3084 R9). Holds the drafts, the
 * presence bit and the last probe; the key only while it is being typed.
 */
export const TrackerBindingFormContainer: FC<{ crew: SessionCrew }> = ({
  crew,
}) => {
  const [draft, setDraft] = useState<TrackerBindingDraft>(() => draftFrom(crew))
  const [credential, setCredential] = useState<TrackerCredentialStatus | null>(
    null,
  )
  const [keyDraft, setKeyDraft] = useState('')
  const [lastProbe, setLastProbe] = useState<TrackerProbeReading | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Mounted per crew (`key={crew.id}` at the call site), so a crew switch
  // starts from empty drafts and an unread presence bit.
  useEffect(() => {
    let live = true
    trackerApi
      .credentialStatus(crew.id)
      .then((status) => {
        if (live) setCredential(status)
      })
      .catch((caught: unknown) => {
        if (live) setError(messageOf(caught))
      })
    return () => {
      live = false
    }
  }, [crew.id])

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await work()
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <TrackerBindingForm
      draft={draft}
      bound={!!crew.trackerBinding}
      credential={credential}
      keyDraft={keyDraft}
      lastProbe={lastProbe}
      busy={busy}
      error={error}
      onDraftChange={(patch) =>
        setDraft((current) => ({ ...current, ...patch }))
      }
      onSaveBinding={() =>
        void run(async () => {
          const saved = await sessionCrewApi.setTrackerBinding(crew.id, draft)
          setDraft(draftFrom(saved))
        })
      }
      onUnbind={() =>
        void run(async () => {
          const saved = await sessionCrewApi.setTrackerBinding(crew.id, null)
          setDraft(draftFrom(saved))
          setLastProbe(null)
        })
      }
      onKeyDraftChange={setKeyDraft}
      onSaveKey={() =>
        void run(async () => {
          const key = keyDraft
          // Out of the component before the round-trip: the key is never
          // shown back, whatever the Keychain answers.
          setKeyDraft('')
          setCredential(await trackerApi.setCredential(crew.id, key))
          setLastProbe(null)
        })
      }
      onForgetKey={() =>
        void run(async () => {
          setCredential(await trackerApi.deleteCredential(crew.id))
        })
      }
      onTest={() =>
        void run(async () => {
          setLastProbe(await trackerApi.probe(crew.id))
        })
      }
    />
  )
}
