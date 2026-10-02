import { useId, type FC } from 'react'
import {
  ChevronDown,
  FileText,
  FlaskConical,
  MessageSquare,
  Trash2,
  Unlink,
} from 'lucide-react'
import type { SessionCrewMember } from '@/entities/session-crew'
import {
  Button,
  Checkbox,
  ChoiceField,
  cn,
  Field,
  FieldDescription,
  FieldLabel,
  Fieldset,
  FieldsetLegend,
  IconButton,
  Input,
  Notice,
  NumberField,
  SectionLabel,
  SegmentedControl,
  SegmentedControlItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from '@convergence/ui'
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

/** A segment's value can't be null, so the default lane is this word. */
const DEFAULT_LANE = 'default'

/** What changes the WIP field's draft: typing, pasting, its arrow keys. A step press is saved at once instead. */
const TYPED_REASONS: ReadonlySet<string> = new Set([
  'input-change',
  'input-clear',
  'input-paste',
  'keyboard',
])

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
  // A refusal describes the field it refuses (MC-4): its id is the field's
  // aria-describedby while it shows.
  const refusalIds = useId()
  const laneHintId = `${refusalIds}-lane-hint`
  const refusalId = (field: SeatRefusalField) =>
    problems[field] === undefined ? undefined : `${refusalIds}-${field}`
  const refusalFor = (field: SeatRefusalField) => {
    const message = problems[field]
    return message === undefined ? null : (
      <SeatRefusal
        id={refusalId(field)}
        message={message}
        kept={refusalKeptLine(field, member)}
      />
    )
  }
  // The stepper steps from what the field SHOWS -- the draft when there is one
  // (lap 2, E): stepping from the record sent `record + 1` after the typed
  // value, and the last write won.
  const typedWip = wipValue.trim() === '' ? Number.NaN : Number(wipValue)
  const shownWip = Number.isFinite(typedWip) ? typedWip : null
  const stepBase =
    shownWip !== null && Number.isInteger(shownWip) && shownWip >= 1
      ? shownWip
      : member.wipLimit
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
        'flex flex-col gap-3 rounded-md border bg-fill-quiet p-3',
        orphan ? 'border-warning-line' : 'border-hairline-strong',
      )}
    >
      {orphan ? (
        <Notice
          data-seat-orphan
          tone="warning"
          title={`${label}’s conversation no longer exists`}
          className="text-2xs"
          actions={
            <Button
              type="button"
              variant="danger-quiet"
              disabled={busy}
              onClick={onRemove}
              size="sm"
            >
              Remove seat…
            </Button>
          }
        >
          <span className="text-ink-muted">
            The seat keeps its name, role and card, but a wire that reaches{' '}
            {label} has nobody to wake. Nothing is removed automatically.
          </span>
        </Notice>
      ) : null}

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <KindGlyph aria-hidden className="size-3.5 shrink-0 text-ink-muted" />
          {/* Stored when the name is FINISHED — a blur or Enter — not on
              every keystroke: the door refuses a name ending in a formatting
              mark, so a field that knocked per key made `my_horse`
              untypeable. */}
          <Input
            size="md"
            value={nameValue}
            placeholder="unnamed"
            aria-label={`Baton name for ${label}`}
            aria-invalid={problems.batonName !== undefined || undefined}
            aria-describedby={refusalId('batonName')}
            disabled={busy}
            onChange={(event) => onNameChange(event.target.value)}
            onBlur={onNameCommit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onNameCommit()
              }
            }}
            className="flex-1 text-xs"
          />
          <IconButton
            label={`Close ${label}`}
            type="button"
            variant="quiet"
            onClick={onClose}
            size="xs"
            className="shrink-0"
          >
            <ChevronDown aria-hidden className="size-4" />
          </IconButton>
        </div>
        {refusalFor('batonName')}
        {nameNotice ? (
          <p data-seat-name-notice className="text-2xs text-ink-muted">
            {nameNotice}
          </p>
        ) : null}
        <p className="text-3xs text-ink-muted">
          {batonNameHelper(nameValue, recipe)}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        {/* One of four (MC-7): a segmented radio group, the chosen role the
            raised chip (R7). */}
        <SegmentedControl
          aria-label={`Role for ${label}`}
          aria-describedby={refusalId('role')}
          size="xs"
          value={member.role}
          disabled={busy}
          onValueChange={(role) => {
            if (member.role !== role) onSeatEdit({ role: role as SeatRole })
          }}
          className="grid grid-cols-4"
        >
          {ROLES.map((role) => (
            <SegmentedControlItem key={role} value={role}>
              {role}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
        {refusalFor('role')}
      </div>

      <div className="flex flex-col gap-1.5" data-seat-card>
        <div className="flex items-center gap-1.5">
          <FileText aria-hidden className="size-3.5 text-ink-muted" />
          <span className="flex-1 text-xs font-medium">Role card</span>
          <span
            data-seat-card-count
            className={cn(
              'text-3xs tabular-nums',
              cardOver ? 'text-warning-ink' : 'text-ink-muted',
            )}
          >
            {formatRoleCardCount(cardText.length)}
          </span>
        </div>
        <p className="text-3xs text-ink-muted">
          Leads the first message of every run this seat is woken for.
        </p>
        {writingCard ? (
          <Textarea
            value={cardText}
            aria-label={`Role card for ${label}`}
            aria-invalid={cardOver || undefined}
            aria-describedby={refusalId('roleCard')}
            rows={8}
            onChange={(event) => onCardChange(event.target.value)}
            onBlur={onCardCommit}
            className="min-h-40 resize-y p-2 text-2xs leading-relaxed"
          />
        ) : (
          <Notice
            data-seat-no-card
            tone="warning"
            title="No card yet"
            className="border-dashed text-2xs"
            actions={
              <Button
                type="button"
                variant="tonal"
                disabled={busy}
                onClick={onWriteCard}
                size="sm"
              >
                Write a card
              </Button>
            }
          >
            <span className="text-ink-muted">
              This seat starts every run without being told who it is. The first
              message will be the payload alone.
            </span>
          </Notice>
        )}
        {refusalFor('roleCard')}
      </div>

      <section aria-label="Policy" className="flex flex-col gap-2">
        <SectionLabel as="h4" size="sm">
          Policy
        </SectionLabel>
        {recipe ? (
          <Field invalid={problems.hostPolicy !== undefined} className="gap-1">
            <FieldLabel variant="caption" nativeLabel={false} render={<div />}>
              Host <span className="sr-only">for {label}</span> — where each
              spawn runs
            </FieldLabel>
            {/* A short fixed list (MC-10, R9): the app's Select, not the
                system's popup menu. */}
            <Select
              items={hostChoices.map((option) => ({
                value: option.id,
                label: option.label,
              }))}
              value={storedHost}
              disabled={busy}
              onValueChange={(hostPolicy) => onSeatEdit({ hostPolicy })}
            >
              <SelectTrigger
                size="md"
                aria-describedby={refusalId('hostPolicy')}
                className="w-full text-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {hostChoices.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {refusalFor('hostPolicy')}
          </Field>
        ) : null}
        {/* A group of radios is named by a Fieldset's legend: in a Field,
            each radio would take the Field's label as its own name. */}
        <Fieldset className="gap-1">
          <FieldsetLegend className="text-2xs text-ink-muted">
            Lane <span className="sr-only">for {label}</span>
          </FieldsetLegend>
          <SegmentedControl
            size="xs"
            value={member.lanePolicy ?? DEFAULT_LANE}
            disabled={busy}
            aria-invalid={problems.lanePolicy !== undefined || undefined}
            aria-describedby={[laneHintId, refusalId('lanePolicy')]
              .filter(Boolean)
              .join(' ')}
            onValueChange={(value) => {
              const lanePolicy =
                value === DEFAULT_LANE ? null : (value as SeatLane)
              if (member.lanePolicy !== lanePolicy) onSeatEdit({ lanePolicy })
            }}
            className="grid grid-cols-3"
          >
            {LANES.map((lane) => (
              <SegmentedControlItem
                key={lane.label}
                value={lane.value ?? DEFAULT_LANE}
              >
                {lane.label}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
          <p id={laneHintId} className="text-3xs text-ink-muted">
            Applied when a recipe is spawned.
          </p>
          {refusalFor('lanePolicy')}
        </Fieldset>
        {member.lanePolicy === 'own-worktree' ? (
          <Field
            invalid={problems.lanePath !== undefined}
            className="gap-1"
            data-seat-lane-path
          >
            <FieldLabel variant="caption">Worktree path</FieldLabel>
            <Input
              size="md"
              value={lanePathValue}
              placeholder="/Users/…/my-repo-lane-name"
              aria-describedby={refusalId('lanePath')}
              onChange={(event) => onLanePathChange(event.target.value)}
              onBlur={onLanePathCommit}
              className="text-xs"
            />
            {refusalFor('lanePath')}
          </Field>
        ) : null}
        <div className="flex flex-col gap-1">
          <Field
            invalid={problems.wipLimit !== undefined}
            className="flex-row items-center gap-2"
          >
            <div className="flex flex-1 flex-col">
              <FieldLabel variant="caption">
                WIP limit <span className="sr-only">for {label}</span>
              </FieldLabel>
              <FieldDescription className="text-3xs">
                Issues this seat may hold at once
              </FieldDescription>
            </div>
            {/* Typing is a draft, saved when the field is left; a step is
                saved at once, from what the field SHOWS (lap 2, E). */}
            <NumberField
              min={1}
              allowOutOfRange
              value={shownWip}
              stepsDisabled={busy}
              decrementLabel={`Lower the WIP limit for ${label}`}
              incrementLabel={`Raise the WIP limit for ${label}`}
              aria-describedby={refusalId('wipLimit')}
              onValueChange={(value, details) => {
                if (TYPED_REASONS.has(details.reason))
                  onWipChange(value === null ? '' : String(value))
              }}
              onValueCommitted={(_value, details) => {
                if (details.reason === 'increment-press')
                  onSeatEdit({ wipLimit: stepBase + 1 })
                else if (details.reason === 'decrement-press' && stepBase > 1)
                  onSeatEdit({ wipLimit: stepBase - 1 })
              }}
              onBlur={onWipCommit}
            />
          </Field>
          {refusalFor('wipLimit')}
          <ChoiceField
            density="compact"
            disabled={busy}
            label="Pause automatic dispatch to this seat"
            className="min-h-10"
          >
            <Switch
              checked={member.paused}
              aria-describedby={refusalId('paused')}
              onCheckedChange={(checked) => onSeatEdit({ paused: checked })}
            />
          </ChoiceField>
          {refusalFor('paused')}
          {member.role === 'mastermind' && (
            <>
              <ChoiceField
                density="compact"
                disabled={busy}
                label="Run the drill by itself when the context passes the alert"
              >
                <Checkbox
                  checked={member.drillAuto}
                  aria-describedby={refusalId('drillAuto')}
                  onCheckedChange={(checked) =>
                    onSeatEdit({ drillAuto: checked })
                  }
                />
              </ChoiceField>
              {refusalFor('drillAuto')}
            </>
          )}
        </div>
      </section>

      {orphan ? null : <SeatFacts heading={factsHeading} facts={facts} />}

      <div className="flex items-center gap-2 border-t border-hairline pt-2">
        <p className="flex-1 text-3xs text-ink-muted">
          Typed fields save when you leave them
        </p>
        <Button
          type="button"
          variant="danger-quiet"
          disabled={busy}
          onClick={onRemove}
          size="sm"
          className="shrink-0 gap-1 font-normal disabled:opacity-50"
        >
          <Trash2 aria-hidden className="size-3.5" />
          {recipe ? 'Delete recipe…' : 'Remove from crew…'}
        </Button>
      </div>
    </section>
  )
}
