import type { FC } from 'react'
import type {
  TrackerCredentialStatus,
  TrackerProbeReading,
} from '@/shared/types/tracker.types'
import {
  Button,
  ChoiceField,
  DescriptionItem,
  DescriptionList,
  Field,
  FieldDescription,
  FieldLabel,
  FormError,
  Input,
  SectionLabel,
  Switch,
} from '@convergence/ui'
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

const LABEL = 'text-2xs text-ink-muted'

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
      className="flex flex-col gap-2 border-t border-hairline pt-2"
    >
      <section aria-label="Dispatch" className="flex flex-col gap-2">
        <SectionLabel as="h4">Dispatch</SectionLabel>
        <ChoiceField
          density="compact"
          disabled={busy || !bound}
          className="min-h-10"
          label="Auto-dispatch — send issues labeled groomed, grounded, their seat and dispatch into their seats' conversations"
        >
          <Switch
            checked={autoDispatch}
            onCheckedChange={(checked) => onAutoDispatchChange?.(checked)}
          />
        </ChoiceField>
        <p className="text-2xs tabular-nums text-ink-muted">
          {dispatchCandidates.length
            ? `${dispatchCandidates.length} issue(s) would start now: ${dispatchCandidates.join(', ')}`
            : 'Nothing would start now'}
        </p>
      </section>
      <SectionLabel as="h4">Tracker</SectionLabel>

      {/* Facts nobody edits here are a DescriptionList, as a seat's are (MC-30). */}
      <DescriptionList layout="inline" density="compact">
        <DescriptionItem term="Kind">Linear</DescriptionItem>
      </DescriptionList>
      <Field className="gap-1">
        {/* What a person HAS is the URL in their address bar or the project's
            name; the id is the one thing Linear shows nowhere (MAR-3156). */}
        <FieldLabel variant="caption">
          Project ({TRACKER_PROJECT_FIELD_HINT})
        </FieldLabel>
        <Input
          size="sm"
          value={draft.projectId}
          disabled={busy}
          onChange={(event) => onDraftChange({ projectId: event.target.value })}
          className="text-xs"
        />
        {boundProjectName === null ? null : (
          <FieldDescription className={LABEL} data-tracker-bound-project>
            Bound to “{boundProjectName}”
          </FieldDescription>
        )}
      </Field>
      <div className="flex gap-2">
        <Field className="flex-1 gap-1">
          <FieldLabel variant="caption">Label prefix</FieldLabel>
          <Input
            size="sm"
            value={draft.labelPrefix}
            placeholder="horse:"
            disabled={busy}
            onChange={(event) =>
              onDraftChange({ labelPrefix: event.target.value })
            }
            className="text-xs"
          />
        </Field>
        <Field className="flex-1 gap-1">
          <FieldLabel variant="caption">Wave prefix</FieldLabel>
          <Input
            size="sm"
            value={draft.wavePrefix}
            placeholder="wave:"
            disabled={busy}
            onChange={(event) =>
              onDraftChange({ wavePrefix: event.target.value })
            }
            className="text-xs"
          />
        </Field>
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="tonal"
          disabled={busy || !draft.projectId.trim()}
          onClick={onSaveBinding}
          size="sm"
          className="flex-1"
        >
          {bound ? 'Save binding' : 'Bind to project'}
        </Button>
        {bound ? (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={onUnbind}
            size="sm"
          >
            Unbind
          </Button>
        ) : null}
      </div>

      <DescriptionList layout="inline" density="compact">
        <DescriptionItem term="API key">
          <span data-tracker-credential>
            {credential === null
              ? 'Checking…'
              : credential === 'present'
                ? 'Stored in Keychain'
                : 'Not stored'}
          </span>
        </DescriptionItem>
      </DescriptionList>
      {credential !== 'present' || asksForKey ? (
        <div className="flex items-center gap-1.5">
          <Input
            size="sm"
            type="password"
            autoComplete="off"
            aria-label={
              asksForKey ? 'Enter the Linear API key again' : 'Linear API key'
            }
            placeholder={asksForKey ? 'Enter the key again' : 'lin_api_…'}
            value={keyDraft}
            disabled={busy}
            onChange={(event) => onKeyDraftChange(event.target.value)}
            className="flex-1 text-xs"
          />
          <Button
            type="button"
            variant="tonal"
            disabled={busy || !keyDraft.trim()}
            onClick={onSaveKey}
            size="sm"
          >
            Store key
          </Button>
        </div>
      ) : (
        // It deletes the key from the Keychain, so it asks first: the quiet
        // red, ending in "…" (R5).
        <Button
          type="button"
          variant="danger-quiet"
          disabled={busy}
          onClick={onForgetKey}
          size="sm"
          className="justify-start font-normal"
        >
          Forget key…
        </Button>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="tonal"
          disabled={busy || !bound}
          onClick={onTest}
          size="sm"
        >
          Test
        </Button>
        <p className="flex-1 text-2xs" data-tracker-probe>
          {lastProbe ? trackerProbeSentence(lastProbe) : 'Not tested yet'}
        </p>
      </div>
      {lastProbe ? (
        <p className="text-3xs text-ink-muted">
          Tested at {probeTimeLabel(lastProbe.at)}
        </p>
      ) : null}
      <FormError>{error}</FormError>
      <p className="text-3xs text-ink-muted">
        Read only: the app watches this project once a minute and never writes
        to it; with auto-dispatch on it sends issues into your seats'
        conversations.
      </p>
    </section>
  )
}
