import {
  WorkAddressSlot,
  type WorkAddressSlotView,
} from '@/entities/execution-host'
import type { FC } from 'react'
import { ArrowRight, X } from 'lucide-react'
import { ProviderAccountPicker } from '@/entities/provider-account'
import type { ProviderAccount } from '@/entities/provider-account'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { SearchableSelect } from '@/shared/ui/searchable-select.container'
import { SwitchRow } from '@/shared/ui/switch'
import { Textarea } from '@/shared/ui/textarea'
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

  return (
    <section
      data-connection-inspector
      aria-label="Connection"
      className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto border-l border-white/10 px-4 py-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {isNew ? 'New connection' : 'Connection'}
          </p>
          <h3 className="flex items-center gap-1.5 text-sm font-medium">
            {sourceName}
            <ArrowRight aria-hidden className="size-3.5" />
            {recipientName ?? '…'}
          </h3>
          {/* Draft, unsaved and saved are three different sentences, because
              "is this stored?" is the question the whole panel turns on. */}
          <p className="text-[11px] text-muted-foreground">
            {isNew
              ? 'Not saved yet'
              : dirty
                ? `Unsaved changes · connection ${draft.enabled ? 'on' : 'off'}`
                : `Saved · ${draft.enabled ? 'on' : 'off'}`}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Close the connection panel"
          onClick={onClose}
          className="size-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      {/* Frame 09. The draft is kept and the STORED wire is untouched, and the
          panel says both — a failure that only said "couldn't save" would
          leave the person unsure which version is live. */}
      {saveError ? (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2"
        >
          <p className="text-[11px] font-medium text-red-400">
            Couldn’t save the connection
          </p>
          <p className="text-[11px] text-muted-foreground">
            Your draft is kept here. The saved connection has not changed.
          </p>
          <p className="text-[10px] text-muted-foreground/70">{saveError}</p>
        </div>
      ) : null}

      {/* Frame 10-01. The row survives; only its far end is gone. */}
      {recipientMissing ? (
        <div className="flex flex-col gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2">
          <p className="text-[11px] font-medium text-amber-400">
            Recipient unavailable
          </p>
          <p className="text-[11px] text-muted-foreground">
            This conversation is no longer available. Choose a replacement to
            continue editing this connection.
          </p>
          <p className="text-[10px] text-muted-foreground/70">
            Existing history stays readable, even when a conversation is
            missing.
          </p>
        </div>
      ) : null}

      <SwitchRow
        id="connection-enabled"
        label={draft.enabled ? 'On' : 'Off'}
        description="Saved connections can stay off while you build the crew."
        checked={draft.enabled}
        disabled={busy}
        onChange={onEnabledChange}
      />

      <div className="flex flex-col gap-1">
        <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Recipient
        </label>
        <SearchableSelect
          selectedId={selectedRecipientOptionId(draft)}
          value={
            spawning
              ? 'Start a new session…'
              : (recipientName ?? 'Choose a conversation')
          }
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
          triggerClassName="h-8 text-xs"
        />
        {recipientNote ? (
          <p className="text-[10px] text-amber-400/80">{recipientNote}</p>
        ) : null}
        {spawning ? null : (
          <p className="text-[10px] text-muted-foreground/70">
            Need another conversation? Add it to this crew first.
          </p>
        )}
      </div>

      {spec ? (
        <div className="flex flex-col gap-1.5 rounded-md border border-white/10 px-2 py-2">
          <p className="text-[11px] text-muted-foreground">
            The session this connection opens
          </p>
          <p className="text-[11px] text-muted-foreground">Execution host</p>
          <SearchableSelect
            selectedId={spec.executionHost}
            value={
              hostOptions.find((option) => option.id === spec.executionHost)
                ?.label ?? spec.executionHost
            }
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
            triggerClassName="h-7 text-xs"
          />
          <WorkAddressSlot
            view={workAddressSlot}
            disabled={busy}
            onChange={onWorkAddressChange}
            onBranchChange={onBranchChange}
          />
          <label
            htmlFor="spawn-role-card"
            className="text-[11px] text-muted-foreground"
          >
            Role card
          </label>
          <Textarea
            id="spawn-role-card"
            value={spec.roleCard ?? ''}
            disabled={busy}
            onChange={(event) =>
              onSpawnChange({ roleCard: event.target.value || null })
            }
          />
          <SwitchRow
            id="spawn-return-wire"
            label={`Report back to ${sourceName} when it finishes`}
            checked={spec.returnWire !== null}
            disabled={busy}
            onChange={(enabled) =>
              onSpawnChange({
                returnWire: enabled
                  ? { instruction: spec.returnInstructionDraft ?? '' }
                  : null,
              })
            }
          />
          {spec.returnWire ? (
            <label className="text-[11px] text-muted-foreground">
              Return instructions
              <Textarea
                value={spec.returnWire.instruction}
                disabled={busy}
                onChange={(event) =>
                  onSpawnChange({
                    returnWire: { instruction: event.target.value },
                  })
                }
              />
            </label>
          ) : null}
          <SearchableSelect
            selectedId={spec.providerId}
            value={
              providerOptions.find((option) => option.id === spec.providerId)
                ?.label ?? 'Pick a provider'
            }
            items={providerOptions}
            onChange={(id) =>
              onSpawnChange({ providerId: id, model: null, effort: null })
            }
            disabled={busy}
            searchPlaceholder="Search providers…"
            emptyMessage="No providers available."
            triggerClassName="h-7 text-xs"
          />
          {modelOptions.length > 0 ? (
            <SearchableSelect
              selectedId={spec.model}
              value={
                modelOptions.find((option) => option.id === spec.model)
                  ?.label ?? 'Default model'
              }
              items={modelOptions}
              onChange={(id) => onSpawnChange({ model: id, effort: null })}
              disabled={busy}
              searchPlaceholder="Search models…"
              emptyMessage="No models for this provider."
              triggerClassName="h-7 text-xs"
            />
          ) : null}
          {effortOptions.length > 0 ? (
            <SearchableSelect
              selectedId={spec.effort}
              value={
                effortOptions.find((option) => option.id === spec.effort)
                  ?.label ?? 'Default effort'
              }
              items={effortOptions}
              onChange={(id) => onSpawnChange({ effort: id })}
              disabled={busy}
              searchPlaceholder="Search effort…"
              emptyMessage="No effort levels for this model."
              triggerClassName="h-7 text-xs"
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
          <SearchableSelect
            selectedId={spec.projectId ?? GLOBAL_PROJECT_OPTION_ID}
            value={
              projectOptions.find(
                (option) =>
                  option.id === (spec.projectId ?? GLOBAL_PROJECT_OPTION_ID),
              )?.label ?? 'Pick a project'
            }
            items={projectOptions}
            onChange={(id) =>
              onSpawnChange({
                projectId: id === GLOBAL_PROJECT_OPTION_ID ? null : id,
              })
            }
            disabled={busy}
            searchPlaceholder="Search projects…"
            emptyMessage="No projects."
            triggerClassName="h-7 text-xs"
          />
          <Input
            value={spec.name}
            placeholder="Relayed session"
            aria-label="Name for the new session"
            disabled={busy}
            onChange={(event) => onSpawnChange({ name: event.target.value })}
            className="h-7 text-xs"
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          When {sourceName} finishes
        </label>
        <div
          role="group"
          aria-label="When this connection fires"
          className="flex flex-col gap-0.5"
        >
          {CONDITION_CHOICES.map((choice) => (
            <Button
              key={choice.value}
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={draft.condition.kind === choice.value}
              disabled={busy}
              onClick={() => onConditionKindChange(choice.value)}
              className={cn(
                'h-7 justify-start rounded-md px-2 text-[11px] font-normal',
                draft.condition.kind === choice.value
                  ? 'bg-white/10 text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {choice.label}
            </Button>
          ))}
        </div>
        {draft.condition.kind === 'token' ? (
          <>
            <Input
              value={draft.condition.token}
              placeholder="BATON: horse"
              aria-label="The final line this connection waits for"
              disabled={busy}
              onChange={(event) => onConditionTokenChange(event.target.value)}
              className="h-8 text-xs"
            />
            <p className="text-[10px] text-muted-foreground/70">
              Only this final line sends the reply to{' '}
              {recipientName ?? 'the recipient'}.
            </p>
          </>
        ) : (
          <p className="text-[10px] text-muted-foreground/70">
            Fires whenever {sourceName} finishes, whatever it says.
          </p>
        )}
      </div>

      {/* R8. Offered for a session recipient only: a spawn opens a
          conversation that has never been used, so there is nothing to keep,
          clear, or say first. */}
      {spawning ? null : (
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Before delivery
          </label>
          <div
            role="group"
            aria-label="What happens before the reply is delivered"
            className="flex flex-col gap-0.5"
          >
            {beforeDelivery.map((option) => (
              <Button
                key={option.mode}
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={draft.beforeDelivery === option.mode}
                // Shown DISABLED with its reason rather than hidden: a control
                // that vanishes teaches nothing, and the person is left
                // wondering whether Convergence forgot the feature.
                disabled={busy || option.disabled}
                title={option.disabled ? option.help : undefined}
                onClick={() => onBeforeDeliveryChange(option.mode)}
                className={cn(
                  'h-7 justify-start rounded-md px-2 text-[11px] font-normal',
                  draft.beforeDelivery === option.mode
                    ? 'bg-white/10 text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {option.label}
              </Button>
            ))}
          </div>
          {draft.beforeDelivery === 'custom' ? (
            <Input
              value={draft.customOpener}
              placeholder="/clear"
              aria-label="The first message, sent on its own"
              disabled={busy}
              onChange={(event) => onCustomOpenerChange(event.target.value)}
              className="h-8 text-xs"
            />
          ) : null}
          <p className="text-[10px] text-muted-foreground/70">
            {activeBeforeDelivery?.help ?? ''}
          </p>
          {customOpenerNote ? (
            <p className="text-[10px] text-amber-400/80">{customOpenerNote}</p>
          ) : null}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label
          htmlFor="connection-instructions"
          className="text-[11px] uppercase tracking-wide text-muted-foreground"
        >
          Standing instructions
        </label>
        <Textarea
          id="connection-instructions"
          value={draft.instructions}
          placeholder="Implement the brief. Return your result and verification evidence."
          disabled={busy}
          rows={4}
          onChange={(event) => onInstructionsChange(event.target.value)}
          className="min-h-[5rem] text-xs"
        />
        <p className="text-[10px] text-muted-foreground/70">
          {recipientName ?? 'The recipient'} receives {sourceName}’s full last
          response with these instructions.
        </p>
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <p className="min-h-[1rem] text-[11px] text-amber-400">
          {problem ?? ''}
        </p>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy || problem !== null || (!isNew && !dirty)}
            onClick={onSave}
            className="h-8 px-3 text-[11px]"
          >
            {saveError ? 'Try again' : 'Save changes'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={onCancel}
            className="h-8 px-3 text-[11px]"
          >
            {saveError ? 'Discard changes' : 'Cancel'}
          </Button>
        </div>
        {saveError ? (
          <p className="text-[10px] text-muted-foreground/70">
            Trying again saves settings. It does not resend a message.
          </p>
        ) : null}
        {isNew ? null : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={onDelete}
            className="h-7 self-start px-0 text-[11px] text-muted-foreground hover:text-red-400"
          >
            Delete connection
          </Button>
        )}
      </div>
    </section>
  )
}
