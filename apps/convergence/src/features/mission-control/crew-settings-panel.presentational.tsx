import type { FC } from 'react'
import { X, Trash2 } from 'lucide-react'
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
  batonNameProblem: { memberKey: string; message: string } | null
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
  onSeatEdit: (
    member: CrewMemberRef,
    patch: {
      role?: string
      kind?: string
      roleCard?: string | null
      hostPolicy?: string | null
      lanePolicy?: string | null
      wipLimit?: number | null
    },
  ) => void
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
  batonNameProblem,
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
}) => (
  <section
    data-crew-settings-panel
    aria-label="Crew settings"
    className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto border-l border-white/10 px-4 py-3"
  >
    <div className="flex items-start justify-between gap-2">
      <h3 className="text-sm font-medium">Crew settings</h3>
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
    </div>

    {updateError ? (
      <p role="alert" className="text-xs text-destructive">
        {updateError}
      </p>
    ) : null}

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
        Conversations &amp; baton names
      </p>
      {members.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Add a conversation to this crew to give it a baton name.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {members.map((member) => {
            // A recipe has no conversation, so it is named -- and addressed --
            // by its baton name (MAR-3083 R3/C).
            const key = memberKey(member)
            const ref: CrewMemberRef = member.sessionId
              ? { sessionId: member.sessionId }
              : { batonName: member.batonName ?? '' }
            const label =
              (member.sessionId ? resolveName(member.sessionId) : null) ??
              member.batonName ??
              member.sessionId ??
              'unnamed seat'
            const residentHost = member.sessionId
              ? resolveHost(member.sessionId)
              : null
            return (
              <li key={key} className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[11px]">
                    {label}
                  </span>
                  {/* Stored when the name is FINISHED — a blur or Enter — not on
                    every keystroke: the door refuses a name ending in a
                    formatting mark, so a field that knocked per key made
                    `my_horse` untypeable. */}
                  <Input
                    value={batonNameDrafts[key] ?? member.batonName ?? ''}
                    placeholder="unnamed"
                    aria-label={`Baton name for ${label}`}
                    disabled={busy}
                    onChange={(event) =>
                      onBatonNameEdit(key, event.target.value)
                    }
                    onBlur={() => onBatonNameCommit(key)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        onBatonNameCommit(key)
                      }
                    }}
                    className="h-7 w-32 text-xs"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${label} from this crew`}
                    disabled={busy}
                    onClick={() => onRemoveMember(ref)}
                    className="size-6 shrink-0 p-0 text-muted-foreground hover:text-red-400"
                  >
                    <X className="size-3" />
                  </Button>
                </div>
                {/* The seat, under the name that addresses it (R6). Selects
                  commit on change; the typed fields keep a draft and commit
                  on blur, so a broadcast cannot wipe what is being typed. */}
                <div className="flex flex-wrap items-center gap-1 pl-1">
                  <select
                    aria-label={`Role for ${label}`}
                    value={member.role}
                    onChange={(event) =>
                      onSeatEdit(ref, { role: event.target.value })
                    }
                    className="h-6 rounded border border-border bg-transparent px-1 text-[11px]"
                  >
                    {['mastermind', 'horse', 'reviewer', 'designer'].map(
                      (role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ),
                    )}
                  </select>
                  <select
                    aria-label={`Kind for ${label}`}
                    value={member.kind}
                    onChange={(event) =>
                      onSeatEdit(ref, { kind: event.target.value })
                    }
                    className="h-6 rounded border border-border bg-transparent px-1 text-[11px]"
                  >
                    <option value="resident">resident</option>
                    <option value="dynamic">dynamic</option>
                  </select>
                  <select
                    aria-label={`Lane for ${label}`}
                    value={member.lanePolicy ?? ''}
                    onChange={(event) =>
                      onSeatEdit(ref, {
                        lanePolicy: event.target.value || null,
                      })
                    }
                    className="h-6 rounded border border-border bg-transparent px-1 text-[11px]"
                  >
                    <option value="">lane: default</option>
                    <option value="main">main</option>
                    <option value="own-worktree">own-worktree</option>
                  </select>
                  {member.kind === 'dynamic' ? (
                    <Input
                      value={
                        seatDrafts[key]?.hostPolicy ?? member.hostPolicy ?? ''
                      }
                      placeholder="host: local"
                      aria-label={`Host for ${label}`}
                      disabled={busy}
                      onChange={(event) =>
                        onSeatDraftEdit(key, 'hostPolicy', event.target.value)
                      }
                      onBlur={() => onSeatDraftCommit(ref, 'hostPolicy')}
                      className="h-6 w-24 text-[11px]"
                    />
                  ) : (
                    // A resident seat works where its conversation runs: the
                    // host is that session's, not a second field that could
                    // disagree with it.
                    <span
                      aria-label={`Host for ${label}`}
                      className="h-6 rounded border border-border px-1 text-[11px] leading-6 text-muted-foreground"
                    >
                      {residentHost ?? member.hostPolicy ?? 'local'}
                    </span>
                  )}
                  <Input
                    type="number"
                    min={1}
                    value={
                      seatDrafts[key]?.wipLimit ?? String(member.wipLimit ?? 1)
                    }
                    aria-label={`WIP limit for ${label}`}
                    disabled={busy}
                    onChange={(event) =>
                      onSeatDraftEdit(key, 'wipLimit', event.target.value)
                    }
                    onBlur={() => onSeatDraftCommit(ref, 'wipLimit')}
                    className="h-6 w-14 text-[11px]"
                  />
                </div>
                <textarea
                  value={seatDrafts[key]?.roleCard ?? member.roleCard ?? ''}
                  placeholder="Role card — what this seat is told it is"
                  aria-label={`Role card for ${label}`}
                  disabled={busy}
                  rows={2}
                  onChange={(event) =>
                    onSeatDraftEdit(key, 'roleCard', event.target.value)
                  }
                  onBlur={() => onSeatDraftCommit(ref, 'roleCard')}
                  className="ml-1 rounded border border-border bg-transparent p-1 text-[11px]"
                />
                {batonNameProblem?.memberKey === key ? (
                  <p className="pl-1 text-[10px] text-amber-400">
                    {batonNameProblem.message}
                  </p>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={onAddConversation}
        className="h-7 self-start px-2 text-[11px]"
      >
        + Add conversation
      </Button>
      <p className="text-[10px] text-muted-foreground/70">
        Removing a conversation from the crew does not delete it — it stays
        available in Flat.
      </p>
    </div>

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
        The timer watches for a reply still owed. It is not a total run-duration
        limit.
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
          onChange={(event) => onIncludePositionsChange(event.target.checked)}
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
    <section aria-label="Danger" className="border-t border-white/10 pt-2">
      <h4 className="text-[11px] uppercase tracking-wide text-muted-foreground">
        Danger
      </h4>
      {confirmingDelete ? (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] text-muted-foreground">
            Delete “{savedName}” with {formatCrewMemberCount(memberCount)}? Only
            the crew disappears; the conversations stay exactly where they are.
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
      <p className="text-[11px] font-medium">A run can contain several laps</p>
      <p className="text-[10px] text-muted-foreground">
        Correction laps stay in the same run until a human handoff. The delivery
        limit spans all laps.
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
  </section>
)
