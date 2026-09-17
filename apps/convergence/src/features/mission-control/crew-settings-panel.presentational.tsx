import type { FC } from 'react'
import {
  ChevronDown,
  FlaskConical,
  MessageSquare,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import {
  memberKey,
  type CrewMemberRef,
  type SeatDraftField,
  type SessionCrewMember,
} from '@/entities/session-crew'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { flowRunCeilingNote } from './crew-loop.pure'
import { formatCrewMemberCount } from './session-crew-groups.pure'
import { CrewDecorationPicker } from './crew-decoration-picker.presentational'
import {
  hostLabel,
  isLocalHost,
  seatHostId,
  seatSourceLabel,
  type SeatHostOption,
  type SeatPatch,
  type SeatRefusalField,
} from './seat-display.pure'
import { groupSeats, offersSeatSearch } from './seat-groups.pure'
import { SeatEditor } from './seat-editor.presentational'
import type { SeatFact } from './seat-facts.presentational'
import { SeatRow } from './seat-row.presentational'

interface CrewSettingsPanelProps {
  emoji: string | null
  accentColor: string | null
  onEmojiChange: (emoji: string | null) => void
  onAccentColorChange: (accentColor: string | null) => void
  memberCount: number
  includePositions: boolean
  lastExportPath?: string | null
  exporting: boolean
  confirmingDelete: boolean
  onIncludePositionsChange: (include: boolean) => void
  onExport: () => void
  onRequestDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
  updateError: string | null
  savedName: string
  crewName: string
  members: readonly SessionCrewMember[]
  resolveName: (sessionId: string) => string | null
  deliveryLimit: number | null
  attentionMinutes: number | null
  defaultDeliveryLimit: number
  defaultAttentionMinutes: number
  busy: boolean
  /**
   * True while at least one of this crew's runs is still moving (R7).
   *
   * The panel SAYS this rather than locking anything. The engine reads a
   * source's wires at settle time, so a saved edit applies from the next
   * delivery and can never rewrite a hop already recorded — there is nothing
   * here a lock would protect. What was missing was the sentence.
   */
  running: boolean
  /** The refusal a member's door gave, and which member it was about. */
  /**
   * The door's refusals, per seat and per field (MAR-3118 lap 2, B): two
   * commits from one switch -- a card and a name -- each keep their sentence.
   */
  seatProblems: Record<string, Partial<Record<SeatRefusalField, string>>>
  /** What is being typed, per member, until they finish. */
  batonNameDrafts: Record<string, string>
  /**
   * What is being typed in a seat's free-text fields, per member and field
   * (MAR-3083 lap 2, G). These fields cannot be uncontrolled: the container
   * reloads every crew after any seat edit and on every `crew:updated`
   * broadcast, so a value-derived `key` remounted the field mid-typing and
   * editing one member wiped another's draft. Same shape as the baton name's
   * drafts beside them.
   */
  seatDrafts: Record<string, Partial<Record<SeatDraftField, string>>>
  /** The host a resident seat's conversation actually runs on, if known. */
  resolveHost: (sessionId: string) => string | null
  onCrewNameChange: (name: string) => void
  onBatonNameEdit: (memberKey: string, batonName: string) => void
  /** What a seat IS, one field at a time (MAR-3083 R6). */
  onSeatEdit: (member: CrewMemberRef, patch: SeatPatch) => void
  onSeatDraftEdit: (
    memberKey: string,
    field: SeatDraftField,
    value: string,
  ) => void
  onSeatDraftCommit: (member: CrewMemberRef, field: SeatDraftField) => void
  onBatonNameCommit: (sessionId: string) => void
  onDeliveryLimitChange: (limit: number | null) => void
  onAttentionMinutesChange: (minutes: number | null) => void
  onAddConversation: () => void
  onRemoveMember: (member: CrewMemberRef) => void
  onClose: () => void
  /** The one seat whose editor is open, by member key (R2). */
  openSeatKey: string | null
  onToggleSeat: (key: string) => void
  /** What is typed in "Find a seat", shown at 8+ seats (R6). */
  seatQuery: string
  onSeatQueryChange: (query: string) => void
  /** Whether "Add ▾" is showing its two entries (R9). */
  addMenuOpen: boolean
  onAddMenuToggle: () => void
  /** This Mac and every execution-host endpoint, by id and label. */
  hostOptions: readonly SeatHostOption[]
  resolveProviderName: (providerId: string) => string | null
  onOpenConversation: (sessionId: string) => void
}

/**
 * An empty box means the default, and the placeholder says what the default
 * is — a blank field that silently meant twelve would be a setting nobody
 * could read.
 */
function readLimit(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * The crew itself: its name, who is in it, what they answer to, and the two
 * limits that end a runaway run.
 *
 * The words are the design's and the meanings are R4's: the delivery limit
 * counts every delivery of this crew in the RUN, across every lap, so
 * returning to the first station refills nothing; the minutes watch for a
 * REPLY that is owed, not for how long a run has been going. Both sentences
 * are on the panel because both were mis-readable before.
 */
export const CrewSettingsPanel: FC<CrewSettingsPanelProps> = ({
  emoji,
  accentColor,
  onEmojiChange,
  onAccentColorChange,
  memberCount,
  includePositions,
  lastExportPath,
  exporting,
  confirmingDelete,
  onIncludePositionsChange,
  onExport,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
  updateError,
  savedName,
  crewName,
  members,
  resolveName,
  deliveryLimit,
  attentionMinutes,
  defaultDeliveryLimit,
  defaultAttentionMinutes,
  busy,
  running,
  seatProblems,
  batonNameDrafts,
  onCrewNameChange,
  onBatonNameEdit,
  onSeatEdit,
  onSeatDraftEdit,
  onSeatDraftCommit,
  seatDrafts,
  resolveHost,
  onBatonNameCommit,
  onDeliveryLimitChange,
  onAttentionMinutesChange,
  onAddConversation,
  onRemoveMember,
  onClose,
  openSeatKey,
  onToggleSeat,
  seatQuery,
  onSeatQueryChange,
  addMenuOpen,
  onAddMenuToggle,
  hostOptions,
  resolveProviderName,
  onOpenConversation,
}) => {
  const hostIdOf = (member: SessionCrewMember) =>
    seatHostId(member, member.sessionId ? resolveHost(member.sessionId) : null)
  const groups = groupSeats(members, {
    query: seatQuery,
    hostLabel: (member) => hostLabel(hostIdOf(member), hostOptions),
  })

  const factsFor = (member: SessionCrewMember): SeatFact[] => {
    if (member.sessionId === null) {
      const provider = member.providerId
        ? (resolveProviderName(member.providerId) ?? member.providerId)
        : 'No provider'
      return [
        { term: 'Kind', value: 'Recipe — spawned on demand' },
        {
          term: 'Provider',
          value: member.model ? `${provider} · ${member.model}` : provider,
        },
        { term: 'Conversation', value: 'None — one is spawned per run' },
      ]
    }
    const sessionId = member.sessionId
    const title = resolveName(sessionId) ?? 'a conversation'
    return [
      { term: 'Kind', value: 'Resident — a conversation' },
      {
        term: 'Conversation',
        value: title,
        open: {
          label: `Open ${title}`,
          onOpen: () => onOpenConversation(sessionId),
        },
      },
      { term: 'Host', value: hostLabel(hostIdOf(member), hostOptions) },
    ]
  }

  const renderSeat = (member: SessionCrewMember) => {
    const key = memberKey(member)
    // A recipe has no conversation, so it is named -- and addressed -- by its
    // baton name (MAR-3083 R3/C).
    const ref: CrewMemberRef = member.sessionId
      ? { sessionId: member.sessionId }
      : { batonName: member.batonName ?? '' }
    const hostId = hostIdOf(member)
    const source = seatSourceLabel(
      member,
      member.sessionId ? resolveName(member.sessionId) : null,
    )
    const open = openSeatKey === key
    return (
      <li key={key} className="flex flex-col">
        {open ? (
          <SeatEditor
            member={member}
            nameValue={batonNameDrafts[key] ?? member.batonName ?? ''}
            cardDraft={seatDrafts[key]?.roleCard}
            wipValue={seatDrafts[key]?.wipLimit ?? String(member.wipLimit)}
            facts={factsFor(member)}
            factsHeading={
              member.sessionId === null
                ? 'Facts · the recipe'
                : 'Facts · from the conversation'
            }
            hostOptions={hostOptions}
            problems={seatProblems[key] ?? {}}
            busy={busy}
            onNameChange={(value) => onBatonNameEdit(key, value)}
            onNameCommit={() => onBatonNameCommit(key)}
            onCardChange={(value) => onSeatDraftEdit(key, 'roleCard', value)}
            onCardCommit={() => onSeatDraftCommit(ref, 'roleCard')}
            onWriteCard={() => onSeatDraftEdit(key, 'roleCard', '')}
            onWipChange={(value) => onSeatDraftEdit(key, 'wipLimit', value)}
            onWipCommit={() => onSeatDraftCommit(ref, 'wipLimit')}
            onSeatEdit={(patch) => onSeatEdit(ref, patch)}
            onClose={() => onToggleSeat(key)}
            onRemove={() => onRemoveMember(ref)}
          />
        ) : (
          <SeatRow
            member={member}
            source={source}
            host={hostLabel(hostId, hostOptions)}
            hostIsLocal={isLocalHost(hostId)}
            refused={Object.keys(seatProblems[key] ?? {}).length > 0}
            onToggle={() => onToggleSeat(key)}
          />
        )}
      </li>
    )
  }

  // `inMenu`: only the menu's copy carries menu roles (lap 2, F1).
  const addActions = (inMenu: boolean) => (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        role={inMenu ? 'menuitem' : undefined}
        disabled={busy}
        onClick={onAddConversation}
        className="h-7 gap-1.5 px-2.5 text-[11px]"
      >
        <MessageSquare aria-hidden className="size-3.5" />
        Add conversation…
      </Button>
      {/* R9: present, and honest that it is not built yet. */}
      <span title="Coming with MAR-3099" className="inline-flex">
        <Button
          type="button"
          variant="outline"
          size="sm"
          role={inMenu ? 'menuitem' : undefined}
          disabled
          aria-description="Coming with MAR-3099"
          className="h-7 gap-1.5 px-2.5 text-[11px]"
        >
          <FlaskConical aria-hidden className="size-3.5" />
          New recipe
        </Button>
      </span>
    </>
  )

  return (
    <section
      data-crew-settings-panel
      aria-label="Crew settings"
      className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto border-l border-white/10 px-4 py-3"
    >
      <header data-crew-settings-header className="flex items-start gap-2">
        <span
          aria-hidden
          className="mt-1 size-3 shrink-0 rounded-sm"
          style={{ backgroundColor: accentColor ?? 'rgb(148 163 184)' }}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="truncate text-sm font-medium">{savedName}</h3>
          <p className="text-[11px] text-muted-foreground">Crew settings</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Close crew settings"
          onClick={onClose}
          className="size-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </Button>
      </header>

      {updateError ? (
        <p role="alert" className="text-xs text-destructive">
          {updateError}
        </p>
      ) : null}

      <section
        aria-label="Seats"
        data-crew-seats
        className="flex flex-col gap-2"
      >
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-medium">
            Seats{' '}
            <span className="font-normal text-muted-foreground">
              {members.length}
            </span>
          </h4>
          {/* An empty crew shows both add actions in its own state, so it
              has no menu and no menu button (MAR-3118 lap 3, C2). */}
          {members.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-haspopup="menu"
              aria-expanded={addMenuOpen}
              disabled={busy}
              onClick={onAddMenuToggle}
              className="h-7 gap-1 px-2 text-[11px]"
            >
              <Plus aria-hidden className="size-3.5" />
              Add
              <ChevronDown aria-hidden className="size-3.5" />
            </Button>
          ) : null}
        </div>
        {/* One set of add actions (lap 2, F1): an empty crew already shows
            both in its own state, so the menu does not repeat them. */}
        {addMenuOpen && members.length > 0 ? (
          <div
            role="menu"
            aria-label="Add a seat"
            className="flex flex-wrap gap-1.5 rounded-md border border-white/10 bg-white/[0.02] p-1.5"
          >
            {addActions(true)}
          </div>
        ) : null}

        {offersSeatSearch(members.length) ? (
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={seatQuery}
              placeholder="Find a seat by name, role or host"
              aria-label="Find a seat by name, role or host"
              onChange={(event) => onSeatQueryChange(event.target.value)}
              className="h-8 pl-7 text-xs"
            />
          </div>
        ) : null}

        {members.length === 0 ? (
          <div
            data-crew-no-seats
            className="flex flex-col gap-2 rounded-md border border-dashed border-white/15 p-3"
          >
            <p className="text-xs font-medium">No seats yet</p>
            <p className="text-[11px] text-muted-foreground">
              A seat is a conversation that lives in this crew, or a recipe the
              crew spawns when a wire reaches it. Seat the mastermind first —
              wires need somewhere to leave from.
            </p>
            <div className="flex flex-wrap gap-1.5">{addActions(false)}</div>
          </div>
        ) : (
          groups.map((group) => (
            <section
              key={group.role}
              aria-label={`${group.title} ${group.count}`}
              data-seat-group={group.role}
              className="flex flex-col gap-1"
            >
              <h5 className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {group.title} {group.count}
              </h5>
              <ul className="flex flex-col gap-1">
                {group.members.map(renderSeat)}
              </ul>
            </section>
          ))
        )}
      </section>

      <details
        data-crew-details
        className="group border-t border-white/10 pt-2"
      >
        <summary className="cursor-pointer list-none text-[11px] text-muted-foreground hover:text-foreground">
          Crew details — name, decoration, loop limits, export
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="crew-name"
              className="text-[11px] uppercase tracking-wide text-muted-foreground"
            >
              Crew name
            </label>
            <Input
              id="crew-name"
              value={crewName}
              disabled={busy}
              onChange={(event) => onCrewNameChange(event.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <section aria-label="Decoration" className="flex flex-col gap-1.5">
            <h4 className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Decoration
            </h4>
            <CrewDecorationPicker
              emoji={emoji}
              accentColor={accentColor}
              onEmojiChange={onEmojiChange}
              onAccentColorChange={onAccentColorChange}
            />
          </section>

          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Loop limits
            </p>
            <div className="flex items-center gap-2">
              <label
                htmlFor="crew-delivery-limit"
                className="flex-1 text-[11px] text-muted-foreground"
              >
                Delivery limit
              </label>
              <Input
                id="crew-delivery-limit"
                type="number"
                min={1}
                value={deliveryLimit ?? ''}
                placeholder={String(defaultDeliveryLimit)}
                aria-label="Delivery limit per run for this crew"
                disabled={busy}
                onChange={(event) =>
                  onDeliveryLimitChange(readLimit(event.target.value))
                }
                className="h-7 w-16 text-xs"
              />
              <span className="text-[11px] text-muted-foreground">per run</span>
            </div>
            <p className="text-[10px] text-muted-foreground/70">
              {flowRunCeilingNote(deliveryLimit ?? defaultDeliveryLimit)}
            </p>
            <div className="flex items-center gap-2">
              <label
                htmlFor="crew-attention-minutes"
                className="flex-1 text-[11px] text-muted-foreground"
              >
                Ask for attention after
              </label>
              <Input
                id="crew-attention-minutes"
                type="number"
                min={1}
                value={attentionMinutes ?? ''}
                placeholder={String(defaultAttentionMinutes)}
                aria-label="Minutes without a reply before this crew asks for attention"
                disabled={busy}
                onChange={(event) =>
                  onAttentionMinutesChange(readLimit(event.target.value))
                }
                className="h-7 w-16 text-xs"
              />
              <span className="text-[11px] text-muted-foreground">minutes</span>
            </div>
            <p className="text-[10px] text-muted-foreground/70">
              The timer watches for a reply still owed. It is not a total
              run-duration limit.
            </p>
          </div>

          <section
            aria-label="Recipe"
            className="flex flex-col gap-2 border-t border-white/10 pt-2"
          >
            <h4 className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Recipe
            </h4>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Input
                type="checkbox"
                className="size-3.5 rounded-sm p-0"
                checked={includePositions}
                disabled={exporting}
                onChange={(event) =>
                  onIncludePositionsChange(event.target.checked)
                }
              />
              Include positions
            </label>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 text-xs"
              disabled={exporting}
              onClick={onExport}
            >
              {exporting ? 'Exporting…' : 'Export crew…'}
            </Button>
            {lastExportPath ? (
              <p
                className="truncate text-[11px] text-muted-foreground"
                title={lastExportPath}
              >
                Last exported to …/
                {lastExportPath.split('/').filter(Boolean).slice(-2).join('/')}
              </p>
            ) : null}
          </section>
          <section
            aria-label="Danger"
            className="border-t border-white/10 pt-2"
          >
            <h4 className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Danger
            </h4>
            {confirmingDelete ? (
              <div className="flex flex-col gap-2">
                <p className="text-[11px] text-muted-foreground">
                  Delete “{savedName}” with {formatCrewMemberCount(memberCount)}
                  ? Only the crew disappears; the conversations stay exactly
                  where they are.
                </p>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="h-7 flex-1 text-xs"
                    disabled={busy}
                    onClick={onConfirmDelete}
                  >
                    Delete crew
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={busy}
                    onClick={onCancelDelete}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-full justify-start gap-1.5 px-2 text-xs font-normal text-destructive hover:text-destructive"
                onClick={onRequestDelete}
              >
                <Trash2 className="size-3.5" />
                Delete crew
              </Button>
            )}
          </section>

          <div className="flex flex-col gap-1 rounded-md border border-white/10 bg-white/[0.02] px-3 py-2">
            <p className="text-[11px] font-medium">
              A run can contain several laps
            </p>
            <p className="text-[10px] text-muted-foreground">
              Correction laps stay in the same run until a human handoff. The
              delivery limit spans all laps.
            </p>
          </div>

          {/* R7: says everything, enforces nothing. The engine reads a source's
            wires at settle time, so an edit saved now applies from the next
            delivery and cannot rewrite a hop already recorded. */}
          <p className="text-[10px] text-muted-foreground/70">
            {running
              ? 'Crew is running — changes apply from the next delivery.'
              : 'Crew is idle · settings can be edited.'}
          </p>
        </div>
      </details>

      <p className="text-[10px] text-muted-foreground/70">
        Removing a seat never deletes its conversation — it stays in Flat.
      </p>
    </section>
  )
}
