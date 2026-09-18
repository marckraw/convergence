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
import { parseLinearProjectReference } from '@/shared/lib/linear-project-reference.pure'
import {
  TrackerBindingForm,
  type TrackerBindingDraft,
} from './tracker-binding-form.presentational'
import {
  TRACKER_PROJECT_NEEDS_KEY_SENTENCE,
  trackerProjectProblem,
} from './tracker-binding-form.pure'

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
  /** The project a URL or a name resolved to, for the line under the field. */
  const [boundProjectName, setBoundProjectName] = useState<string | null>(null)
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

  /**
   * The id to bind, from whatever was typed (MAR-3156 R1/R3).
   *
   * A UUID is bound exactly as before -- no read, and no key needed, because
   * the form has always allowed binding before the key is stored. Anything
   * else is a URL or a name and has to be looked up, which needs the key; the
   * refusals are sentences a person can act on, thrown so `run` shows them
   * and nothing is saved.
   */
  const resolveProjectId = async (
    typed: string,
  ): Promise<{ projectId: string; projectName: string | null }> => {
    const reference = parseLinearProjectReference(typed)
    if (reference === null || reference.kind === 'id') {
      return { projectId: typed, projectName: null }
    }
    // Only when the form KNOWS there is no key (lap 2, C). `null` is "the
    // status read has not come back", and refusing on it told a person who
    // has a key to go and store one. The door answers a missing key with a
    // typed refusal of its own, so asking is safe and honest.
    if (credential === 'absent') {
      throw new Error(TRACKER_PROJECT_NEEDS_KEY_SENTENCE)
    }
    const resolution = await trackerApi.resolveProject(crew.id, typed)
    if (resolution.kind === 'resolved') {
      return {
        projectId: resolution.project.id,
        projectName: resolution.project.name,
      }
    }
    throw new Error(trackerProjectProblem(resolution))
  }

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
      boundProjectName={boundProjectName}
      busy={busy}
      error={error}
      onDraftChange={(patch) =>
        setDraft((current) => ({ ...current, ...patch }))
      }
      onSaveBinding={() =>
        void run(async () => {
          const found = await resolveProjectId(draft.projectId)
          const saved = await sessionCrewApi.setTrackerBinding(crew.id, {
            ...draft,
            projectId: found.projectId,
          })
          setDraft(draftFrom(saved))
          // After a URL or a name the field flips to a UUID, and without
          // this nothing on screen says which project that is until Test is
          // pressed (lap 2, C). A UUID bind resolved nothing, so it says
          // nothing.
          setBoundProjectName(found.projectName)
        })
      }
      onUnbind={() =>
        void run(async () => {
          const saved = await sessionCrewApi.setTrackerBinding(crew.id, null)
          setDraft(draftFrom(saved))
          setLastProbe(null)
          setBoundProjectName(null)
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
