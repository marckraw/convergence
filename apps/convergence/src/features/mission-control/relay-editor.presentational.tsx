import type { FC } from 'react'
import { ArrowRight } from 'lucide-react'
import { ProviderAccountPicker } from '@/entities/provider-account'
import type { ProviderAccount } from '@/entities/provider-account'
import type { RelayAction } from '@/entities/session-relay'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { SearchableSelect } from '@/shared/ui/searchable-select.container'
import { Textarea } from '@/shared/ui/textarea'
import type {
  RelayEndpointOption,
  RelaySpawnDraft,
} from './relay-sentence.pure'

interface RelayEditorProps {
  options: RelayEndpointOption[]
  action: RelayAction
  sourceSessionId: string | null
  targetSessionId: string | null
  /** The standing brief this wire prepends; empty carries the message alone. */
  instruction: string
  /** The first send, ahead of the payload; empty delivers straight away. */
  opener: string
  /**
   * The line the source's last message must end with; empty fires on any
   * finish, which is what every wire drawn before conditions did.
   */
  conditionToken: string
  /**
   * The convention this wire's condition would be pre-filled with, or null
   * when nothing here has a baton name yet. Offered as a button rather than
   * typed in for the user: the pre-fill is the whole point of naming members.
   */
  suggestedConditionToken: string | null
  spawn: RelaySpawnDraft
  /** Projects a spawned session can open in; the global option is added here. */
  projectOptions: RelayEndpointOption[]
  providerOptions: RelayEndpointOption[]
  modelOptions: RelayEndpointOption[]
  effortOptions: RelayEndpointOption[]
  /** Enrolled accounts for the chosen provider; empty hides the picker. */
  spawnAccounts: ProviderAccount[]
  /** Why this cannot be saved yet, or null when it is ready. */
  problem: string | null
  busy?: boolean
  editing: boolean
  onActionChange: (action: RelayAction) => void
  onSourceChange: (sessionId: string) => void
  onTargetChange: (sessionId: string) => void
  onInstructionChange: (instruction: string) => void
  onOpenerChange: (opener: string) => void
  onConditionTokenChange: (conditionToken: string) => void
  onSpawnChange: (patch: Partial<RelaySpawnDraft>) => void
  onSave: () => void
  onCancel: () => void
}

/** The id the project picker uses for "no project at all". */
export const GLOBAL_PROJECT_OPTION_ID = '__global__'

function labelFor(
  options: RelayEndpointOption[],
  id: string | null,
  placeholder: string,
): string {
  if (!id) return placeholder
  return options.find((option) => option.id === id)?.label ?? placeholder
}

const ACTIONS: { value: RelayAction; label: string }[] = [
  { value: 'hail', label: 'send to a session' },
  { value: 'spawn', label: 'start a new session' },
]

/**
 * The authoring form, laid out as the sentence it will become.
 *
 * The action switch sits mid-sentence because it changes what the rest of the
 * sentence says: a hail names an existing session, a spawn describes one that
 * does not exist yet.
 */
export const RelayEditor: FC<RelayEditorProps> = ({
  options,
  action,
  sourceSessionId,
  targetSessionId,
  instruction,
  opener,
  conditionToken,
  suggestedConditionToken,
  spawn,
  projectOptions,
  providerOptions,
  modelOptions,
  effortOptions,
  spawnAccounts,
  problem,
  busy = false,
  editing,
  onActionChange,
  onSourceChange,
  onTargetChange,
  onInstructionChange,
  onOpenerChange,
  onConditionTokenChange,
  onSpawnChange,
  onSave,
  onCancel,
}) => (
  <div className="flex flex-col gap-2 rounded-md border border-white/15 bg-white/[0.02] px-2 py-2">
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
      <span>When</span>
      <SearchableSelect
        selectedId={sourceSessionId}
        value={labelFor(options, sourceSessionId, 'pick a session')}
        items={options}
        onChange={onSourceChange}
        disabled={busy}
        searchPlaceholder="Search this crew…"
        emptyMessage="No sessions in this crew."
        triggerClassName="h-7 text-xs"
      />
      <span>finishes</span>
      <ArrowRight aria-hidden className="size-3" />

      <div
        role="group"
        aria-label="What this relay does"
        className="flex items-center gap-0.5 rounded-full border border-white/10 p-0.5"
      >
        {ACTIONS.map((entry) => (
          <Button
            key={entry.value}
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={action === entry.value}
            disabled={busy}
            onClick={() => onActionChange(entry.value)}
            className={cn(
              'h-6 rounded-full px-2 text-[11px] font-normal',
              action === entry.value
                ? 'bg-white/10 text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {entry.label}
          </Button>
        ))}
      </div>

      {action === 'hail' ? (
        <SearchableSelect
          selectedId={targetSessionId}
          value={labelFor(options, targetSessionId, 'pick a session')}
          items={options}
          onChange={onTargetChange}
          disabled={busy}
          searchPlaceholder="Search this crew…"
          emptyMessage="No sessions in this crew."
          triggerClassName="h-7 text-xs"
        />
      ) : null}
    </div>

    {action === 'spawn' ? (
      <div className="flex flex-wrap items-center gap-1.5 pl-3 text-[11px] text-muted-foreground">
        <span>using</span>
        <SearchableSelect
          selectedId={spawn.providerId}
          value={labelFor(providerOptions, spawn.providerId, 'pick a provider')}
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
            selectedId={spawn.model}
            value={labelFor(modelOptions, spawn.model, 'default model')}
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
            selectedId={spawn.effort}
            value={labelFor(effortOptions, spawn.effort, 'default effort')}
            items={effortOptions}
            onChange={(id) => onSpawnChange({ effort: id })}
            disabled={busy}
            searchPlaceholder="Search effort…"
            emptyMessage="No effort levels for this model."
            triggerClassName="h-7 text-xs"
          />
        ) : null}
        {/* The same picker the composer uses. A spawned session's account is
            fixed the moment it starts, so this is the only chance to choose. */}
        <ProviderAccountPicker
          accounts={spawnAccounts}
          selectedAccountId={spawn.providerAccountId}
          onChange={(providerAccountId) => onSpawnChange({ providerAccountId })}
          disabled={busy}
        />
        <span>in</span>
        <SearchableSelect
          selectedId={spawn.projectId ?? GLOBAL_PROJECT_OPTION_ID}
          value={labelFor(
            projectOptions,
            spawn.projectId ?? GLOBAL_PROJECT_OPTION_ID,
            'pick a project',
          )}
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
        <span>called</span>
        <Input
          value={spawn.name}
          placeholder="Relayed session"
          aria-label="Name for the new session"
          disabled={busy}
          onChange={(event) => onSpawnChange({ name: event.target.value })}
          className="h-7 w-40 text-xs"
        />
      </div>
    ) : null}

    {/* Offered for both actions and placed above everything the wire carries,
        because it answers a different question: not what is sent, but whether
        anything is. Empty is the honest default -- a wire with no condition
        fires on any finish, exactly as every wire did before batons. */}
    <div className="flex flex-col gap-1 pl-3">
      <label
        htmlFor="relay-condition"
        className="text-[11px] text-muted-foreground"
      >
        Only when the last message ends with (optional)
      </label>
      <div className="flex items-center gap-1.5">
        <Input
          id="relay-condition"
          value={conditionToken}
          placeholder="fires on any finish"
          disabled={busy}
          onChange={(event) => onConditionTokenChange(event.target.value)}
          className="h-7 text-xs"
        />
        {suggestedConditionToken &&
        suggestedConditionToken !== conditionToken ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onConditionTokenChange(suggestedConditionToken)}
            className="h-7 shrink-0 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Use {suggestedConditionToken}
          </Button>
        ) : null}
      </div>
      <p className="text-[10px] text-muted-foreground/70">
        The finishing station declares its own route on the last line. Leave
        this empty and the wire fires whenever the source finishes.
      </p>
    </div>

    {/* Hail only. A spawn opens a session that has never been used, so there
        is nothing for a first send to reset -- offering the box there would
        invite a wire that quietly does nothing. */}
    {action === 'hail' ? (
      <div className="flex flex-col gap-1 pl-3">
        <label
          htmlFor="relay-opener"
          className="text-[11px] text-muted-foreground"
        >
          First send (optional) — sent on its own, before the message
        </label>
        <Input
          id="relay-opener"
          value={opener}
          placeholder="/clear"
          disabled={busy}
          onChange={(event) => onOpenerChange(event.target.value)}
          className="h-7 text-xs"
        />
        <p className="text-[10px] text-muted-foreground/70">
          e.g. /clear to reset the target before delivering. The message waits
          until this one has been answered.
        </p>
      </div>
    ) : null}

    {/* Offered for both actions: a brief is about what the far end should do
        with the message, which is the same question whether that end already
        exists or is about to. */}
    <div className="flex flex-col gap-1 pl-3">
      <label
        htmlFor="relay-instruction"
        className="text-[11px] text-muted-foreground"
      >
        Instructions (optional) — sent above the message
      </label>
      <Textarea
        id="relay-instruction"
        value={instruction}
        placeholder="Take a look at this and tell me what you would change."
        disabled={busy}
        rows={2}
        onChange={(event) => onInstructionChange(event.target.value)}
        className="min-h-[3.5rem] text-xs"
      />
    </div>

    <div className="flex items-center justify-between gap-2">
      <p className="text-[11px] text-amber-400">{problem ?? ' '}</p>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={onCancel}
          className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy || problem !== null}
          onClick={onSave}
          className="h-7 px-2 text-[11px]"
        >
          {editing ? 'Save wire' : 'Draw wire'}
        </Button>
      </div>
    </div>
  </div>
)
