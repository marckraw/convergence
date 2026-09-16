import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { CrewSettingsPanel } from './crew-settings-panel.presentational'
import { AddConversationsPanel } from './add-conversations-panel.presentational'
import type { SeatRefusalField } from './seat-display.pure'
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
    resolveName?: (sessionId: string) => string | null
    openSeatKey?: string | null
    onToggleSeat?: (key: string) => void
    addMenuOpen?: boolean
    batonNameDrafts?: Record<string, string>
    problem?: {
      memberKey: string
      message: string
      field: SeatRefusalField
    } | null
    onRemoveMember?: (member: CrewMemberRef) => void
    onOpenConversation?: (sessionId: string) => void
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
    resolveName: seat.resolveName ?? (() => null),
    deliveryLimit: deliveryLimit,
    attentionMinutes: null,
    defaultDeliveryLimit: DEFAULT_CREW_ROUND_CAP,
    defaultAttentionMinutes: DEFAULT_CREW_STALL_MINUTES,
    busy: false,
    running: false,
    seatProblems: seat.problem
      ? {
          [seat.problem.memberKey]: {
            [seat.problem.field]: seat.problem.message,
          },
        }
      : {},
    batonNameDrafts: seat.batonNameDrafts ?? {},
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
    onRemoveMember: seat.onRemoveMember ?? noop,
    onClose: noop,
    openSeatKey: seat.openSeatKey ?? null,
    onToggleSeat: seat.onToggleSeat ?? noop,
    seatQuery: '',
    onSeatQueryChange: noop,
    addMenuOpen: seat.addMenuOpen ?? false,
    onAddMenuToggle: noop,
    hostOptions: [
      { id: 'local', label: 'This Mac' },
      { id: 'lm', label: 'little-monster' },
    ],
    resolveProviderName: () => 'Claude Code',
    onOpenConversation: seat.onOpenConversation ?? noop,
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
 * The seat, on the screen (MAR-3083 R6; MAR-3118; the MAR-2280 law).
 *
 * A record the form cannot show is a record only a mastermind's memory holds,
 * which is the thing these issues exist to end.
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
    // Mutation: drop the role control or the card from the editor and the
    // seat is back to being something only a dispatch message can say.
    renderPanel(null, null, [seated], vi.fn(), { openSeatKey: 's1' })

    expect(
      within(
        screen.getByRole('group', { name: 'Role for horse opus' }),
      ).getByRole('button', { name: 'reviewer' }),
    ).toHaveAttribute('aria-pressed', 'true')
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
      openSeatKey: 's1',
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

  it('lets a recipe seat choose its own host, and addresses it by baton name', () => {
    const onSeatEdit = vi.fn()
    const recipe: SessionCrewMember = {
      ...DEFAULT_CREW_MEMBER_SEAT,
      sessionId: null,
      batonName: 'errand',
      canvasX: null,
      canvasY: null,
      kind: 'dynamic',
      providerId: 'codex',
      hostPolicy: 'lm',
    }
    renderPanel(null, null, [recipe], onSeatEdit, {
      openSeatKey: 'baton:errand',
    })

    fireEvent.change(screen.getByLabelText('Host for errand'), {
      target: { value: 'local' },
    })

    // Mutation: key the row and its writes on `sessionId` and a recipe cannot
    // be addressed at all -- the edit names nothing.
    expect(onSeatEdit).toHaveBeenCalledWith(
      { batonName: 'errand' },
      { hostPolicy: 'local' },
    )
  })

  it('hands a chosen role straight to the door', () => {
    const onSeatEdit = vi.fn()
    renderPanel(null, null, [seated], onSeatEdit, { openSeatKey: 's1' })

    fireEvent.click(
      within(
        screen.getByRole('group', { name: 'Role for horse opus' }),
      ).getByRole('button', { name: 'mastermind' }),
    )

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
      openSeatKey: 's1',
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

// -- MAR-3118: the seat editor as designed (Seats r1) --

const opus: SessionCrewMember = {
  ...DEFAULT_CREW_MEMBER_SEAT,
  sessionId: 's1',
  batonName: 'opus',
  canvasX: null,
  canvasY: null,
  roleCard: 'You are opus, a horse in the convergence crew.',
  lanePolicy: 'own-worktree',
  wipLimit: 1,
}
const grok: SessionCrewMember = {
  ...DEFAULT_CREW_MEMBER_SEAT,
  sessionId: 's2',
  batonName: 'grok',
  canvasX: null,
  canvasY: null,
  wipLimit: 2,
}
const glm: SessionCrewMember = {
  ...DEFAULT_CREW_MEMBER_SEAT,
  sessionId: null,
  batonName: 'glm',
  canvasX: null,
  canvasY: null,
  kind: 'dynamic',
  providerId: 'claude-code',
  model: 'claude-opus-5',
  hostPolicy: 'lm',
}
const titles: Record<string, string> = {
  s1: '-- Horse Executor Opus --',
  s2: '-- Grok 4.6 Cursor horse --',
}
const seatCtx = {
  resolveName: (id: string) => titles[id] ?? null,
  // opus's conversation runs on little-monster; grok's on this Mac.
  resolveHost: (id: string) => (id === 's1' ? 'lm' : 'local'),
}
const before = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('R1 — one line per seat, identifiable closed', () => {
  it('shows each closed seat’s source, host, lane, WIP and card on one row', () => {
    renderPanel(null, null, [opus, grok], vi.fn(), seatCtx)

    const opusRow = screen.getByRole('button', { name: /^opus — / })
    const grokRow = screen.getByRole('button', { name: /^grok — / })
    expect(opusRow).toHaveAccessibleName(
      'opus — -- Horse Executor Opus -- · host little-monster · lane own worktree · WIP 1 · has a role card',
    )
    expect(grokRow).toHaveAccessibleName(
      'grok — -- Grok 4.6 Cursor horse -- · host This Mac · lane default · WIP 2 · no role card',
    )
    // The glyphs say the same, and a closed seat is a row, not an editor.
    expect(opusRow.querySelector('[data-seat-host]')).toHaveAttribute(
      'data-seat-host',
      'remote',
    )
    expect(opusRow.querySelector('[data-seat-lane]')).toHaveAttribute(
      'data-seat-lane',
      'own-worktree',
    )
    expect(grokRow.querySelector('[data-seat-lane]')).toBeNull()
    expect(grokRow.querySelector('[data-seat-wip]')).toHaveTextContent('2')
    // Mutation: drop the card dot -> both queries are null.
    expect(opusRow.querySelector('[data-card-dot]')).toHaveAttribute(
      'data-card-dot',
      'filled',
    )
    expect(grokRow.querySelector('[data-card-dot]')).toHaveAttribute(
      'data-card-dot',
      'hollow',
    )
    expect(screen.queryByRole('region', { name: /^Seat / })).toBeNull()
  })
})

describe('R3 — the role card is the centrepiece', () => {
  it('states "No card yet" with a Write a card button instead of a blank box', () => {
    const onSeatDraftEdit = vi.fn()
    const { rerender, props } = renderPanel(null, null, [grok], vi.fn(), {
      ...seatCtx,
      openSeatKey: 's2',
      onSeatDraftEdit,
    })

    // Mutation: render an empty textarea for "no card" -> no box, red.
    expect(screen.getByText('No card yet')).toBeInTheDocument()
    expect(
      screen.getByText(
        'This seat starts every run without being told who it is. The first message will be the payload alone.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Role card for grok')).toBeNull()
    expect(screen.getByText('0 / 4,000')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Write a card' }))
    expect(onSeatDraftEdit).toHaveBeenCalledWith('s2', 'roleCard', '')

    rerender(
      <CrewSettingsPanel {...props} seatDrafts={{ s2: { roleCard: '' } }} />,
    )
    expect(screen.getByLabelText('Role card for grok')).toHaveValue('')
    expect(
      screen.getByText(
        'Leads the first message of every run this seat is woken for.',
      ),
    ).toBeInTheDocument()
  })
})

describe('R4 — facts are text, policy is controls', () => {
  it.each([
    [
      'resident',
      opus,
      's1',
      'Facts · from the conversation',
      [
        ['Kind', 'Resident — a conversation'],
        ['Conversation', '-- Horse Executor Opus --'],
        ['Host', 'little-monster'],
      ],
    ],
    [
      'recipe',
      glm,
      'baton:glm',
      'Facts · the recipe',
      [
        ['Kind', 'Recipe — spawned on demand'],
        ['Provider', 'Claude Code · claude-opus-5'],
        ['Conversation', 'None — one is spawned per run'],
      ],
    ],
  ] as const)(
    'reads a %s seat’s facts as plain key/value text',
    (_kind, member, key, heading, pairs) => {
      renderPanel(null, null, [member], vi.fn(), {
        ...seatCtx,
        openSeatKey: key,
      })
      const facts = screen.getByRole('region', { name: 'Facts' })

      expect(within(facts).getByText(heading)).toBeInTheDocument()
      expect(
        Array.from(facts.querySelectorAll('dt')).map((dt) => [
          dt.textContent,
          dt.nextElementSibling?.textContent,
        ]),
      ).toEqual(pairs)
      // Mutation: render the facts as disabled inputs -> red here.
      expect(within(facts).queryAllByRole('textbox')).toEqual([])
      expect(within(facts).queryAllByRole('combobox')).toEqual([])
      expect(facts.querySelectorAll('input, select, textarea')).toHaveLength(0)
    },
  )

  it('puts a recipe’s host in Policy as a select, and opens a resident’s conversation from its fact', () => {
    const onOpenConversation = vi.fn()
    const view = renderPanel(null, null, [glm], vi.fn(), {
      ...seatCtx,
      openSeatKey: 'baton:glm',
    })
    const policy = screen.getByRole('region', { name: 'Policy' })
    expect(within(policy).getByLabelText('Host for glm')).toHaveValue('lm')
    expect(
      within(policy).getByRole('group', { name: 'Lane for glm' }),
    ).toBeInTheDocument()
    view.unmount()

    renderPanel(null, null, [opus], vi.fn(), {
      ...seatCtx,
      openSeatKey: 's1',
      onOpenConversation,
    })
    expect(screen.queryByLabelText('Host for opus')).toBeNull()
    fireEvent.click(
      screen.getByRole('button', { name: 'Open -- Horse Executor Opus --' }),
    )
    expect(onOpenConversation).toHaveBeenCalledWith('s1')
  })
})

describe('R5 — the baton name field', () => {
  it('says how wires address the seat, as the name is typed', () => {
    const { rerender, props } = renderPanel(null, null, [opus], vi.fn(), {
      ...seatCtx,
      openSeatKey: 's1',
      batonNameDrafts: { s1: 'opus-2' },
    })
    expect(
      screen.getByText('Wires address this seat as “opus-2”.'),
    ).toBeInTheDocument()

    rerender(
      <CrewSettingsPanel {...props} batonNameDrafts={{ s1: 'opus-3' }} />,
    )
    expect(
      screen.getByText('Wires address this seat as “opus-3”.'),
    ).toBeInTheDocument()
  })
})

describe('R7 — refusals under the field, typed text kept', () => {
  it.each([
    [
      'batonName',
      'This crew already has a seat named "opus-lm"',
      { batonNameDrafts: { s1: 'opus-lm' } },
      'Baton name for opus',
      'opus-lm',
      /^Still named “opus”/,
    ],
    [
      'wipLimit',
      'WIP limit must be a whole number of at least 1',
      { seatDrafts: { s1: { wipLimit: '0' } } },
      'WIP limit for opus',
      0,
      /WIP stays 1/,
    ],
    [
      'roleCard',
      'A role card cannot be longer than 4000 characters',
      { seatDrafts: { s1: { roleCard: 'x'.repeat(4212) } } },
      'Role card for opus',
      'x'.repeat(4212),
      /^Previous card kept/,
    ],
  ] as const)(
    'draws the %s refusal under its field, keeps the typing and names what stayed',
    (field, message, drafts, label, typed, kept) => {
      renderPanel(null, null, [opus], vi.fn(), {
        ...seatCtx,
        ...drafts,
        openSeatKey: 's1',
        problem: { memberKey: 's1', message, field },
      })
      const input = screen.getByLabelText(label)
      const refusal = screen.getByRole('alert')

      expect(refusal).toHaveTextContent(message)
      expect(within(refusal).getByText(kept)).toBeInTheDocument()
      // The typed text stays. Mutation: show the stored value on refusal.
      expect(input).toHaveValue(typed)
      // Under the field: after it, and before the next section. Mutation:
      // render the refusal at the top of the drawer -> it precedes the field.
      expect(before(input, refusal)).toBe(true)
      expect(
        before(refusal, screen.getByRole('region', { name: 'Facts' })),
      ).toBe(true)
      if (field === 'roleCard')
        expect(screen.getByText('4,212 / 4,000')).toHaveClass('text-amber-400')
    },
  )

  it('labels a conversation that sits in another crew, and draws the add refusal under the list with the selection kept', () => {
    render(
      <AddConversationsPanel
        crewName="convergence development"
        query="astra"
        onQueryChange={vi.fn()}
        projectOptions={[]}
        selectedProjectId={null}
        onProjectChange={vi.fn()}
        available={[
          {
            sessionId: 'astra',
            name: '-- Horse Astra Executor --',
            detail: 'codex',
            inCrew: 'segmemo development',
          },
        ]}
        selectedIds={['astra']}
        onToggle={vi.fn()}
        alreadyInCrew={[]}
        busy={false}
        refusal={{
          sentences: [
            'This conversation is already in the crew "segmemo development"',
          ],
          added: 0,
          attempted: 1,
        }}
        onAdd={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const row = screen.getByRole('button', {
      name: /-- Horse Astra Executor --/,
    })
    expect(row).toHaveTextContent('In crew “segmemo development”')
    expect(row).toHaveAttribute('aria-pressed', 'true')
    const refusal = screen.getByRole('alert')
    expect(refusal).toHaveTextContent(
      'This conversation is already in the crew "segmemo development"',
    )
    expect(refusal).toHaveTextContent(
      '0 of 1 added; the refused conversation stays selected.',
    )
    expect(before(row, refusal)).toBe(true)
  })
})

describe('R8 — drawer order and Crew details', () => {
  it('orders header, seats, role groups, Crew details and the removal note', () => {
    renderPanel(null, null, [opus], vi.fn(), seatCtx)
    const panel = screen.getByRole('region', { name: 'Crew settings' })
    const landmarks = [
      panel.querySelector('[data-crew-settings-header]')!,
      screen.getByRole('region', { name: 'Seats' }),
      screen.getByRole('region', { name: 'Horses 1' }),
      panel.querySelector('[data-crew-details]')!,
      screen.getByText(
        'Removing a seat never deletes its conversation — it stays in Flat.',
      ),
    ]
    // Mutation: put Crew details above Seats -> red.
    for (let index = 1; index < landmarks.length; index++)
      expect(before(landmarks[index - 1]!, landmarks[index]!)).toBe(true)
    // The crew sections live inside the disclosure, unchanged.
    const details = panel.querySelector('[data-crew-details]')!
    expect(
      within(details as HTMLElement).getByLabelText('Crew name'),
    ).toBeInTheDocument()
    expect(
      within(details as HTMLElement).getByLabelText(
        'Delivery limit per run for this crew',
      ),
    ).toBeInTheDocument()
    expect(
      within(details as HTMLElement).getByRole('button', {
        name: 'Export crew…',
      }),
    ).toBeInTheDocument()
  })

  it('ends an open seat with the save note and its removal, worded by kind', () => {
    const onRemoveMember = vi.fn()
    const view = renderPanel(null, null, [opus], vi.fn(), {
      ...seatCtx,
      openSeatKey: 's1',
      onRemoveMember,
    })
    expect(
      screen.getByText('Typed fields save when you leave them'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove from crew' }))
    expect(onRemoveMember).toHaveBeenCalledWith({ sessionId: 's1' })
    view.unmount()

    renderPanel(null, null, [glm], vi.fn(), {
      ...seatCtx,
      openSeatKey: 'baton:glm',
    })
    expect(
      screen.getByRole('button', { name: 'Delete recipe' }),
    ).toBeInTheDocument()
  })
})

describe('R9 — Add has two entries', () => {
  it('offers Add conversation… and a disabled New recipe that says when it comes', () => {
    renderPanel(null, null, [opus], vi.fn(), { ...seatCtx, addMenuOpen: true })
    const menu = screen.getByRole('menu', { name: 'Add a seat' })
    const items = within(menu).getAllByRole('menuitem')

    // Mutation: hide the New recipe entry -> one item, red.
    expect(items.map((item) => item.textContent)).toEqual([
      'Add conversation…',
      'New recipe',
    ])
    expect(items[1]).toBeDisabled()
    expect(items[1]!.parentElement).toHaveAttribute(
      'title',
      'Coming with MAR-3099',
    )
  })
})

describe('R10 — the edge states that are real', () => {
  it('shows an empty crew "No seats yet" with both add actions', () => {
    renderPanel(null, null, [], vi.fn(), seatCtx)
    expect(screen.getByText('No seats yet')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Add conversation…' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New recipe' })).toBeDisabled()
  })

  it('reads an orphan seat as "conversation gone", and offers to remove it without removing anything', () => {
    const onRemoveMember = vi.fn()
    const orphan: SessionCrewMember = {
      ...grok,
      conversationMissing: true,
    }
    const { rerender, props } = renderPanel(null, null, [orphan], vi.fn(), {
      ...seatCtx,
      onRemoveMember,
    })
    const row = screen.getByRole('button', { name: /^grok — / })
    expect(row).toHaveAccessibleName(/^grok — conversation gone · /)
    expect(row).toHaveClass('border-amber-500/50')
    expect(onRemoveMember).not.toHaveBeenCalled()

    rerender(<CrewSettingsPanel {...props} openSeatKey="s2" />)
    expect(
      screen.getByText('grok’s conversation no longer exists'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove seat' }))
    expect(onRemoveMember).toHaveBeenCalledWith({ sessionId: 's2' })
  })
})

describe('MAR-3118 lap 2 — E: the WIP stepper steps from what the field shows', () => {
  it('steps a typed WIP draft, once', () => {
    const onSeatEdit = vi.fn()
    renderPanel(null, null, [opus], onSeatEdit, {
      ...seatCtx,
      openSeatKey: 's1',
      seatDrafts: { s1: { wipLimit: '7' } },
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Raise the WIP limit for opus' }),
    )

    // Mutation: step from the record -> { wipLimit: 2 }, red.
    expect(onSeatEdit).toHaveBeenCalledTimes(1)
    expect(onSeatEdit).toHaveBeenCalledWith(
      { sessionId: 's1' },
      { wipLimit: 8 },
    )
  })
})

describe('MAR-3118 lap 2 — F1: one set of add actions', () => {
  it('shows an empty crew one New recipe even with the menu open, and no menu item outside a menu', () => {
    renderPanel(null, null, [], vi.fn(), { ...seatCtx, addMenuOpen: true })

    // Mutation: render the menu for an empty crew too -> two, red.
    expect(screen.getAllByRole('button', { name: 'New recipe' })).toHaveLength(
      1,
    )
    expect(screen.queryAllByRole('menuitem')).toEqual([])
  })
})
