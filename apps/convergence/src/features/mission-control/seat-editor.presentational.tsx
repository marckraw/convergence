import type { FC } from 'react'
import {
  ChevronDown,
  FileText,
  FlaskConical,
  MessageSquare,
  Minus,
  Plus,
  Trash2,
  Unlink,
} from 'lucide-react'
import type { SessionCrewMember } from '@/entities/session-crew'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import {
  LOCAL_HOST_ID,
  ROLE_CARD_LIMIT,
  batonNameHelper,
  formatRoleCardCount,
  refusalKeptLine,
  seatDisplayName,
  type SeatHostOption,
  type SeatPatch,
  type SeatRefusalField,
} from './seat-display.pure'
import { SeatFacts, type SeatFact } from './seat-facts.presentational'
import { SeatRefusal } from './seat-refusal.presentational'

type SeatRole = SessionCrewMember['role']
type SeatLane = SessionCrewMember['lanePolicy']

const ROLES: readonly SeatRole[] = [
  'mastermind',
  'horse',
  'reviewer',
  'designer',
]
const LANES: readonly { value: SeatLane; label: string }[] = [
  { value: null, label: 'default' },
  { value: 'main', label: 'main' },
  { value: 'own-worktree', label: 'own worktree' },
]

interface SeatEditorProps {
  member: SessionCrewMember
  /** What is typed in the name field (the draft, else the stored name). */
  nameValue: string
  /** What is typed in the card, or undefined when nothing is being written. */
  cardDraft: string | undefined
  /** What is typed in the worktree path field, including a refused draft. */
  lanePathValue: string
  onLanePathChange: (value: string) => void
  onLanePathCommit: () => void
  /** What is typed in the WIP field (the draft, else the stored limit). */
  wipValue: string
  facts: readonly SeatFact[]
  factsHeading: string
  /** A recipe's host choices: this Mac and every execution-host endpoint. */
  hostOptions: readonly SeatHostOption[]
  /** The door's refusals about this seat, one per field (lap 2, B). */
  problems: Partial<Record<SeatRefusalField, string>>
  /**
   * A non-refusal notice under the baton name (MAR-3157): how many wires
   * moved with a rename. Distinct from `problems` so it is not amber.
   */
  nameNotice?: string | null
  busy: boolean
  onNameChange: (value: string) => void
  onNameCommit: () => void
  onCardChange: (value: string) => void
  onCardCommit: () => void
  /** "Write a card": opens an empty card to type into. */
  onWriteCard: () => void
  onWipChange: (value: string) => void
  onWipCommit: () => void
  onSeatEdit: (patch: SeatPatch) => void
  onClose: () => void
  onRemove: () => void
}

/**
 * One seat, open (MAR-3118 R3–R5, R7, R8, R10).
 *
 * The name and its live address, the role, then the role card as the
 * centrepiece — or a stated "No card yet" — then POLICY as bordered controls
 * and FACTS as text. A refusal is drawn under the field it refuses.
 */
export const SeatEditor: FC<SeatEditorProps> = ({
  member,
  nameValue,
  cardDraft,
  lanePathValue,
  onLanePathChange,
  onLanePathCommit,
  wipValue,
  facts,
  factsHeading,
  hostOptions,
  problems,
  nameNotice = null,
  busy,
  onNameChange,
  onNameCommit,
  onCardChange,
  onCardCommit,
  onWriteCard,
  onWipChange,
  onWipCommit,
  onSeatEdit,
  onClose,
  onRemove,
}) => {
  const label = seatDisplayName(member)
  const recipe = member.sessionId === null
  const orphan = member.conversationMissing
  const KindGlyph = orphan ? Unlink : recipe ? FlaskConical : MessageSquare
  const refusalFor = (field: SeatRefusalField) => {
    const message = problems[field]
    return message === undefined ? null : (
      <SeatRefusal message={message} kept={refusalKeptLine(field, member)} />
    )
  }
  // The stepper steps from what the field SHOWS -- the draft when there is one
  // (lap 2, E): stepping from the record sent `record + 1` after the typed
  // value, and the last write won.
  const shownWip = Number(wipValue)
  const stepBase =
    Number.isInteger(shownWip) && shownWip >= 1 ? shownWip : member.wipLimit
  const cardText = cardDraft ?? member.roleCard ?? ''
  const writingCard = cardDraft !== undefined || Boolean(member.roleCard)
  const cardOver =
    cardText.length > ROLE_CARD_LIMIT || problems.roleCard !== undefined
  const storedHost = member.hostPolicy ?? LOCAL_HOST_ID
  const hostChoices = hostOptions.some((option) => option.id === storedHost)
    ? hostOptions
    : [...hostOptions, { id: storedHost, label: storedHost }]

  return (
    <section
      data-seat-editor
      aria-label={`Seat ${label}`}
      className={cn(
        'flex flex-col gap-3 rounded-md border bg-white/[0.02] p-3',
        orphan ? 'border-amber-500/50' : 'border-white/20',
      )}
    >
      {orphan ? (
        <div
          data-seat-orphan
          className="flex flex-col gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5"
        >
          <p className="text-[11px] font-medium text-amber-400">
            {label}’s conversation no longer exists
          </p>
          <p className="text-[11px] text-muted-foreground">
            The seat keeps its name, role and card, but a wire that reaches{' '}
            {label} has nobody to wake. Nothing is removed automatically.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onRemove}
            className="h-7 self-start px-2.5 text-[11px] text-destructive hover:text-destructive"
          >
            Remove seat
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <KindGlyph
            aria-hidden
            className="size-3.5 shrink-0 text-muted-foreground"
          />
          {/* Stored when the name is FINISHED — a blur or Enter — not on
              every keystroke: the door refuses a name ending in a formatting
              mark, so a field that knocked per key made `my_horse`
              untypeable. */}
          <Input
            value={nameValue}
            placeholder="unnamed"
            aria-label={`Baton name for ${label}`}
            disabled={busy}
            onChange={(event) => onNameChange(event.target.value)}
            onBlur={onNameCommit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onNameCommit()
              }
            }}
            className={cn(
              'h-8 flex-1 text-xs',
              problems.batonName !== undefined && 'border-amber-500/70',
            )}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Close ${label}`}
            onClick={onClose}
            className="size-6 shrink-0 p-0 text-muted-foreground hover:text-foreground"
          >
            <ChevronDown aria-hidden className="size-4" />
          </Button>
        </div>
        {refusalFor('batonName')}
        {nameNotice ? (
          <p
            data-seat-name-notice
            className="text-[11px] text-muted-foreground"
          >
            {nameNotice}
          </p>
        ) : null}
        <p className="text-[10px] text-muted-foreground">
          {batonNameHelper(nameValue, recipe)}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <div
          role="group"
          aria-label={`Role for ${label}`}
          className="grid grid-cols-4 gap-0.5 rounded-md bg-white/[0.04] p-0.5"
        >
          {ROLES.map((role) => (
            <Button
              key={role}
              type="button"
              aria-pressed={member.role === role}
              disabled={busy}
              onClick={() => {
                if (member.role !== role) onSeatEdit({ role })
              }}
              className={cn(
                'h-6 rounded px-1 text-[10px] font-normal transition-colors',
                member.role === role
                  ? 'border border-white/15 bg-white/10 text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {role}
            </Button>
          ))}
        </div>
        {refusalFor('role')}
      </div>

      <div className="flex flex-col gap-1.5" data-seat-card>
        <div className="flex items-center gap-1.5">
          <FileText aria-hidden className="size-3.5 text-muted-foreground" />
          <span className="flex-1 text-xs font-medium">Role card</span>
          <span
            data-seat-card-count
            className={cn(
              'text-[10px] tabular-nums',
              cardOver ? 'text-amber-400' : 'text-muted-foreground',
            )}
          >
            {formatRoleCardCount(cardText.length)}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Leads the first message of every run this seat is woken for.
        </p>
        {writingCard ? (
          <textarea
            value={cardText}
            aria-label={`Role card for ${label}`}
            rows={8}
            onChange={(event) => onCardChange(event.target.value)}
            onBlur={onCardCommit}
            className={cn(
              'min-h-40 resize-y rounded-md border bg-transparent p-2 text-[11px] leading-relaxed',
              cardOver ? 'border-amber-500/70' : 'border-white/10',
            )}
          />
        ) : (
          <div
            data-seat-no-card
            className="flex flex-col gap-1.5 rounded-md border border-dashed border-amber-500/50 bg-amber-500/5 p-2.5"
          >
            <p className="text-[11px] font-medium text-amber-400">
              No card yet
            </p>
            <p className="text-[11px] text-muted-foreground">
              This seat starts every run without being told who it is. The first
              message will be the payload alone.
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={onWriteCard}
              className="h-7 self-start px-2.5 text-[11px]"
            >
              Write a card
            </Button>
          </div>
        )}
        {refusalFor('roleCard')}
      </div>

      <section aria-label="Policy" className="flex flex-col gap-2">
        <h5 className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Policy
        </h5>
        {recipe ? (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">
              Host — where each spawn runs
            </span>
            <select
              aria-label={`Host for ${label}`}
              value={storedHost}
              disabled={busy}
              onChange={(event) =>
                onSeatEdit({ hostPolicy: event.target.value })
              }
              className="h-8 rounded-md border border-white/15 bg-transparent px-2 text-xs"
            >
              {hostChoices.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            {refusalFor('hostPolicy')}
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Lane</span>
          <div
            role="group"
            aria-label={`Lane for ${label}`}
            className="grid grid-cols-3 gap-0.5 rounded-md border border-white/10 p-0.5"
          >
            {LANES.map((lane) => (
              <Button
                key={lane.label}
                type="button"
                aria-pressed={member.lanePolicy === lane.value}
                disabled={busy}
                onClick={() => {
                  if (member.lanePolicy !== lane.value)
                    onSeatEdit({ lanePolicy: lane.value })
                }}
                className={cn(
                  'h-6 rounded px-1 text-[10px] font-normal transition-colors',
                  member.lanePolicy === lane.value
                    ? 'border border-white/15 bg-white/10 text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {lane.label}
              </Button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Applied when a recipe is spawned.
          </p>
          {refusalFor('lanePolicy')}
        </div>
        {member.lanePolicy === 'own-worktree' ? (
          <div className="flex flex-col gap-1" data-seat-lane-path>
            <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
              Worktree path
              <Input
                value={lanePathValue}
                placeholder="/Users/…/my-repo-lane-name"
                onChange={(event) => onLanePathChange(event.target.value)}
                onBlur={onLanePathCommit}
                className={cn(
                  'h-8 text-xs',
                  problems.lanePath !== undefined && 'border-amber-500/70',
                )}
              />
            </label>
            {refusalFor('lanePath')}
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 flex-col">
              <span className="text-[11px] text-muted-foreground">
                WIP limit
              </span>
              <span className="text-[10px] text-muted-foreground/80">
                Issues this seat may hold at once
              </span>
            </div>
            <div
              className={cn(
                'flex h-8 items-center rounded-md border',
                problems.wipLimit !== undefined
                  ? 'border-amber-500/70'
                  : 'border-white/15',
              )}
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Lower the WIP limit for ${label}`}
                disabled={busy || stepBase <= 1}
                // Keep focus in the field: a blur here would commit the typed
                // value as a second write racing the step. The keyboard path
                // (Tab to the button, then Enter) still blurs first and then
                // steps -- two ordered writes that end at the right value.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onSeatEdit({ wipLimit: stepBase - 1 })}
                className="h-7 px-2 text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                <Minus aria-hidden className="size-3" />
              </Button>
              <Input
                type="number"
                min={1}
                value={wipValue}
                aria-label={`WIP limit for ${label}`}
                onChange={(event) => onWipChange(event.target.value)}
                onBlur={onWipCommit}
                className="h-7 w-9 border-0 bg-transparent p-0 text-center text-xs tabular-nums shadow-none [appearance:textfield] focus-visible:ring-0 [&::-webkit-inner-spin-button]:appearance-none"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Raise the WIP limit for ${label}`}
                disabled={busy}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onSeatEdit({ wipLimit: stepBase + 1 })}
                className="h-7 px-2 text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                <Plus aria-hidden className="size-3" />
              </Button>
            </div>
          </div>
          {refusalFor('wipLimit')}
        </div>
      </section>

      {orphan ? null : <SeatFacts heading={factsHeading} facts={facts} />}

      <div className="flex items-center gap-2 border-t border-white/10 pt-2">
        <p className="flex-1 text-[10px] text-muted-foreground">
          Typed fields save when you leave them
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={onRemove}
          className="h-7 shrink-0 gap-1 px-1 text-[11px] font-normal text-destructive hover:text-destructive disabled:opacity-50"
        >
          <Trash2 aria-hidden className="size-3.5" />
          {recipe ? 'Delete recipe' : 'Remove from crew'}
        </Button>
      </div>
    </section>
  )
}
