import type { FC, ReactNode } from 'react'
import {
  ChevronDown,
  FlaskConical,
  MessageSquare,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  memberKey,
  type CrewMemberRef,
  type SeatDraftField,
  type SessionCrewMember,
} from '@/entities/session-crew'
import {
  Button,
  Checkbox,
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
  EmptyState,
  FormError,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Notice,
  SearchField,
  SectionLabel,
  sectionLabel,
  Tooltip,
} from '@convergence/ui'
import { flowRunCeilingNote } from './crew-loop.pure'
import { CrewMark } from './crew-mark.presentational'
import { InspectorHeader } from './inspector-header.presentational'
import {
  INSPECTOR_CHOICE_CLASS,
  INSPECTOR_NOTE_CLASS,
  INSPECTOR_SHELL_CLASS,
} from './inspector.styles'
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
  /** The tracker binding form, placed inside the crew details (MAR-3084). */
  trackerSection?: ReactNode
  emoji: string | null
  accentColor: string | null
  onEmojiChange: (emoji: string | null) => void
  onAccentColorChange: (accentColor: string | null) => void
  includePositions: boolean
  lastExportPath?: string | null
  exporting: boolean
  onIncludePositionsChange: (include: boolean) => void
  onExport: () => void
  /** Delete crew…: the container asks first, in ConfirmDialog (R5). */
  onRequestDelete: () => void
  updateError: string | null
  savedName: string
  crewName: string
  members: readonly SessionCrewMember[]
  resolveName: (sessionId: string) => string | null
  deliveryLimit: number | null
  attentionMinutes: number | null
  /**
   * Cap on an issue's laps for wave rows, or null for none (MAR-3149).
   * Empty box = none; placeholder suggests 6.
   */
  lapCap: number | null
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
  /**
   * The door's refusals, per seat and per field (MAR-3118 lap 2, B): two
   * commits from one switch -- a card and a name -- each keep their sentence.
   */
  seatProblems: Record<string, Partial<Record<SeatRefusalField, string>>>
  /** Non-refusal notices under a seat's baton name (MAR-3157). */
  seatNotices?: Record<string, string>
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
  onLapCapChange: (cap: number | null) => void
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
  trackerSection,
  emoji,
  accentColor,
  onEmojiChange,
  onAccentColorChange,
  includePositions,
  lastExportPath,
  exporting,
  onIncludePositionsChange,
  onExport,
  onRequestDelete,
  updateError,
  savedName,
  crewName,
  members,
  resolveName,
  deliveryLimit,
  attentionMinutes,
  lapCap,
  defaultDeliveryLimit,
  defaultAttentionMinutes,
  busy,
  running,
  seatProblems,
  seatNotices = {},
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
  onLapCapChange,
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
            lanePathValue={seatDrafts[key]?.lanePath ?? member.lanePath ?? ''}
            onLanePathChange={(value) =>
              onSeatDraftEdit(key, 'lanePath', value)
            }
            onLanePathCommit={() => onSeatDraftCommit(ref, 'lanePath')}
            wipValue={seatDrafts[key]?.wipLimit ?? String(member.wipLimit)}
            facts={factsFor(member)}
            factsHeading={
              member.sessionId === null
                ? 'Facts · the recipe'
                : 'Facts · from the conversation'
            }
            hostOptions={hostOptions}
            problems={seatProblems[key] ?? {}}
            nameNotice={seatNotices[key] ?? null}
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

  // An empty crew's own two add actions; with seats, the same two are the
  // "Add ▾" menu's items (lap 2, F1).
  const addActions = (
    <>
      <Button
        type="button"
        variant="secondary"
        disabled={busy}
        onClick={onAddConversation}
        size="sm"
        className="px-2.5 text-2xs"
      >
        <MessageSquare aria-hidden className="size-3.5" />
        Add conversation…
      </Button>
      {/* R9: present, and honest that it is not built yet; the reason is its
          tooltip and its description (R2), never a native title. */}
      <Button
        type="button"
        variant="secondary"
        disabledReason="Coming with MAR-3099"
        size="sm"
        className="px-2.5 text-2xs"
      >
        <FlaskConical aria-hidden className="size-3.5" />
        New recipe
      </Button>
    </>
  )

  return (
    <section
      data-crew-settings-panel
      aria-label="Crew settings"
      className={INSPECTOR_SHELL_CLASS}
    >
      <InspectorHeader
        data-crew-settings-header
        leading={
          <CrewMark
            crew={{ name: savedName, emoji, accentColor }}
            variant="swatch"
            className="mt-1"
          />
        }
        title={savedName}
        titleClassName="truncate"
        subtitle="Crew settings"
        closeLabel="Close crew settings"
        onClose={onClose}
      />

      <FormError>{updateError}</FormError>

      <section
        aria-label="Seats"
        data-crew-seats
        className="flex flex-col gap-2"
      >
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-medium">
            Seats{' '}
            <span className="font-normal text-ink-muted">{members.length}</span>
          </h4>
          {/* An empty crew shows both add actions in its own state, so it
              has no menu and no menu button (MAR-3118 lap 3, C2). With seats,
              "Add ▾" is a real Menu (MC-5): arrow keys, Escape, a click
              outside, the focus back on the button. */}
          {members.length > 0 ? (
            <Menu
              open={addMenuOpen}
              onOpenChange={(open) => {
                if (open !== addMenuOpen) onAddMenuToggle()
              }}
            >
              <MenuTrigger
                render={
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    size="sm"
                    className="gap-1 text-2xs"
                  />
                }
              >
                <Plus aria-hidden className="size-3.5" />
                Add
                <ChevronDown aria-hidden className="size-3.5" />
              </MenuTrigger>
              <MenuContent align="end">
                <MenuItem onClick={onAddConversation}>
                  <MessageSquare aria-hidden />
                  Add conversation…
                </MenuItem>
                {/* R9: present, and honest that it is not built yet. */}
                <Tooltip label="Coming with MAR-3099">
                  <MenuItem disabled aria-description="Coming with MAR-3099">
                    <FlaskConical aria-hidden />
                    New recipe
                  </MenuItem>
                </Tooltip>
              </MenuContent>
            </Menu>
          ) : null}
        </div>

        {offersSeatSearch(members.length) ? (
          <SearchField
            size="md"
            value={seatQuery}
            placeholder="Find a seat by name, role or host"
            aria-label="Find a seat by name, role or host"
            onChange={(event) => onSeatQueryChange(event.target.value)}
            onClear={() => onSeatQueryChange('')}
          />
        ) : null}

        {members.length === 0 ? (
          <EmptyState
            data-crew-no-seats
            variant="dashed"
            size="compact"
            className="items-start text-left"
            title="No seats yet"
            detail="A seat is a conversation that lives in this crew, or a recipe the crew spawns when a wire reaches it. Seat the mastermind first — wires need somewhere to leave from."
            action={addActions}
          />
        ) : (
          groups.map((group) => (
            <section
              key={group.role}
              aria-label={`${group.title} ${group.count}`}
              data-seat-group={group.role}
              className="flex flex-col gap-1"
            >
              <SectionLabel as="h4" className="text-3xs">
                {group.title} {group.count}
              </SectionLabel>
              <ul className="flex flex-col gap-1">
                {group.members.map(renderSeat)}
              </ul>
            </section>
          ))
        )}
      </section>

      {/* MC-31: one disclosure, with the chevron that says it opens. */}
      <Collapsible data-crew-details className="border-t border-hairline pt-2">
        <CollapsibleTrigger className="text-2xs text-ink-muted hover:text-ink">
          Crew details — name, decoration, loop limits, tracker, export
        </CollapsibleTrigger>
        <CollapsiblePanel keepMounted className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="crew-name" className={sectionLabel}>
              Crew name
            </label>
            <Input
              size="md"
              id="crew-name"
              value={crewName}
              disabled={busy}
              onChange={(event) => onCrewNameChange(event.target.value)}
              className="text-xs"
            />
          </div>

          <section aria-label="Decoration" className="flex flex-col gap-1.5">
            <SectionLabel as="h4">Decoration</SectionLabel>
            <CrewDecorationPicker
              emoji={emoji}
              accentColor={accentColor}
              onEmojiChange={onEmojiChange}
              onAccentColorChange={onAccentColorChange}
            />
          </section>

          <div className="flex flex-col gap-1.5">
            <SectionLabel as="h4">Loop limits</SectionLabel>
            <div className="flex items-center gap-2">
              <label
                htmlFor="crew-delivery-limit"
                className="flex-1 text-2xs text-ink-muted"
              >
                Delivery limit
              </label>
              <Input
                size="sm"
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
                className="w-16 text-xs"
              />
              <span className="text-2xs text-ink-muted">per run</span>
            </div>
            <p className={INSPECTOR_NOTE_CLASS}>
              {flowRunCeilingNote(deliveryLimit ?? defaultDeliveryLimit)}
            </p>
            <div className="flex items-center gap-2">
              <label
                htmlFor="crew-attention-minutes"
                className="flex-1 text-2xs text-ink-muted"
              >
                Ask for attention after
              </label>
              <Input
                size="sm"
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
                className="w-16 text-xs"
              />
              <span className="text-2xs text-ink-muted">minutes</span>
            </div>
            <p className={INSPECTOR_NOTE_CLASS}>
              The timer watches for a reply still owed. It is not a total
              run-duration limit.
            </p>
            <div className="flex items-center gap-2">
              <label
                htmlFor="crew-lap-cap"
                className="flex-1 text-2xs text-ink-muted"
              >
                Lap cap
              </label>
              <Input
                size="sm"
                id="crew-lap-cap"
                type="number"
                min={1}
                value={lapCap ?? ''}
                placeholder="6"
                aria-label="Lap cap for this crew"
                disabled={busy}
                onChange={(event) =>
                  onLapCapChange(readLimit(event.target.value))
                }
                className="w-16 text-xs"
              />
              <span className="text-2xs text-ink-muted">per issue</span>
            </div>
            <p className={INSPECTOR_NOTE_CLASS}>
              Shown on Loom as &ldquo;lap N of C&rdquo;. Empty means no cap on
              the row. Distinct from the delivery limit (hop budget).
            </p>
          </div>

          {trackerSection}

          <section
            aria-label="Recipe"
            className="flex flex-col gap-2 border-t border-hairline pt-2"
          >
            <SectionLabel as="h4">Recipe</SectionLabel>
            <label className={INSPECTOR_CHOICE_CLASS}>
              <Checkbox
                checked={includePositions}
                disabled={exporting}
                onCheckedChange={(checked) => onIncludePositionsChange(checked)}
              />
              Include positions
            </label>
            <Button
              type="button"
              variant="tonal"
              disabled={exporting}
              onClick={onExport}
              size="sm"
              className="px-3"
            >
              {exporting ? 'Exporting…' : 'Export crew…'}
            </Button>
            {lastExportPath ? (
              <Tooltip label={lastExportPath}>
                <p className="truncate text-2xs text-ink-muted">
                  Last exported to …/
                  {lastExportPath
                    .split('/')
                    .filter(Boolean)
                    .slice(-2)
                    .join('/')}
                </p>
              </Tooltip>
            ) : null}
          </section>
          <section
            aria-label="Danger"
            className="border-t border-hairline pt-2"
          >
            <SectionLabel as="h4">Danger</SectionLabel>
            <Button
              type="button"
              variant="danger-quiet"
              disabled={busy}
              onClick={onRequestDelete}
              size="sm"
              className="w-full justify-start font-normal"
            >
              <Trash2 className="size-3.5" />
              Delete crew…
            </Button>
          </section>

          <Notice
            title="A run can contain several laps"
            className="text-2xs text-ink"
          >
            <span className="text-3xs text-ink-muted">
              Correction laps stay in the same run until a human handoff. The
              delivery limit spans all laps.
            </span>
          </Notice>

          {/* R7: says everything, enforces nothing. The engine reads a source's
            wires at settle time, so an edit saved now applies from the next
            delivery and cannot rewrite a hop already recorded. */}
          <p className={INSPECTOR_NOTE_CLASS}>
            {running
              ? 'Crew is running — changes apply from the next delivery.'
              : 'Crew is idle · settings can be edited.'}
          </p>
        </CollapsiblePanel>
      </Collapsible>

      <p className={INSPECTOR_NOTE_CLASS}>
        Removing a seat never deletes its conversation — it stays in Flat.
      </p>
    </section>
  )
}
