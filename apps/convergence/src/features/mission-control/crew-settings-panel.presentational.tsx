import type { FC } from 'react'
import { X, Trash2 } from 'lucide-react'
import type { SessionCrewMember } from '@/entities/session-crew'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { formatCrewMemberCount } from './session-crew-groups.pure'
import { CrewDecorationPicker } from './crew-decoration-picker.presentational'

interface CrewSettingsPanelProps {
  emoji: string | null
  accentColor: string | null
  onEmojiChange: (emoji: string | null) => void
  onAccentColorChange: (accentColor: string | null) => void
  memberCount: number
  includePositions: boolean
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
  /** The refusal the baton-name door gave, and which member it was about. */
  batonNameProblem: { sessionId: string; message: string } | null
  /** What is being typed, per member, until they finish. */
  batonNameDrafts: Record<string, string>
  onCrewNameChange: (name: string) => void
  onBatonNameEdit: (sessionId: string, batonName: string) => void
  onBatonNameCommit: (sessionId: string) => void
  onDeliveryLimitChange: (limit: number | null) => void
  onAttentionMinutesChange: (minutes: number | null) => void
  onAddConversation: () => void
  onRemoveMember: (sessionId: string) => void
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
      {updateError ? (
        <p role="alert" className="text-xs text-destructive">
          {updateError}
        </p>
      ) : null}
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
          {members.map((member) => (
            <li key={member.sessionId} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[11px]">
                  {resolveName(member.sessionId) ?? member.sessionId}
                </span>
                {/* Stored when the name is FINISHED — a blur or Enter — not on
                    every keystroke: the door refuses a name ending in a
                    formatting mark, so a field that knocked per key made
                    `my_horse` untypeable. */}
                <Input
                  value={
                    batonNameDrafts[member.sessionId] ?? member.batonName ?? ''
                  }
                  placeholder="unnamed"
                  aria-label={`Baton name for ${resolveName(member.sessionId) ?? member.sessionId}`}
                  disabled={busy}
                  onChange={(event) =>
                    onBatonNameEdit(member.sessionId, event.target.value)
                  }
                  onBlur={() => onBatonNameCommit(member.sessionId)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      onBatonNameCommit(member.sessionId)
                    }
                  }}
                  className="h-7 w-32 text-xs"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${resolveName(member.sessionId) ?? member.sessionId} from this crew`}
                  disabled={busy}
                  onClick={() => onRemoveMember(member.sessionId)}
                  className="size-6 shrink-0 p-0 text-muted-foreground hover:text-red-400"
                >
                  <X className="size-3" />
                </Button>
              </div>
              {batonNameProblem?.sessionId === member.sessionId ? (
                <p className="pl-1 text-[10px] text-amber-400">
                  {batonNameProblem.message}
                </p>
              ) : null}
            </li>
          ))}
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
              onClick={onConfirmDelete}
            >
              Delete crew
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
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
