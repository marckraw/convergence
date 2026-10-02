import {
  WorkAddressSlot,
  type WorkAddressSlotView,
} from '@/entities/execution-host'
import type { FC } from 'react'
import { ArrowRight } from 'lucide-react'
import { ProviderAccountPicker } from '@/entities/provider-account'
import type { ProviderAccount } from '@/entities/provider-account'
import {
  Button,
  ChoiceField,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Combobox,
  Notice,
  RadioGroup,
  RadioGroupItem,
  SectionLabel,
  sectionLabel,
  Switch,
  Textarea,
} from '@convergence/ui'
import { InspectorHeader } from './inspector-header.presentational'
import { INSPECTOR_NOTE_CLASS, INSPECTOR_SHELL_CLASS } from './inspector.styles'
import type { RelayEndpointOption } from './relay-sentence.pure'
import type {
  BeforeDeliveryMode,
  BeforeDeliveryOption,
  ConnectionDraft,
  ConnectionSpawnSpec,
} from './connection-draft.pure'

/** The id the recipient picker uses for "open a new session instead". */
export const SPAWN_RECIPIENT_OPTION_ID = '__spawn__'

/** The id the project picker uses for "no project at all". */
export const GLOBAL_PROJECT_OPTION_ID = '__global__'

interface ConnectionInspectorProps {
  /** The name of the conversation whose reply this carries. */
  sourceName: string
  /** The recipient's name, or null while a draft has not chosen one. */
  recipientName: string | null
  draft: ConnectionDraft
  /** True while this is a draft nobody has saved yet. */
  isNew: boolean
  /** True when the draft differs from what is stored. */
  dirty: boolean
  /** The last save's refusal, or null. Keeps the draft; never resends. */
  saveError: string | null
  /**
   * Set when the stored recipient is gone (frame 10-01). The connection stays
   * editable and its history stays readable; only its far end is missing.
   */
  recipientMissing: boolean
  /** Conversations in this crew that could receive the reply. */
  recipientOptions: RelayEndpointOption[]
  beforeDelivery: BeforeDeliveryOption[]
  /** A note about a stored opener this provider cannot run, or null. */
  customOpenerNote: string | null
  /**
   * What changing the recipient dropped, or null (M2).
   *
   * A change that quietly rewrote another field would be the same defect
   * wearing better manners, so the panel says it where the change was made.
   */
  recipientNote: string | null
  /** Why this cannot be saved yet, or null. */
  problem: string | null
  busy: boolean
  projectOptions: RelayEndpointOption[]
  providerOptions: RelayEndpointOption[]
  modelOptions: RelayEndpointOption[]
  effortOptions: RelayEndpointOption[]
  hostOptions: RelayEndpointOption[]
  workAddressSlot: WorkAddressSlotView
  onWorkAddressChange: (id: string) => void
  onBranchChange: (branch: string) => void
  spawnAccounts: ProviderAccount[]
  onRecipientChange: (optionId: string) => void
  onSpawnChange: (patch: Partial<ConnectionSpawnSpec>) => void
  onEnabledChange: (enabled: boolean) => void
  onConditionKindChange: (kind: 'any' | 'token') => void
  onConditionTokenChange: (token: string) => void
  onBeforeDeliveryChange: (mode: BeforeDeliveryMode) => void
  onCustomOpenerChange: (opener: string) => void
  onInstructionsChange: (instructions: string) => void
  onSave: () => void
  onCancel: () => void
  onDelete: () => void
  onClose: () => void
}

const CONDITION_CHOICES: { value: 'any' | 'token'; label: string }[] = [
  { value: 'any', label: 'Any finish' },
  { value: 'token', label: 'Only when a final line matches' },
]

function selectedRecipientOptionId(draft: ConnectionDraft): string | null {
  if (draft.recipient.kind === 'spawn') return SPAWN_RECIPIENT_OPTION_ID
  return draft.recipient.sessionId
}

/**
 * One connection, opened.
 *
 * The panel replaces the retired editor's form AND its row: a connection is
 * now inspected where it is drawn rather than listed twice. Everything the old
 * editor could express is here — an existing recipient or a spawned one, the
 * unconditional and the conditioned firing, the arbitrary first message, the
 * standing brief, and the switch — because a replacement that quietly dropped
 * a capability is the failure mode this whole slice was warned about
 * (promise 2).
 *
 * **Nothing on this panel sends a message.** Saving stores settings; the
 * switch stores a switch; *Try again* after a failed save stores settings
 * again. The only thing that ever sends is the engine, when the source
 * session actually finishes.
 */
export const ConnectionInspector: FC<ConnectionInspectorProps> = ({
  sourceName,
  recipientName,
  draft,
  isNew,
  dirty,
  saveError,
  recipientMissing,
  recipientOptions,
  beforeDelivery,
  customOpenerNote,
  recipientNote,
  problem,
  busy,
  projectOptions,
  providerOptions,
  modelOptions,
  effortOptions,
  hostOptions,
  workAddressSlot,
  onWorkAddressChange,
  onBranchChange,
  spawnAccounts,
  onRecipientChange,
  onSpawnChange,
  onEnabledChange,
  onConditionKindChange,
  onConditionTokenChange,
  onBeforeDeliveryChange,
  onCustomOpenerChange,
  onInstructionsChange,
  onSave,
  onCancel,
  onDelete,
  onClose,
}) => {
  const spawning = draft.recipient.kind === 'spawn'
  const spec = draft.recipient.kind === 'spawn' ? draft.recipient.spec : null
  const activeBeforeDelivery = beforeDelivery.find(
    (option) => option.mode === draft.beforeDelivery,
  )
  // What each picker's trigger says. A picker is named "Field: value" (MC-12),
  // as the composer's are: its value alone told a screen reader "Opus,
  // combobox" and never which choice that was.
  const recipientValue = spawning
    ? 'Start a new session…'
    : (recipientName ?? 'Choose a conversation')
  const hostValue = spec
    ? (hostOptions.find((option) => option.id === spec.executionHost)?.label ??
      spec.executionHost)
    : ''
  const providerValue =
    providerOptions.find((option) => option.id === spec?.providerId)?.label ??
    'Pick a provider'
  const modelValue =
    modelOptions.find((option) => option.id === spec?.model)?.label ??
    'Default model'
  const effortValue =
    effortOptions.find((option) => option.id === spec?.effort)?.label ??
    'Default effort'
  const projectValue =
    projectOptions.find(
      (option) => option.id === (spec?.projectId ?? GLOBAL_PROJECT_OPTION_ID),
    )?.label ?? 'Pick a project'

  return (
    <section
      data-connection-inspector
      aria-label="Connection"
      className={INSPECTOR_SHELL_CLASS}
    >
      <InspectorHeader
        eyebrow={isNew ? 'New connection' : 'Connection'}
        title={
          <span className="flex items-center gap-1.5">
            {sourceName}
            <ArrowRight aria-hidden className="size-3.5" />
            {recipientName ?? '…'}
          </span>
        }
        // Draft, unsaved and saved are three different sentences, because
        // "is this stored?" is the question the whole panel turns on.
        subtitle={
          isNew
            ? 'Not saved yet'
            : dirty
              ? `Unsaved changes · connection ${draft.enabled ? 'on' : 'off'}`
              : `Saved · ${draft.enabled ? 'on' : 'off'}`
        }
        closeLabel="Close the connection panel"
        onClose={onClose}
      />

      {/* Frame 09. The draft is kept and the STORED wire is untouched, and the
          panel says both — a failure that only said "couldn't save" would
          leave the person unsure which version is live. */}
      {saveError ? (
        <Notice
          tone="danger"
          title="Couldn’t save the connection"
          className="text-2xs"
        >
          <span className="block text-ink-muted">
            Your draft is kept here. The saved connection has not changed.
          </span>
          <span className="block text-3xs text-ink-muted">{saveError}</span>
        </Notice>
      ) : null}

      {/* Frame 10-01. The row survives; only its far end is gone. */}
      {recipientMissing ? (
        <Notice
          tone="warning"
          title="Recipient unavailable"
          className="text-2xs"
        >
          <span className="block text-ink-muted">
            This conversation is no longer available. Choose a replacement to
            continue editing this connection.
          </span>
          <span className="block text-3xs text-ink-muted">
            Existing history stays readable, even when a conversation is
            missing.
          </span>
        </Notice>
      ) : null}

      <ChoiceField
        label={draft.enabled ? 'On' : 'Off'}
        hint="Saved connections can stay off while you build the crew."
        disabled={busy}
      >
        <Switch
          id="connection-enabled"
          checked={draft.enabled}
          onCheckedChange={(next) => onEnabledChange(next)}
        />
      </ChoiceField>

      <div className="flex flex-col gap-1">
        <SectionLabel as="h4">Recipient</SectionLabel>
        <Combobox
          selectedId={selectedRecipientOptionId(draft)}
          value={recipientValue}
          ariaLabel={`Recipient: ${recipientValue}`}
          items={[
            ...recipientOptions,
            // R9: the spawn path survives the redesign. A crew often has no
            // reviewer yet, and "open one" is the wire that makes it.
            {
              id: SPAWN_RECIPIENT_OPTION_ID,
              label: 'Start a new session…',
              description: 'Opens a conversation when this connection fires',
            },
          ]}
          onChange={onRecipientChange}
          disabled={busy}
          searchPlaceholder="Find a conversation in this crew…"
          emptyMessage="No other conversations in this crew."
        />
        {recipientNote ? (
          <p className="text-3xs text-warning-ink">{recipientNote}</p>
        ) : null}
        {spawning ? null : (
          <p className={INSPECTOR_NOTE_CLASS}>
            Need another conversation? Add it to this crew first.
          </p>
        )}
      </div>

      {spec ? (
        <div className="flex flex-col gap-1.5 rounded-md border border-hairline px-2 py-2">
          <p className="text-2xs text-ink-muted">
            The session this connection opens
          </p>
          <Field className="gap-1.5">
            <FieldLabel variant="caption" nativeLabel={false} render={<div />}>
              Execution host
            </FieldLabel>
            <Combobox
              selectedId={spec.executionHost}
              value={hostValue}
              items={hostOptions}
              onChange={(executionHost) =>
                onSpawnChange({
                  executionHost,
                  workAddress: null,
                  providerAccountId: null,
                })
              }
              disabled={busy}
              searchPlaceholder="Search hosts…"
              size="sm"
            />
          </Field>
          <WorkAddressSlot
            view={workAddressSlot}
            disabled={busy}
            onChange={onWorkAddressChange}
            onBranchChange={onBranchChange}
          />
          <Field className="gap-1.5">
            <FieldLabel variant="caption">Role card</FieldLabel>
            <Textarea
              value={spec.roleCard ?? ''}
              disabled={busy}
              onChange={(event) =>
                onSpawnChange({ roleCard: event.target.value || null })
              }
            />
          </Field>
          <ChoiceField
            label={`Report back to ${sourceName} when it finishes`}
            disabled={busy}
          >
            <Switch
              id="spawn-return-wire"
              checked={spec.returnWire !== null}
              onCheckedChange={(enabled) =>
                onSpawnChange({
                  returnWire: enabled
                    ? { instruction: spec.returnInstructionDraft ?? '' }
                    : null,
                })
              }
            />
          </ChoiceField>
          {spec.returnWire ? (
            <Field className="gap-1.5">
              <FieldLabel variant="caption">Return instructions</FieldLabel>
              <Textarea
                value={spec.returnWire.instruction}
                disabled={busy}
                onChange={(event) =>
                  onSpawnChange({
                    returnWire: { instruction: event.target.value },
                  })
                }
              />
            </Field>
          ) : null}
          <Combobox
            selectedId={spec.providerId}
            value={providerValue}
            ariaLabel={`Provider: ${providerValue}`}
            items={providerOptions}
            onChange={(id) =>
              onSpawnChange({ providerId: id, model: null, effort: null })
            }
            disabled={busy}
            searchPlaceholder="Search providers…"
            emptyMessage="No providers available."
            size="sm"
          />
          {modelOptions.length > 0 ? (
            <Combobox
              selectedId={spec.model}
              value={modelValue}
              ariaLabel={`Model: ${modelValue}`}
              items={modelOptions}
              onChange={(id) => onSpawnChange({ model: id, effort: null })}
              disabled={busy}
              searchPlaceholder="Search models…"
              emptyMessage="No models for this provider."
              size="sm"
            />
          ) : null}
          {effortOptions.length > 0 ? (
            <Combobox
              selectedId={spec.effort}
              value={effortValue}
              ariaLabel={`Effort: ${effortValue}`}
              items={effortOptions}
              onChange={(id) => onSpawnChange({ effort: id })}
              disabled={busy}
              searchPlaceholder="Search effort…"
              emptyMessage="No effort levels for this model."
              size="sm"
            />
          ) : null}
          {/* A spawned session's account is fixed the moment it starts, so
              this is the only chance to choose it. */}
          <ProviderAccountPicker
            accounts={spawnAccounts}
            selectedAccountId={spec.providerAccountId}
            onChange={(providerAccountId) =>
              onSpawnChange({ providerAccountId })
            }
            disabled={busy}
          />
          <Combobox
            selectedId={spec.projectId ?? GLOBAL_PROJECT_OPTION_ID}
            value={projectValue}
            ariaLabel={`Project: ${projectValue}`}
            items={projectOptions}
            onChange={(id) =>
              onSpawnChange({
                projectId: id === GLOBAL_PROJECT_OPTION_ID ? null : id,
              })
            }
            disabled={busy}
            searchPlaceholder="Search projects…"
            emptyMessage="No projects."
            size="sm"
          />
          <Input
            size="sm"
            value={spec.name}
            placeholder="Relayed session"
            aria-label="Name for the new session"
            disabled={busy}
            onChange={(event) => onSpawnChange({ name: event.target.value })}
            className="text-xs"
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <SectionLabel as="h4">When {sourceName} finishes</SectionLabel>
        {/* One of two, each in words (MC-7, R9): a radio group. */}
        <RadioGroup
          aria-label="When this connection fires"
          value={draft.condition.kind}
          disabled={busy}
          onValueChange={(kind) =>
            onConditionKindChange(kind as 'any' | 'token')
          }
          className="gap-0"
        >
          {CONDITION_CHOICES.map((choice) => (
            <ChoiceField
              key={choice.value}
              label={choice.label}
              disabled={busy}
            >
              <RadioGroupItem value={choice.value} />
            </ChoiceField>
          ))}
        </RadioGroup>
        {draft.condition.kind === 'token' ? (
          <>
            <Input
              size="md"
              value={draft.condition.token}
              placeholder="BATON: horse"
              aria-label="The final line this connection waits for"
              disabled={busy}
              onChange={(event) => onConditionTokenChange(event.target.value)}
              className="text-xs"
            />
            <p className={INSPECTOR_NOTE_CLASS}>
              Only this final line sends the reply to{' '}
              {recipientName ?? 'the recipient'}.
            </p>
          </>
        ) : (
          <p className={INSPECTOR_NOTE_CLASS}>
            Fires whenever {sourceName} finishes, whatever it says.
          </p>
        )}
      </div>

      {/* R8. Offered for a session recipient only: a spawn opens a
          conversation that has never been used, so there is nothing to keep,
          clear, or say first. */}
      {spawning ? null : (
        <div className="flex flex-col gap-1">
          <SectionLabel as="h4">Before delivery</SectionLabel>
          {/* One of a few, each in words (MC-7, R9). An option this provider
              cannot run says why under its words (R2), not in a tooltip. */}
          <RadioGroup
            aria-label="What happens before the reply is delivered"
            value={draft.beforeDelivery}
            disabled={busy}
            onValueChange={(mode) =>
              onBeforeDeliveryChange(mode as BeforeDeliveryMode)
            }
            className="gap-0"
          >
            {beforeDelivery.map((option) => (
              <ChoiceField
                key={option.mode}
                label={option.label}
                hint={option.disabled ? option.help : undefined}
                disabled={busy || option.disabled}
              >
                <RadioGroupItem value={option.mode} />
              </ChoiceField>
            ))}
          </RadioGroup>
          {draft.beforeDelivery === 'custom' ? (
            <Input
              size="md"
              value={draft.customOpener}
              placeholder="/clear"
              aria-label="The first message, sent on its own"
              disabled={busy}
              onChange={(event) => onCustomOpenerChange(event.target.value)}
              className="text-xs"
            />
          ) : null}
          <p className={INSPECTOR_NOTE_CLASS}>
            {activeBeforeDelivery?.help ?? ''}
          </p>
          {customOpenerNote ? (
            <p className="text-3xs text-warning-ink">{customOpenerNote}</p>
          ) : null}
        </div>
      )}

      <Field className="gap-1">
        <FieldLabel className={sectionLabel}>Standing instructions</FieldLabel>
        <Textarea
          value={draft.instructions}
          placeholder="Implement the brief. Return your result and verification evidence."
          disabled={busy}
          rows={4}
          onChange={(event) => onInstructionsChange(event.target.value)}
          className="min-h-20 text-xs"
        />
        <FieldDescription className={INSPECTOR_NOTE_CLASS}>
          {recipientName ?? 'The recipient'} receives {sourceName}’s full last
          response with these instructions.
        </FieldDescription>
      </Field>

      <div className="mt-auto flex flex-col gap-2">
        {/* Why it can't be saved yet: a heads-up, not a failure, so the
            warning ink; the line keeps its room so the buttons never jump. */}
        <p className="min-h-4 text-2xs text-warning-ink">{problem ?? ''}</p>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="tonal"
            disabled={busy || problem !== null || (!isNew && !dirty)}
            onClick={onSave}
          >
            {saveError ? 'Try again' : 'Save changes'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={onCancel}
          >
            {saveError ? 'Discard changes' : 'Cancel'}
          </Button>
        </div>
        {saveError ? (
          <p className={INSPECTOR_NOTE_CLASS}>
            Trying again saves settings. It does not resend a message.
          </p>
        ) : null}
        {isNew ? null : (
          <Button
            type="button"
            variant="danger-quiet"
            disabled={busy}
            onClick={onDelete}
            size="sm"
            className="self-start"
          >
            Delete connection…
          </Button>
        )}
      </div>
    </section>
  )
}
