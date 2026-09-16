import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CrewSettingsPanel } from './crew-settings-panel.presentational'
import {
  DEFAULT_CREW_MEMBER_SEAT,
  type CrewMemberRef,
  type SeatDraftField,
  type SessionCrewMember,
} from '@/entities/session-crew'
import {
  DEFAULT_CREW_ROUND_CAP,
  DEFAULT_CREW_STALL_MINUTES,
  MIN_FLOW_RUN_HOP_CEILING,
} from './crew-loop.pure'

/**
 * The crew settings panel, rendered (the MAR-2280 law).
 *
 * A sentence that exists in a pure function and never reaches the screen is a
 * sentence the user does not have, and the pure tests beside it cannot tell
 * the difference. This is the half that can.
 */
function renderPanel(
  deliveryLimit: number | null,
  lastExportPath: string | null = null,
  members: SessionCrewMember[] = [],
  onSeatEdit = vi.fn(),
  seat: {
    seatDrafts?: Record<string, Partial<Record<SeatDraftField, string>>>
    onSeatDraftEdit?: (
      key: string,
      field: SeatDraftField,
      value: string,
    ) => void
    onSeatDraftCommit?: (member: CrewMemberRef, field: SeatDraftField) => void
    resolveHost?: (sessionId: string) => string | null
  } = {},
) {
  const noop = vi.fn()
  const props = {
    emoji: null,
    accentColor: null,
    onEmojiChange: noop,
    onAccentColorChange: noop,
    memberCount: 2,
    includePositions: false,
    exporting: false,
    lastExportPath: lastExportPath,
    confirmingDelete: false,
    onIncludePositionsChange: noop,
    onExport: noop,
    onRequestDelete: noop,
    onCancelDelete: noop,
    onConfirmDelete: noop,
    updateError: null,
    savedName: 'Review loop',
    crewName: 'Review loop',
    members: members,
    resolveName: () => null,
    deliveryLimit: deliveryLimit,
    attentionMinutes: null,
    defaultDeliveryLimit: DEFAULT_CREW_ROUND_CAP,
    defaultAttentionMinutes: DEFAULT_CREW_STALL_MINUTES,
    busy: false,
    running: false,
    batonNameProblem: null,
    batonNameDrafts: {},
    onCrewNameChange: noop,
    onBatonNameEdit: noop,
    onSeatEdit: onSeatEdit,
    seatDrafts: seat.seatDrafts ?? {},
    resolveHost: seat.resolveHost ?? (() => null),
    onSeatDraftEdit: seat.onSeatDraftEdit ?? noop,
    onSeatDraftCommit: seat.onSeatDraftCommit ?? noop,
    onBatonNameCommit: noop,
    onDeliveryLimitChange: noop,
    onAttentionMinutesChange: noop,
    onAddConversation: noop,
    onRemoveMember: noop,
    onClose: noop,
  }
  return { ...render(<CrewSettingsPanel {...props} />), props }
}

describe('the delivery limit note about the run hard ceiling (R3, MAR-2966)', () => {
  it('tells a crew that raised its limit that the limit itself is the ceiling', () => {
    // Mutation that reds it: drop the note from the panel -- the box goes back
    // to saying a number whose consequence is written down nowhere.
    renderPanel(60)

    expect(
      screen.getByText(
        "This is also the run's hard ceiling. Inside this crew the limit hails and the wire stays armed; a run that crosses into another crew is disarmed past it.",
      ),
    ).toBeInTheDocument()
  })

  it('tells a crew on the default the number that actually disarms', () => {
    // An empty box means the default, and the default is under the floor: the
    // honest sentence names twenty rather than implying twelve switches a wire
    // off. Mutation that reds it: render R3's sentence unconditionally.
    renderPanel(null)

    expect(
      screen.getByText(
        `The run's hard ceiling is ${MIN_FLOW_RUN_HOP_CEILING}. Inside this crew the limit hails and the wire stays armed; a run that crosses into another crew is disarmed past ${MIN_FLOW_RUN_HOP_CEILING}.`,
      ),
    ).toBeInTheDocument()
  })
})

it('shows Last exported to only for a successful export, shortened with the full path in title (mutations: omit line; render before export)', () => {
  const before = renderPanel(null)
  expect(screen.queryByText(/Last exported to/)).not.toBeInTheDocument()
  before.unmount()
  const path = '/Users/marc/Projects/crew-recipes/review.yaml'
  renderPanel(null, path)
  const line = screen.getByText(/Last exported to/)
  expect(line).toHaveAttribute('title', path)
  expect(line).toHaveTextContent('Last exported to …/crew-recipes/review.yaml')
})

/**
 * The seat, on the screen (MAR-3083 R6; the MAR-2280 law).
 *
 * A record the form cannot show is a record only a mastermind's memory holds,
 * which is the thing this issue exists to end.
 */
describe('the member editor shows what the seat holds', () => {
  const seated: SessionCrewMember = {
    ...DEFAULT_CREW_MEMBER_SEAT,
    sessionId: 's1',
    batonName: 'horse opus',
    canvasX: null,
    canvasY: null,
    role: 'reviewer',
    roleCard: 'You read blind.',
  }

  it('renders the role the member holds and the card it carries', () => {
    // Mutation: drop the select or the textarea from the panel and the seat
    // is back to being something only a dispatch message can say.
    renderPanel(null, null, [seated])

    expect(screen.getByLabelText('Role for horse opus')).toHaveValue('reviewer')
    expect(screen.getByLabelText('Role card for horse opus')).toHaveValue(
      'You read blind.',
    )
    expect(screen.getByLabelText('WIP limit for horse opus')).toHaveValue(1)
  })

  /**
   * A crew broadcast must not eat what is being typed (MAR-3083 lap 2, G).
   * The container reloads every crew after any seat edit, so a field that
   * derived its identity from the record was remounted mid-sentence.
   */
  it('keeps the draft while the record changes under it', () => {
    const drafts: Record<string, Partial<Record<SeatDraftField, string>>> = {
      s1: { roleCard: 'You are Opus, and I am still typ' },
    }
    const { rerender, props } = renderPanel(null, null, [seated], vi.fn(), {
      seatDrafts: drafts,
    })

    expect(screen.getByLabelText('Role card for horse opus')).toHaveValue(
      'You are Opus, and I am still typ',
    )

    // The broadcast lands: same member, a different stored card.
    rerender(
      <CrewSettingsPanel
        {...props}
        members={[{ ...seated, roleCard: 'Something the record says now.' }]}
      />,
    )

    // Mutation: go back to an uncontrolled field keyed on the stored value and
    // this reads the record's card -- the typing is gone.
    expect(screen.getByLabelText('Role card for horse opus')).toHaveValue(
      'You are Opus, and I am still typ',
    )
  })

  it('shows a resident seat its conversation host, with nothing to type', () => {
    renderPanel(null, null, [seated], vi.fn(), {
      resolveHost: () => 'little-monster',
    })

    // A resident seat works where its conversation runs; a second editable
    // field could only disagree with it.
    expect(screen.getByLabelText('Host for horse opus')).toHaveTextContent(
      'little-monster',
    )
  })

  it('lets a recipe seat name its own host, and addresses it by baton name', () => {
    const onSeatDraftCommit = vi.fn()
    const recipe: SessionCrewMember = {
      ...DEFAULT_CREW_MEMBER_SEAT,
      sessionId: null,
      batonName: 'errand',
      canvasX: null,
      canvasY: null,
      kind: 'dynamic',
      providerId: 'codex',
      hostPolicy: 'little-monster',
    }
    renderPanel(null, null, [recipe], vi.fn(), { onSeatDraftCommit })

    const host = screen.getByLabelText('Host for errand')
    fireEvent.change(host, { target: { value: 'local' } })
    fireEvent.blur(host)

    // Mutation: key the row and its writes on `sessionId` and a recipe cannot
    // be addressed at all -- the commit names nothing.
    expect(onSeatDraftCommit).toHaveBeenCalledWith(
      { batonName: 'errand' },
      'hostPolicy',
    )
  })

  it('hands a chosen role straight to the door', () => {
    const onSeatEdit = vi.fn()
    renderPanel(null, null, [seated], onSeatEdit)

    fireEvent.change(screen.getByLabelText('Role for horse opus'), {
      target: { value: 'mastermind' },
    })

    // Addressed by the member reference the doors take, never a bare id.
    expect(onSeatEdit).toHaveBeenCalledWith(
      { sessionId: 's1' },
      { role: 'mastermind' },
    )
  })

  it('commits a card when the writing is finished, not on every keystroke', () => {
    const onSeatDraftEdit = vi.fn()
    const onSeatDraftCommit = vi.fn()
    renderPanel(null, null, [seated], vi.fn(), {
      onSeatDraftEdit,
      onSeatDraftCommit,
    })
    const card = screen.getByLabelText('Role card for horse opus')

    // Typing moves the draft, never the record.
    fireEvent.change(card, { target: { value: 'You are Opus.' } })
    expect(onSeatDraftEdit).toHaveBeenCalledWith(
      's1',
      'roleCard',
      'You are Opus.',
    )
    expect(onSeatDraftCommit).not.toHaveBeenCalled()

    fireEvent.blur(card)
    expect(onSeatDraftCommit).toHaveBeenCalledWith(
      { sessionId: 's1' },
      'roleCard',
    )
  })
})
