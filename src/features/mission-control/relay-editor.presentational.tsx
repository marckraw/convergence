import type { FC } from 'react'
import { ArrowRight } from 'lucide-react'
import { ProviderAccountPicker } from '@/entities/provider-account'
import type { ProviderAccount } from '@/entities/provider-account'
import type { RelayAction } from '@/entities/session-relay'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { SearchableSelect } from '@/shared/ui/searchable-select.container'
import type {
  RelayEndpointOption,
  RelaySpawnDraft,
} from './relay-sentence.pure'

interface RelayEditorProps {
  options: RelayEndpointOption[]
  action: RelayAction
  sourceSessionId: string | null
  targetSessionId: string | null
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
