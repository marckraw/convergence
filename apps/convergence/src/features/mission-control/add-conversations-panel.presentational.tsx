import type { FC } from 'react'
import { Users } from 'lucide-react'
import {
  Button,
  Card,
  CardAction,
  cn,
  Combobox,
  EmptyState,
  SearchField,
  SectionLabel,
} from '@convergence/ui'
import { InspectorHeader } from './inspector-header.presentational'
import { INSPECTOR_NOTE_CLASS, INSPECTOR_SHELL_CLASS } from './inspector.styles'
import { ROW_CARD_DOOR_CLASS, ROW_CARD_PICKED_CLASS } from './row-card.styles'
import type { RelayEndpointOption } from './relay-sentence.pure'
import { SeatRefusal } from './seat-refusal.presentational'

/** One conversation offered to a crew, with the line that identifies it. */
export interface AddableConversation {
  sessionId: string
  name: string
  /** "Claude Code · Opus 5 · convergence", already assembled. */
  detail: string
  /**
   * The other crew this conversation already sits in, if any (MAR-3118 R7):
   * one seat, one crew, said before anybody picks it.
   */
  inCrew?: string | null
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
  /**
   * The door's refusals of the last add, in its own words, and how many of
   * the attempt landed; the refused conversations stay selected (MAR-3118
   * lap 2, C).
   */
  refusal?: { sentences: string[]; added: number; attempted: number } | null
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
  refusal = null,
  onAdd,
  onClose,
}) => (
  <section
    data-add-conversations-panel
    aria-label="Add conversations"
    className={INSPECTOR_SHELL_CLASS}
  >
    <InspectorHeader
      title="Add conversations"
      subtitle={`Bring existing conversations into ${crewName}.`}
      closeLabel="Close the add conversations panel"
      onClose={onClose}
    />

    <SearchField
      size="md"
      value={query}
      placeholder="Search conversations…"
      aria-label="Search conversations to add"
      disabled={busy}
      onChange={(event) => onQueryChange(event.target.value)}
      onClear={() => onQueryChange('')}
    />

    <Combobox
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
    />

    <SectionLabel as="h4">Available conversations</SectionLabel>

    {available.length === 0 ? (
      // An empty list says so as every list does (MC-9), in the same words.
      <EmptyState
        size="compact"
        variant="plain"
        detail={
          query.trim() || selectedProjectId
            ? 'No conversations match this search.'
            : 'Every conversation is already in this crew.'
        }
      />
    ) : (
      <ul className="flex flex-col gap-1">
        {available.map((entry) => {
          const selected = selectedIds.includes(entry.sessionId)
          return (
            <li key={entry.sessionId}>
              <Card
                interactive
                padding="none"
                className={cn(
                  'has-disabled:opacity-50',
                  // R7: a picked row wears the selected fill, as History's do.
                  selected
                    ? ['border-hairline-strong', ROW_CARD_PICKED_CLASS]
                    : 'border-hairline hover:border-hairline-strong',
                )}
              >
                <CardAction
                  aria-pressed={selected}
                  disabled={busy}
                  onClick={() => onToggle(entry.sessionId)}
                  className={ROW_CARD_DOOR_CLASS}
                >
                  <span className="text-xs">{entry.name}</span>
                  {entry.inCrew ? (
                    <span className="flex items-center gap-1 text-3xs text-warning-ink">
                      <Users aria-hidden className="size-3" />
                      In crew “{entry.inCrew}”
                    </span>
                  ) : null}
                  <span className="text-3xs text-ink-muted">
                    {entry.detail}
                  </span>
                </CardAction>
              </Card>
            </li>
          )
        })}
      </ul>
    )}

    {refusal
      ? refusal.sentences.map((sentence, index) => (
          <SeatRefusal
            key={sentence}
            message={sentence}
            kept={
              index === refusal.sentences.length - 1
                ? `${refusal.added} of ${refusal.attempted} added; the refused ${
                    refusal.attempted - refusal.added === 1
                      ? 'conversation stays'
                      : 'conversations stay'
                  } selected.`
                : ''
            }
          />
        ))
      : null}

    {alreadyInCrew.length > 0 ? (
      <p className={INSPECTOR_NOTE_CLASS}>
        Already in this crew: {alreadyInCrew.join(', ')}.
      </p>
    ) : null}

    <div className="mt-auto flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="tonal"
          disabled={busy || selectedIds.length === 0}
          onClick={onAdd}
        >
          {selectedIds.length === 1
            ? 'Add 1 conversation'
            : `Add ${selectedIds.length} conversations`}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
      </div>
      <p className={INSPECTOR_NOTE_CLASS}>
        Their history and model settings stay with them. Add connections after
        adding a conversation.
      </p>
    </div>
  </section>
)
