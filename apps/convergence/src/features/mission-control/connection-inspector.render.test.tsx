import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  EMPTY_SPAWN_SPEC,
  CONVERSATION_RESET_COMMAND,
  beforeDeliveryOptions,
  customOpenerNote,
  draftFromRelay,
  newConnectionDraft,
} from './connection-draft.pure'
import type { ConnectionDraft } from './connection-draft.pure'
import {
  ConnectionInspector,
  SPAWN_RECIPIENT_OPTION_ID,
} from './connection-inspector.presentational'
import type { SessionRelay } from '@/entities/session-relay'

/**
 * The connection panel, rendered (the MAR-2280 law).
 *
 * The panel REPLACES the retired editor and the retired row, so the thing
 * worth proving is not that a pure function returns the right shape — the
 * pure tests do that — but that each capability actually reached the screen.
 * A capability that exists in a draft and never renders is a capability the
 * user lost.
 */
function relay(overrides: Partial<SessionRelay> = {}): SessionRelay {
  return {
    id: 'wire-1',
    crewId: 'c1',
    sourceSessionId: 'fable',
    trigger: 'settled',
    action: 'hail',
    targetSessionId: 'opus',
    spawnSpec: null,
    instruction: null,
    opener: null,
    conditionToken: null,
    armed: true,
    createdAt: '2026-09-06T10:00:00.000Z',
    updatedAt: '2026-09-06T10:00:00.000Z',
    ...overrides,
  }
}

function renderInspector(
  overrides: {
    draft?: ConnectionDraft
    supportsReset?: boolean
    providerName?: string
    isNew?: boolean
    dirty?: boolean
    saveError?: string | null
    recipientMissing?: boolean
    recipientNote?: string | null
    handlers?: Partial<Record<string, ReturnType<typeof vi.fn>>>
  } = {},
) {
  const draft =
    overrides.draft ??
    newConnectionDraft({ sourceSessionId: 'fable', targetSessionId: 'opus' })
  const supportsReset = overrides.supportsReset ?? true
  const handlers = {
    onRecipientChange: vi.fn(),
    onSpawnChange: vi.fn(),
    onEnabledChange: vi.fn(),
    onConditionKindChange: vi.fn(),
    onConditionTokenChange: vi.fn(),
    onBeforeDeliveryChange: vi.fn(),
    onCustomOpenerChange: vi.fn(),
    onInstructionsChange: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
    ...overrides.handlers,
  }

  render(
    <ConnectionInspector
      sourceName="Fable"
      recipientName="Opus"
      draft={draft}
      isNew={overrides.isNew ?? false}
      dirty={overrides.dirty ?? false}
      saveError={overrides.saveError ?? null}
      recipientMissing={overrides.recipientMissing ?? false}
      recipientOptions={[{ id: 'opus', label: 'Opus' }]}
      beforeDelivery={beforeDeliveryOptions({
        supportsReset,
        providerName: overrides.providerName ?? 'Claude Code',
        recipientName: 'Opus',
      })}
      customOpenerNote={customOpenerNote(draft, supportsReset)}
      recipientNote={overrides.recipientNote ?? null}
      problem={null}
      busy={false}
      projectOptions={[]}
      providerOptions={[{ id: 'codex', label: 'Codex' }]}
      modelOptions={[]}
      effortOptions={[]}
      spawnAccounts={[]}
      hostOptions={[
        { id: 'local', label: 'laptop' },
        { id: 'little-monster', label: 'little-monster' },
      ]}
      workAddressSlot={{ mode: 'hidden' }}
      onWorkAddressChange={vi.fn()}
      onBranchChange={vi.fn()}
      {...handlers}
    />,
  )
  return handlers
}

describe('the connection inspector, rendered', () => {
  it('says whether what is on screen is stored', () => {
    renderInspector({ isNew: true })
    expect(screen.getByText('Not saved yet')).toBeInTheDocument()
  })

  it('tells an unsaved change apart from a saved one', () => {
    renderInspector({ dirty: true })
    expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument()
  })

  /**
   * Frame 09, and the promise that made it a frame: a save that fails keeps
   * the draft AND says the stored wire is unchanged. A panel that only said
   * "couldn't save" leaves the person unsure which version is live.
   *
   * Mutation that reds it: clear the draft on a failed save (the container's
   * `save` would have to throw the form away), or drop the second sentence.
   */
  it('keeps the draft and names the stored wire untouched when a save fails', () => {
    const draft: ConnectionDraft = {
      ...newConnectionDraft({
        sourceSessionId: 'fable',
        targetSessionId: 'opus',
      }),
      instructions: 'Implement the brief and return verification evidence.',
    }
    renderInspector({ draft, saveError: 'The database is locked.' })

    expect(screen.getByText('Couldn’t save the connection')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Your draft is kept here. The saved connection has not changed.',
      ),
    ).toBeInTheDocument()
    // The typed work is still on screen: that is the expensive half.
    expect(
      screen.getByDisplayValue(
        'Implement the brief and return verification evidence.',
      ),
    ).toBeInTheDocument()
    // And retrying is about SETTINGS, never about resending.
    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Trying again saves settings. It does not resend a message.',
      ),
    ).toBeInTheDocument()
  })

  /**
   * R8, on the screen. *Clear* is offered either way — disabled with its
   * reason where the provider cannot do it — because a control that vanishes
   * teaches nothing.
   *
   * Mutation that reds it: hide the unsupported option instead of disabling
   * it, or drop the `disabled` binding so it looks available.
   */
  it('offers Clear enabled for a provider that can reset', () => {
    renderInspector({ supportsReset: true, providerName: 'Claude Code' })

    const clear = screen.getByRole('button', {
      name: /Clear Opus conversation/,
    })
    expect(clear).toBeInTheDocument()
    expect(clear).not.toBeDisabled()
  })

  it('offers Clear disabled, with the reason, for a provider that cannot', () => {
    renderInspector({ supportsReset: false, providerName: 'Codex' })

    const clear = screen.getByRole('button', {
      name: /Clear Opus conversation/,
    })
    expect(clear).toBeDisabled()
    expect(clear).toHaveAttribute('title', expect.stringContaining('Codex'))
    // The custom first message survives on every provider (R8).
    expect(
      screen.getByRole('button', { name: 'Send a custom first message…' }),
    ).not.toBeDisabled()
  })

  it('renders a stored reset as a custom first message, and says why', () => {
    const draft = draftFromRelay(
      relay({ opener: CONVERSATION_RESET_COMMAND }),
      {
        supportsReset: false,
      },
    )
    renderInspector({ draft, supportsReset: false, providerName: 'Codex' })

    // The text is still there, in the box, unchanged.
    expect(
      screen.getByDisplayValue(CONVERSATION_RESET_COMMAND),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        `This connection was saved with ${CONVERSATION_RESET_COMMAND}, which this provider reads as an ordinary message.`,
      ),
    ).toBeInTheDocument()
  })

  /**
   * R9. The spawn path has no frame of its own, which is exactly why it is
   * the capability most likely to be dropped in a redesign.
   *
   * Mutation that reds it: remove the `Start a new session…` entry from the
   * recipient list.
   */
  it('offers starting a new session as a recipient', async () => {
    const handlers = renderInspector()

    fireEvent.click(screen.getByRole('combobox', { name: /Opus/i }))
    const option = await screen.findByText('Start a new session…')
    expect(option).toBeInTheDocument()

    fireEvent.click(option)
    expect(handlers.onRecipientChange).toHaveBeenCalledWith(
      SPAWN_RECIPIENT_OPTION_ID,
    )
  })

  it('shows the spawn spec once a new session is the recipient', () => {
    const draft: ConnectionDraft = {
      ...newConnectionDraft({ sourceSessionId: 'fable' }),
      recipient: {
        kind: 'spawn',
        spec: {
          ...EMPTY_SPAWN_SPEC,
          projectId: null,
          providerId: 'codex',
          model: null,
          effort: null,
          name: 'Reviewer',
          providerAccountId: null,
        },
      },
    }
    renderInspector({ draft })

    expect(
      screen.getByText('The session this connection opens'),
    ).toBeInTheDocument()
    expect(screen.getByDisplayValue('Reviewer')).toBeInTheDocument()
    // A spawn opens a conversation that has never been used, so there is
    // nothing to keep, clear, or say first.
    expect(screen.queryByText('Before delivery')).not.toBeInTheDocument()
  })

  it('offers both firing conditions, and the token only when one is chosen', () => {
    const handlers = renderInspector()

    expect(
      screen.getByRole('button', { name: 'Any finish' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByLabelText('The final line this connection waits for'),
    ).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Only when a final line matches' }),
    )
    expect(handlers.onConditionKindChange).toHaveBeenCalledWith('token')
  })

  it('shows the declared route a conditioned connection waits for', () => {
    const draft = draftFromRelay(relay({ conditionToken: 'BATON: horse' }), {
      supportsReset: true,
    })
    renderInspector({ draft })

    expect(screen.getByDisplayValue('BATON: horse')).toBeInTheDocument()
  })

  /** Frame 10-01: the row survives; only its far end is gone. */
  it('says the recipient is unavailable without losing the connection', () => {
    renderInspector({ recipientMissing: true })

    expect(screen.getByText('Recipient unavailable')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Existing history stays readable, even when a conversation is missing.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Delete connection' }),
    ).toBeInTheDocument()
  })

  it('arms a new Off connection (mutation: enable new drafts)', () => {
    const handlers = renderInspector()

    const toggle = screen.getByRole('switch')
    expect(
      screen.getByText(
        'Saved connections can stay off while you build the crew.',
      ),
    ).toBeInTheDocument()

    fireEvent.click(toggle)
    // Storing a switch, and nothing else: enabling never sends.
    expect(handlers.onEnabledChange).toHaveBeenCalledWith(true)
    expect(handlers.onSave).not.toHaveBeenCalled()
  })

  it('offers no delete for a connection that was never stored', () => {
    renderInspector({ isNew: true })

    expect(
      screen.queryByRole('button', { name: 'Delete connection' }),
    ).not.toBeInTheDocument()
  })
})

it('offers the errand host, identity and optional report (mutation: omit host picker)', async () => {
  const draft = newConnectionDraft({ sourceSessionId: 'fable' })
  draft.recipient = {
    kind: 'spawn',
    spec: { ...EMPTY_SPAWN_SPEC, providerId: 'codex' },
  }
  const handlers = renderInspector({ draft })
  fireEvent.click(screen.getByRole('combobox', { name: 'laptop' }))
  fireEvent.click(await screen.findByRole('option', { name: 'little-monster' }))
  expect(handlers.onSpawnChange).toHaveBeenCalledWith({
    executionHost: 'little-monster',
    workAddress: null,
    providerAccountId: null,
    returnWire: null,
  })
  fireEvent.change(screen.getByRole('textbox', { name: 'Role card' }), {
    target: { value: 'You are the reviewer.' },
  })
  expect(handlers.onSpawnChange).toHaveBeenCalledWith({
    roleCard: 'You are the reviewer.',
  })
  expect(
    screen.getByRole('switch', {
      name: 'Report back to Fable when it finishes',
    }),
  ).toBeChecked()
})
