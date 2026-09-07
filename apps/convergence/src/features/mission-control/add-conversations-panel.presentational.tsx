import type { FC } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { SearchableSelect } from '@/shared/ui/searchable-select.container'
import type { RelayEndpointOption } from './relay-sentence.pure'

/** One conversation offered to a crew, with the line that identifies it. */
export interface AddableConversation {
  sessionId: string
  name: string
  /** "Claude Code · Opus 5 · convergence", already assembled. */
  detail: string
}

interface AddConversationsPanelProps {
  crewName: string
  query: string
  onQueryChange: (query: string) => void
  projectOptions: RelayEndpointOption[]
  selectedProjectId: string | null
  onProjectChange: (projectId: string | null) => void
  /** Conversations not already in this crew, filtered. */
  available: readonly AddableConversation[]
  selectedIds: readonly string[]
  onToggle: (sessionId: string) => void
  /** The names already in the crew, for the reassuring line at the bottom. */
  alreadyInCrew: readonly string[]
  busy: boolean
  onAdd: () => void
  onClose: () => void
}

/** The id the project picker uses for "any project". */
export const ANY_PROJECT_OPTION_ID = '__any__'

/**
 * Bringing existing conversations into a crew.
 *
 * The promise this panel exists to keep (promise 1): **adding a conversation
 * to a crew changes nothing about the conversation.** Its transcript, its
 * model, its account and its project are its own; membership is a label, and
 * a conversation can leave a crew without anything happening to it. The panel
 * says so at the bottom rather than leaving it to be discovered.
 */
export const AddConversationsPanel: FC<AddConversationsPanelProps> = ({
  crewName,
  query,
  onQueryChange,
  projectOptions,
  selectedProjectId,
  onProjectChange,
  available,
  selectedIds,
  onToggle,
  alreadyInCrew,
  busy,
  onAdd,
  onClose,
}) => (
  <section
    data-add-conversations-panel
    aria-label="Add conversations"
    className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto border-l border-white/10 px-4 py-3"
  >
    <div className="flex items-start justify-between gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-medium">Add conversations</h3>
        <p className="text-[11px] text-muted-foreground">
          Bring existing conversations into {crewName}.
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Close the add conversations panel"
        onClick={onClose}
        className="size-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
      >
        <X className="size-3.5" />
      </Button>
    </div>

    <Input
      type="search"
      value={query}
      placeholder="Search conversations…"
      aria-label="Search conversations to add"
      disabled={busy}
      onChange={(event) => onQueryChange(event.target.value)}
      className="h-8 text-xs"
    />

    <SearchableSelect
      selectedId={selectedProjectId ?? ANY_PROJECT_OPTION_ID}
      value={
        projectOptions.find(
          (option) =>
            option.id === (selectedProjectId ?? ANY_PROJECT_OPTION_ID),
        )?.label ?? 'All projects'
      }
      items={projectOptions}
      onChange={(id) =>
        onProjectChange(id === ANY_PROJECT_OPTION_ID ? null : id)
      }
      disabled={busy}
      searchPlaceholder="Search projects…"
      emptyMessage="No projects."
      triggerClassName="h-8 text-xs"
    />

    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
      Available conversations
    </p>

    {available.length === 0 ? (
      <p className="text-[11px] text-muted-foreground">
        {query.trim() || selectedProjectId
          ? 'No conversations match this search.'
          : 'Every conversation is already in this crew.'}
      </p>
    ) : (
      <ul className="flex flex-col gap-1">
        {available.map((entry) => {
          const selected = selectedIds.includes(entry.sessionId)
          return (
            <li key={entry.sessionId}>
              <Button
                type="button"
                variant="ghost"
                aria-pressed={selected}
                disabled={busy}
                onClick={() => onToggle(entry.sessionId)}
                className={cn(
                  'flex h-auto w-full flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left font-normal',
                  selected
                    ? 'border-sky-500/60 bg-sky-500/5'
                    : 'border-white/10 hover:border-white/20',
                )}
              >
                <span className="text-[12px]">{entry.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {entry.detail}
                </span>
              </Button>
            </li>
          )
        })}
      </ul>
    )}

    {alreadyInCrew.length > 0 ? (
      <p className="text-[10px] text-muted-foreground/70">
        Already in this crew: {alreadyInCrew.join(', ')}.
      </p>
    ) : null}

    <div className="mt-auto flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy || selectedIds.length === 0}
          onClick={onAdd}
          className="h-8 px-3 text-[11px]"
        >
          {selectedIds.length === 1
            ? 'Add 1 conversation'
            : `Add ${selectedIds.length} conversations`}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={onClose}
          className="h-8 px-3 text-[11px]"
        >
          Cancel
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground/70">
        Their history and model settings stay with them. Add connections after
        adding a conversation.
      </p>
    </div>
  </section>
)
