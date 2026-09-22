import type { FC } from 'react'
import type {
  TrackerCredentialStatus,
  TrackerProbeReading,
} from '@/shared/types/tracker.types'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import {
  probeAsksForKey,
  probeTimeLabel,
  TRACKER_PROJECT_FIELD_HINT,
  trackerProbeSentence,
} from './tracker-binding-form.pure'

export interface TrackerBindingDraft {
  projectId: string
  labelPrefix: string
  wavePrefix: string
}

interface TrackerBindingFormProps {
  autoDispatch?: boolean
  dispatchCandidates?: readonly string[]
  onAutoDispatchChange?: (enabled: boolean) => void
  draft: TrackerBindingDraft
  bound: boolean
  /** Whether a key exists -- the form never holds the key itself. */
  credential: TrackerCredentialStatus | null
  /** What is typed into the key field right now; cleared once stored. */
  keyDraft: string
  lastProbe: TrackerProbeReading | null
  /**
   * The project the last bind RESOLVED to, or null (MAR-3156 lap 2, C).
   * After a URL or a name the field holds a UUID, and this is the only thing
   * on screen that says which project that is.
   */
  boundProjectName?: string | null
  busy: boolean
  error: string | null
  onDraftChange: (patch: Partial<TrackerBindingDraft>) => void
  onSaveBinding: () => void
  onUnbind: () => void
  onKeyDraftChange: (value: string) => void
  onSaveKey: () => void
  onForgetKey: () => void
  onTest: () => void
}

const LABEL = 'text-[11px] text-muted-foreground'

/**
 * The crew's tracker binding (MAR-3084 R9): four fields, whether a key is
 * stored, and what the last Test found. Facts, never the key: the key field
 * only ever shows what is being typed, and the container empties it the
 * moment the Keychain has it.
 */
export const TrackerBindingForm: FC<TrackerBindingFormProps> = ({
  autoDispatch = false,
  dispatchCandidates = [],
  onAutoDispatchChange,
  draft,
  bound,
  credential,
  keyDraft,
  lastProbe,
  boundProjectName = null,
  busy,
  error,
  onDraftChange,
  onSaveBinding,
  onUnbind,
  onKeyDraftChange,
  onSaveKey,
  onForgetKey,
  onTest,
}) => {
  const asksForKey = probeAsksForKey(lastProbe)
  return (
    <section
      aria-label="Tracker"
      data-crew-tracker
      className="flex flex-col gap-2 border-t border-white/10 pt-2"
    >
      <section aria-label="Dispatch" className="flex flex-col gap-2">
        <h4 className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Dispatch
        </h4>
        <label className="flex min-h-10 items-center gap-2 text-xs text-muted-foreground">
          <Input
            className="size-3.5 shrink-0 rounded-sm p-0"
            type="checkbox"
            role="switch"
            checked={autoDispatch}
            disabled={busy || !bound}
            onChange={(event) => onAutoDispatchChange?.(event.target.checked)}
          />
          Auto-dispatch — send issues labeled groomed, grounded, their seat and
          dispatch into their seats' conversations
        </label>
        <p className="text-[11px] tabular-nums text-muted-foreground">
          {dispatchCandidates.length
            ? `${dispatchCandidates.length} issue(s) would start now: ${dispatchCandidates.join(', ')}`
            : 'Nothing would start now'}
        </p>
      </section>
      <h4 className="text-[11px] uppercase tracking-wide text-muted-foreground">
        Tracker
      </h4>

      <div className="flex items-center gap-2">
        <span className={`flex-1 ${LABEL}`}>Kind</span>
        <span className="text-xs">Linear</span>
      </div>
      <label className="flex flex-col gap-1">
        {/* What a person HAS is the URL in their address bar or the project's
            name; the id is the one thing Linear shows nowhere (MAR-3156). */}
        <span className={LABEL}>Project ({TRACKER_PROJECT_FIELD_HINT})</span>
        <Input
          aria-label="Tracker project"
          value={draft.projectId}
          disabled={busy}
          onChange={(event) => onDraftChange({ projectId: event.target.value })}
          className="h-7 text-xs"
        />
        {boundProjectName === null ? null : (
          <span className={LABEL} data-tracker-bound-project>
            Bound to “{boundProjectName}”
          </span>
        )}
      </label>
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className={LABEL}>Label prefix</span>
          <Input
            aria-label="Tracker label prefix"
            value={draft.labelPrefix}
            placeholder="horse:"
            disabled={busy}
            onChange={(event) =>
              onDraftChange({ labelPrefix: event.target.value })
            }
            className="h-7 text-xs"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className={LABEL}>Wave prefix</span>
          <Input
            aria-label="Tracker wave prefix"
            value={draft.wavePrefix}
            placeholder="wave:"
            disabled={busy}
            onChange={(event) =>
              onDraftChange({ wavePrefix: event.target.value })
            }
            className="h-7 text-xs"
          />
        </label>
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-7 flex-1 text-xs"
          disabled={busy || !draft.projectId.trim()}
          onClick={onSaveBinding}
        >
          {bound ? 'Save binding' : 'Bind to project'}
        </Button>
        {bound ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={busy}
            onClick={onUnbind}
          >
            Unbind
          </Button>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <span className={`flex-1 ${LABEL}`}>API key</span>
        <span className="text-xs" data-tracker-credential>
          {credential === null
            ? 'Checking…'
            : credential === 'present'
              ? 'Stored in Keychain'
              : 'Not stored'}
        </span>
      </div>
      {credential !== 'present' || asksForKey ? (
        <div className="flex items-center gap-1.5">
          <Input
            type="password"
            autoComplete="off"
            aria-label={
              asksForKey ? 'Enter the Linear API key again' : 'Linear API key'
            }
            placeholder={asksForKey ? 'Enter the key again' : 'lin_api_…'}
            value={keyDraft}
            disabled={busy}
            onChange={(event) => onKeyDraftChange(event.target.value)}
            className="h-7 flex-1 text-xs"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-7 text-xs"
            disabled={busy || !keyDraft.trim()}
            onClick={onSaveKey}
          >
            Store key
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 justify-start px-2 text-xs font-normal"
          disabled={busy}
          onClick={onForgetKey}
        >
          Forget key
        </Button>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-7 text-xs"
          disabled={busy || !bound}
          onClick={onTest}
        >
          Test
        </Button>
        <p className="flex-1 text-[11px]" data-tracker-probe>
          {lastProbe ? trackerProbeSentence(lastProbe) : 'Not tested yet'}
        </p>
      </div>
      {lastProbe ? (
        <p className="text-[10px] text-muted-foreground/70">
          Tested at {probeTimeLabel(lastProbe.at)}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      ) : null}
      <p className="text-[10px] text-muted-foreground/70">
        Read only: the app watches this project once a minute and never writes
        to it; with auto-dispatch on it sends issues into your seats'
        conversations.
      </p>
    </section>
  )
}
