import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectStore } from '@/entities/project'
import type { SessionCrew } from '@/entities/session-crew'
import { useSessionRelayStore } from '@/entities/session-relay'
import type { SessionRelay } from '@/entities/session-relay'
import { useSessionStore } from '@/entities/session'
import type { SessionSummary } from '@/entities/session'
import { CrewFlowSection } from './crew-flow-section.container'

function makeSession(id: string, name: string): SessionSummary {
  return {
    id,
    contextKind: 'project',
    projectId: 'project-1',
    workspaceId: null,
    providerId: 'claude-code',
    model: 'claude-opus-5',
    effort: null,
    name,
    status: 'idle',
    attention: 'none',
    activity: null,
    contextWindow: null,
    workingDirectory: '/repos/convergence',
    archivedAt: null,
    parentSessionId: null,
    forkStrategy: null,
    primarySurface: 'conversation',
    continuationToken: null,
    lastSequence: 0,
    createdAt: '2026-08-15T10:00:00.000Z',
    updatedAt: '2026-08-15T10:00:00.000Z',
  }
}

function makeCrew(sessionIds: string[]): SessionCrew {
  return {
    id: 'c1',
    name: 'Review loop',
    emoji: null,
    accentColor: null,
    position: 0,
    createdAt: '2026-08-15T10:00:00.000Z',
    updatedAt: '2026-08-15T10:00:00.000Z',
    sessionIds,
  }
}

function makeRelay(
  overrides: Partial<SessionRelay> & { id: string },
): SessionRelay {
  return {
    crewId: 'c1',
    sourceSessionId: 'impl',
    trigger: 'settled',
    action: 'hail',
    targetSessionId: 'review',
    spawnSpec: null,
    instruction: null,
    opener: null,
    armed: true,
    createdAt: '2026-08-15T10:00:00.000Z',
    updatedAt: '2026-08-15T10:00:00.000Z',
    ...overrides,
  }
}

let createRelay: ReturnType<typeof vi.fn>
let updateRelay: ReturnType<typeof vi.fn>
let deleteRelay: ReturnType<typeof vi.fn>
let arm: ReturnType<typeof vi.fn>
let disarm: ReturnType<typeof vi.fn>
let listAccounts: ReturnType<typeof vi.fn>

function makeAccount(
  id: string,
  overrides: Partial<{ isDefault: boolean; email: string; label: string }> = {},
) {
  return {
    id,
    providerId: 'codex',
    label: overrides.label ?? id,
    authKind: 'subscription',
    email: overrides.email ?? `${id}@example.com`,
    orgId: null,
    plan: null,
    configDir: `/tmp/${id}`,
    credentialDir: `/tmp/${id}-cred`,
    executionHostId: 'local',
    isDefault: overrides.isDefault ?? false,
    status: 'connected',
    lastValidatedAt: null,
    createdAt: '2026-08-19T00:00:00.000Z',
    updatedAt: '2026-08-19T00:00:00.000Z',
  }
}

function seedRelays(relays: SessionRelay[]) {
  useSessionRelayStore.setState({ relays, isLoaded: true })
}

describe('CrewFlowSection', () => {
  beforeEach(() => {
    listAccounts = vi.fn(async () => [])
    createRelay = vi.fn(async (input) =>
      makeRelay({ id: 'created', ...input, armed: input.armed ?? true }),
    )
    updateRelay = vi.fn(async (id, patch) => makeRelay({ id, ...patch }))
    deleteRelay = vi.fn(async () => undefined)
    arm = vi.fn(async (id) => makeRelay({ id, armed: true }))
    disarm = vi.fn(async (id) => makeRelay({ id, armed: false }))
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      relay: {
        list: vi.fn(async () => []),
        create: createRelay,
        update: updateRelay,
        delete: deleteRelay,
        arm,
        disarm,
        listHops: vi.fn(async () => []),
        onUpdated: vi.fn(() => () => undefined),
        onHopAppended: vi.fn(() => () => undefined),
      },
      providerAccounts: { list: listAccounts },
    }

    useSessionStore.setState({
      globalSessions: [
        makeSession('impl', 'Implementor'),
        makeSession('review', 'Reviewer'),
        makeSession('scribe', 'Scribe'),
      ],
      providers: [
        {
          id: 'codex',
          name: 'Codex',
          vendorLabel: 'OpenAI',
          kind: 'conversation',
          supportsContinuation: true,
          defaultModelId: 'gpt-5.6',
          modelOptions: [],
          attachments: {},
          midRunInput: {},
        },
        // A second conversational provider, so switching provider can be
        // exercised -- account ids belong to one provider only.
        {
          id: 'claude-code',
          name: 'Claude Code',
          vendorLabel: 'Anthropic',
          kind: 'conversation',
          supportsContinuation: true,
          defaultModelId: 'claude-opus-5',
          modelOptions: [],
          attachments: {},
          midRunInput: {},
        },
        // A shell provider has nothing to hand a payload to, so the form
        // must never offer it.
        {
          id: 'shell',
          name: 'Shell',
          vendorLabel: 'Local',
          kind: 'terminal',
          supportsContinuation: false,
          defaultModelId: '',
          modelOptions: [],
          attachments: {},
          midRunInput: {},
        },
      ],
    } as never)

    useProjectStore.setState({
      projects: [
        {
          id: 'project-1',
          name: 'Convergence',
          repositoryPath: '/repos/convergence',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    } as never)

    useSessionRelayStore.getState().unsubscribeBroadcast?.()
    useSessionRelayStore.getState().unsubscribeHops?.()
    useSessionRelayStore.setState({
      relays: [],
      hopsByCrewId: {},
      isLoaded: false,
      error: null,
      unsubscribeBroadcast: null,
      unsubscribeHops: null,
    })
  })

  it('invites the first wire when a crew has members but no relays', () => {
    render(<CrewFlowSection crew={makeCrew(['impl', 'review'])} />)

    expect(screen.getByText('0 relays')).toBeInTheDocument()
    expect(screen.getByText(/No relays yet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add relay' })).not.toBeDisabled()
  })

  it('still offers a wire when the crew holds only one session', () => {
    render(<CrewFlowSection crew={makeCrew(['impl'])} />)

    // One member cannot be hailed at, but it can still start a new session.
    expect(screen.getByRole('button', { name: 'Add relay' })).not.toBeDisabled()
    expect(screen.getByText(/start a new session/)).toBeInTheDocument()
  })

  it('will not offer a wire in a crew with nothing in it', () => {
    render(<CrewFlowSection crew={makeCrew([])} />)

    expect(screen.getByRole('button', { name: 'Add relay' })).toBeDisabled()
    expect(screen.getByText(/Add a session to this crew/)).toBeInTheDocument()
  })

  it('draws the implementor to reviewer wire entirely by clicking', async () => {
    render(<CrewFlowSection crew={makeCrew(['impl', 'review'])} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add relay' }))

    // Two pickers, both offering this crew's members and nobody else.
    const [sourceTrigger, targetTrigger] = screen.getAllByRole('combobox')
    fireEvent.click(sourceTrigger)
    fireEvent.click(await screen.findByRole('option', { name: /Implementor/ }))
    fireEvent.click(targetTrigger)
    fireEvent.click(await screen.findByRole('option', { name: /Reviewer/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Draw wire' }))

    await waitFor(() => {
      expect(createRelay).toHaveBeenCalledWith({
        crewId: 'c1',
        sourceSessionId: 'impl',
        action: 'hail',
        targetSessionId: 'review',
        instruction: null,
        opener: null,
        spawnSpec: null,
      })
    })
  })

  it('keeps the save button closed until both ends are picked', async () => {
    render(<CrewFlowSection crew={makeCrew(['impl', 'review'])} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add relay' }))

    expect(screen.getByRole('button', { name: 'Draw wire' })).toBeDisabled()
    expect(screen.getByText('Pick the session that finishes.')).toBeVisible()

    const [sourceTrigger] = screen.getAllByRole('combobox')
    fireEvent.click(sourceTrigger)
    fireEvent.click(await screen.findByRole('option', { name: /Implementor/ }))

    expect(screen.getByRole('button', { name: 'Draw wire' })).toBeDisabled()
    expect(
      screen.getByText('Pick the session that receives its last message.'),
    ).toBeVisible()
  })

  it('refuses a wire pointing at its own source, in words', async () => {
    render(<CrewFlowSection crew={makeCrew(['impl', 'review'])} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add relay' }))
    const [sourceTrigger, targetTrigger] = screen.getAllByRole('combobox')
    fireEvent.click(sourceTrigger)
    fireEvent.click(await screen.findByRole('option', { name: /Implementor/ }))
    fireEvent.click(targetTrigger)
    fireEvent.click(await screen.findByRole('option', { name: /Implementor/ }))

    expect(
      screen.getByText('A relay cannot hail the session it listens to.'),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Draw wire' })).toBeDisabled()
    expect(createRelay).not.toHaveBeenCalled()
  })

  it('refuses a duplicate of a wire the crew already has', async () => {
    seedRelays([makeRelay({ id: 'r1' })])
    render(<CrewFlowSection crew={makeCrew(['impl', 'review'])} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add relay' }))
    const [sourceTrigger, targetTrigger] = screen.getAllByRole('combobox')
    fireEvent.click(sourceTrigger)
    fireEvent.click(await screen.findByRole('option', { name: /Implementor/ }))
    fireEvent.click(targetTrigger)
    fireEvent.click(await screen.findByRole('option', { name: /Reviewer/ }))

    expect(screen.getByText('This crew already has that wire.')).toBeVisible()
  })

  it('reads an existing wire as a sentence', () => {
    seedRelays([makeRelay({ id: 'r1' })])
    render(<CrewFlowSection crew={makeCrew(['impl', 'review'])} />)

    expect(screen.getByText('1 relay')).toBeInTheDocument()
    expect(
      screen.getByRole('switch', {
        name: 'Armed: When Implementor finishes, send its last message to Reviewer',
      }),
    ).toBeInTheDocument()
  })

  it('disarms and re-arms in one click', async () => {
    seedRelays([makeRelay({ id: 'r1' })])
    render(<CrewFlowSection crew={makeCrew(['impl', 'review'])} />)

    fireEvent.click(screen.getByRole('switch', { name: /^Armed:/ }))
    await waitFor(() => expect(disarm).toHaveBeenCalledWith('r1'))

    fireEvent.click(await screen.findByRole('switch', { name: /^Disarmed:/ }))
    await waitFor(() => expect(arm).toHaveBeenCalledWith('r1'))
  })

  it('repoints an existing wire through the edit form', async () => {
    seedRelays([makeRelay({ id: 'r1' })])
    render(<CrewFlowSection crew={makeCrew(['impl', 'review', 'scribe'])} />)

    fireEvent.click(screen.getByRole('button', { name: /^Edit relay:/ }))
    const [, targetTrigger] = screen.getAllByRole('combobox')
    fireEvent.click(targetTrigger)
    fireEvent.click(await screen.findByRole('option', { name: /Scribe/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save wire' }))

    await waitFor(() => {
      expect(updateRelay).toHaveBeenCalledWith('r1', {
        sourceSessionId: 'impl',
        action: 'hail',
        targetSessionId: 'scribe',
        instruction: null,
        opener: null,
        spawnSpec: null,
      })
    })
  })

  describe('instructions on the wire', () => {
    const INSTRUCTION_LABEL = /Instructions \(optional\)/

    it('sends the brief the user typed with the wire', async () => {
      render(<CrewFlowSection crew={makeCrew(['impl', 'review'])} />)

      fireEvent.click(screen.getByRole('button', { name: 'Add relay' }))
      const [sourceTrigger, targetTrigger] = screen.getAllByRole('combobox')
      fireEvent.click(sourceTrigger)
      fireEvent.click(
        await screen.findByRole('option', { name: /Implementor/ }),
      )
      fireEvent.click(targetTrigger)
      fireEvent.click(await screen.findByRole('option', { name: /Reviewer/ }))

      fireEvent.change(screen.getByLabelText(INSTRUCTION_LABEL), {
        target: { value: 'Take a look at this and push back.' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Draw wire' }))

      await waitFor(() => {
        expect(createRelay).toHaveBeenCalledWith(
          expect.objectContaining({
            instruction: 'Take a look at this and push back.',
          }),
        )
      })
    })

    it('offers the same box for a spawn wire', async () => {
      render(<CrewFlowSection crew={makeCrew(['impl'])} />)

      fireEvent.click(screen.getByRole('button', { name: 'Add relay' }))

      // A crew of one opens straight onto the spawn branch; the brief belongs
      // there too, because the question is about the far end either way.
      expect(screen.getByLabelText(INSTRUCTION_LABEL)).toBeVisible()
    })

    it('loads an existing brief into the form and can clear it', async () => {
      seedRelays([makeRelay({ id: 'r1', instruction: 'Review it closely.' })])
      render(<CrewFlowSection crew={makeCrew(['impl', 'review'])} />)

      fireEvent.click(screen.getByRole('button', { name: /Edit relay/ }))
      const box = screen.getByLabelText(INSTRUCTION_LABEL)
      expect(box).toHaveValue('Review it closely.')

      fireEvent.change(box, { target: { value: '  ' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save wire' }))

      await waitFor(() => {
        // An emptied box must actually remove the brief, not silently keep the
        // old one because the field looked untouched.
        expect(updateRelay).toHaveBeenCalledWith(
          'r1',
          expect.objectContaining({ instruction: null }),
        )
      })
    })

    it('marks a briefed wire in its sentence without printing the brief', () => {
      seedRelays([makeRelay({ id: 'r1', instruction: 'Review it closely.' })])
      render(<CrewFlowSection crew={makeCrew(['impl', 'review'])} />)

      expect(screen.getByText('· with instructions')).toBeVisible()
      expect(screen.queryByText(/Review it closely/)).toBeNull()
    })
  })

  describe('the opener: a first send before the payload', () => {
    const OPENER_LABEL = /First send \(optional\)/

    async function drawImplToReviewer() {
      fireEvent.click(screen.getByRole('button', { name: 'Add relay' }))
      const [sourceTrigger, targetTrigger] = screen.getAllByRole('combobox')
      fireEvent.click(sourceTrigger)
      fireEvent.click(
        await screen.findByRole('option', { name: /Implementor/ }),
      )
      fireEvent.click(targetTrigger)
      fireEvent.click(await screen.findByRole('option', { name: /Reviewer/ }))
    }

    it('sends the first send the user typed with the wire', async () => {
      render(<CrewFlowSection crew={makeCrew(['impl', 'review'])} />)
      await drawImplToReviewer()

      fireEvent.change(screen.getByLabelText(OPENER_LABEL), {
        target: { value: '/clear' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Draw wire' }))

      await waitFor(() => {
        expect(createRelay).toHaveBeenCalledWith(
          expect.objectContaining({ opener: '/clear' }),
        )
      })
    })

    it('sends null when the box was left alone', async () => {
      render(<CrewFlowSection crew={makeCrew(['impl', 'review'])} />)
      await drawImplToReviewer()

      fireEvent.click(screen.getByRole('button', { name: 'Draw wire' }))

      await waitFor(() => {
        expect(createRelay).toHaveBeenCalledWith(
          expect.objectContaining({ opener: null }),
        )
      })
    })

    /**
     * A spawn opens a session that has never been used. Offering a first send
     * there would invite a wire that quietly does nothing.
     */
    it('does not offer the box on a spawn wire', async () => {
      render(<CrewFlowSection crew={makeCrew(['impl'])} />)

      fireEvent.click(screen.getByRole('button', { name: 'Add relay' }))

      expect(screen.queryByLabelText(OPENER_LABEL)).toBeNull()
    })

    it('loads an existing first send into the form and can clear it', async () => {
      seedRelays([makeRelay({ id: 'r1', opener: '/clear' })])
      render(<CrewFlowSection crew={makeCrew(['impl', 'review'])} />)

      fireEvent.click(screen.getByRole('button', { name: /Edit relay/ }))
      const box = screen.getByLabelText(OPENER_LABEL)
      expect(box).toHaveValue('/clear')

      fireEvent.change(box, { target: { value: '  ' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save wire' }))

      await waitFor(() => {
        expect(updateRelay).toHaveBeenCalledWith(
          'r1',
          expect.objectContaining({ opener: null }),
        )
      })
    })

    it('quotes the first send in the wire’s sentence', () => {
      // The literal text, not "sends something first": which command it is
      // decides whether the target keeps its memory.
      seedRelays([makeRelay({ id: 'r1', opener: '/clear' })])
      render(<CrewFlowSection crew={makeCrew(['impl', 'review'])} />)

      expect(screen.getByText('· sends /clear first')).toBeVisible()
    })
  })

  it('asks twice before cutting a wire', async () => {
    seedRelays([makeRelay({ id: 'r1' })])
    render(<CrewFlowSection crew={makeCrew(['impl', 'review'])} />)

    fireEvent.click(screen.getByRole('button', { name: /^Delete relay:/ }))
    expect(deleteRelay).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Delete wire?' }))
    await waitFor(() => expect(deleteRelay).toHaveBeenCalledWith('r1'))
  })

  it('says plainly when an end of a wire was deleted', () => {
    seedRelays([makeRelay({ id: 'r1', targetSessionId: 'vanished' })])
    render(<CrewFlowSection crew={makeCrew(['impl', 'review'])} />)

    expect(
      screen.getByText('a session that no longer exists'),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText('This wire has an end that no longer exists'),
    ).toBeInTheDocument()
  })

  it('keeps the form open and shows why when the backend rejects the wire', async () => {
    createRelay.mockRejectedValue(new Error('Relay crew cannot be empty'))
    render(<CrewFlowSection crew={makeCrew(['impl', 'review'])} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add relay' }))
    const [sourceTrigger, targetTrigger] = screen.getAllByRole('combobox')
    fireEvent.click(sourceTrigger)
    fireEvent.click(await screen.findByRole('option', { name: /Implementor/ }))
    fireEvent.click(targetTrigger)
    fireEvent.click(await screen.findByRole('option', { name: /Reviewer/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Draw wire' }))

    expect(
      await screen.findByText('Relay crew cannot be empty'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Draw wire' }),
    ).toBeInTheDocument()
  })

  describe('spawn wires', () => {
    it('draws a start-a-new-session wire entirely by clicking', async () => {
      render(<CrewFlowSection crew={makeCrew(['impl', 'review'])} />)

      fireEvent.click(screen.getByRole('button', { name: 'Add relay' }))

      const [sourceTrigger] = screen.getAllByRole('combobox')
      fireEvent.click(sourceTrigger)
      fireEvent.click(
        await screen.findByRole('option', { name: /Implementor/ }),
      )

      fireEvent.click(
        screen.getByRole('button', { name: 'start a new session' }),
      )

      // The target picker is replaced by the spec fields.
      const [, providerTrigger, projectTrigger] =
        screen.getAllByRole('combobox')
      fireEvent.click(providerTrigger)
      fireEvent.click(await screen.findByRole('option', { name: /Codex/ }))
      fireEvent.click(projectTrigger)
      fireEvent.click(
        await screen.findByRole('option', { name: /Convergence/ }),
      )
      fireEvent.change(screen.getByLabelText('Name for the new session'), {
        target: { value: 'Reviewer' },
      })

      fireEvent.click(screen.getByRole('button', { name: 'Draw wire' }))

      await waitFor(() => {
        expect(createRelay).toHaveBeenCalledWith({
          crewId: 'c1',
          sourceSessionId: 'impl',
          action: 'spawn',
          targetSessionId: null,
          instruction: null,
          opener: null,
          spawnSpec: {
            projectId: 'project-1',
            providerId: 'codex',
            model: null,
            effort: null,
            name: 'Reviewer',
            providerAccountId: null,
          },
        })
      })
    })

    /**
     * A preload without the accounts bridge throws synchronously, which no
     * `.catch` on the promise would ever see. The Flow section has to keep
     * drawing wires regardless -- the engine falls back to ambient.
     */
    it('still draws its wires when accounts cannot be read at all', async () => {
      ;(
        window as unknown as { electronAPI: { providerAccounts?: unknown } }
      ).electronAPI.providerAccounts = undefined

      render(<CrewFlowSection crew={makeCrew(['impl', 'review'])} />)

      expect(
        await screen.findByRole('button', { name: 'Add relay' }),
      ).toBeInTheDocument()
    })

    it('preselects the enrolled default once a provider is chosen', async () => {
      listAccounts.mockResolvedValue([
        makeAccount('work'),
        makeAccount('personal', { isDefault: true, email: 'me@proton.me' }),
      ])
      render(<CrewFlowSection crew={makeCrew(['impl', 'review'])} />)

      fireEvent.click(screen.getByRole('button', { name: 'Add relay' }))
      const [sourceTrigger] = screen.getAllByRole('combobox')
      fireEvent.click(sourceTrigger)
      fireEvent.click(
        await screen.findByRole('option', { name: /Implementor/ }),
      )
      fireEvent.click(
        screen.getByRole('button', { name: 'start a new session' }),
      )

      // No provider chosen yet, so there is nothing to pick an account from.
      expect(screen.queryByText('me@proton.me')).not.toBeInTheDocument()

      const [, providerTrigger] = screen.getAllByRole('combobox')
      fireEvent.click(providerTrigger)
      fireEvent.click(await screen.findByRole('option', { name: /Codex/ }))

      // The account the composer would have preselected, without being asked.
      expect(await screen.findByText('me@proton.me')).toBeInTheDocument()
    })

    it('saves the account the wire was given', async () => {
      listAccounts.mockResolvedValue([
        makeAccount('work', { email: 'work@example.com' }),
        makeAccount('personal', { isDefault: true, email: 'me@proton.me' }),
      ])
      render(<CrewFlowSection crew={makeCrew(['impl', 'review'])} />)

      fireEvent.click(screen.getByRole('button', { name: 'Add relay' }))
      const [sourceTrigger] = screen.getAllByRole('combobox')
      fireEvent.click(sourceTrigger)
      fireEvent.click(
        await screen.findByRole('option', { name: /Implementor/ }),
      )
      fireEvent.click(
        screen.getByRole('button', { name: 'start a new session' }),
      )

      const [, providerTrigger] = screen.getAllByRole('combobox')
      fireEvent.click(providerTrigger)
      fireEvent.click(await screen.findByRole('option', { name: /Codex/ }))

      // Swap off the default onto the other account.
      const accountTrigger = await screen.findByRole('combobox', {
        name: /me@proton.me/,
      })
      fireEvent.click(accountTrigger)
      fireEvent.click(
        await screen.findByRole('option', { name: /work@example.com/ }),
      )

      fireEvent.change(screen.getByLabelText('Name for the new session'), {
        target: { value: 'Reviewer' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Draw wire' }))

      await waitFor(() => {
        expect(createRelay).toHaveBeenCalledWith(
          expect.objectContaining({
            spawnSpec: expect.objectContaining({ providerAccountId: 'work' }),
          }),
        )
      })
    })

    /**
     * Account ids belong to one provider, so a choice made under Codex would
     * name an account Claude cannot serve.
     */
    it('re-asks the account question when the provider changes', async () => {
      listAccounts.mockResolvedValue([
        makeAccount('personal', { isDefault: true, email: 'me@proton.me' }),
      ])
      render(<CrewFlowSection crew={makeCrew(['impl', 'review'])} />)

      fireEvent.click(screen.getByRole('button', { name: 'Add relay' }))
      const [sourceTrigger] = screen.getAllByRole('combobox')
      fireEvent.click(sourceTrigger)
      fireEvent.click(
        await screen.findByRole('option', { name: /Implementor/ }),
      )
      fireEvent.click(
        screen.getByRole('button', { name: 'start a new session' }),
      )

      const [, providerTrigger] = screen.getAllByRole('combobox')
      fireEvent.click(providerTrigger)
      fireEvent.click(await screen.findByRole('option', { name: /Codex/ }))
      expect(await screen.findByText('me@proton.me')).toBeInTheDocument()

      // Claude has no enrolled accounts in this room, so the picker goes away
      // rather than keeping a Codex account selected.
      fireEvent.click(screen.getAllByRole('combobox')[1])
      fireEvent.click(await screen.findByRole('option', { name: /Claude/ }))

      await waitFor(() => {
        expect(screen.queryByText('me@proton.me')).not.toBeInTheDocument()
      })
    })

    it('shows no account picker when nothing is enrolled', async () => {
      render(<CrewFlowSection crew={makeCrew(['impl', 'review'])} />)

      fireEvent.click(screen.getByRole('button', { name: 'Add relay' }))
      const [sourceTrigger] = screen.getAllByRole('combobox')
      fireEvent.click(sourceTrigger)
      fireEvent.click(
        await screen.findByRole('option', { name: /Implementor/ }),
      )
      fireEvent.click(
        screen.getByRole('button', { name: 'start a new session' }),
      )
      const [, providerTrigger] = screen.getAllByRole('combobox')
      fireEvent.click(providerTrigger)
      fireEvent.click(await screen.findByRole('option', { name: /Codex/ }))

      // Three: source, provider, project. No account picker.
      await waitFor(() => {
        expect(screen.getAllByRole('combobox')).toHaveLength(3)
      })
    })

    it('asks for a provider rather than a target', async () => {
      render(<CrewFlowSection crew={makeCrew(['impl', 'review'])} />)

      fireEvent.click(screen.getByRole('button', { name: 'Add relay' }))
      const [sourceTrigger] = screen.getAllByRole('combobox')
      fireEvent.click(sourceTrigger)
      fireEvent.click(
        await screen.findByRole('option', { name: /Implementor/ }),
      )
      fireEvent.click(
        screen.getByRole('button', { name: 'start a new session' }),
      )

      expect(
        screen.getByText('Pick the provider for the new session.'),
      ).toBeVisible()
      expect(screen.getByRole('button', { name: 'Draw wire' })).toBeDisabled()
    })

    it('names the session it will open, and where', () => {
      seedRelays([
        makeRelay({
          id: 'r1',
          action: 'spawn',
          targetSessionId: null,
          spawnSpec: {
            projectId: 'project-1',
            providerId: 'codex',
            model: null,
            effort: null,
            name: 'Reviewer',
            providerAccountId: null,
          },
        }),
      ])
      render(<CrewFlowSection crew={makeCrew(['impl', 'review'])} />)

      expect(
        screen.getByRole('switch', {
          name: 'Armed: When Implementor finishes, start a new session called Reviewer — codex in Convergence',
        }),
      ).toBeInTheDocument()
    })

    it('falls back to a default name when the user typed none', async () => {
      render(<CrewFlowSection crew={makeCrew(['impl'])} />)

      fireEvent.click(screen.getByRole('button', { name: 'Add relay' }))
      const [sourceTrigger, providerTrigger] = screen.getAllByRole('combobox')
      fireEvent.click(sourceTrigger)
      fireEvent.click(
        await screen.findByRole('option', { name: /Implementor/ }),
      )
      fireEvent.click(providerTrigger)
      fireEvent.click(await screen.findByRole('option', { name: /Codex/ }))

      fireEvent.click(screen.getByRole('button', { name: 'Draw wire' }))

      await waitFor(() => {
        expect(createRelay).toHaveBeenCalledWith(
          expect.objectContaining({
            spawnSpec: expect.objectContaining({ name: 'Relayed session' }),
          }),
        )
      })
    })
  })

  it('only shows the wires belonging to this crew', () => {
    seedRelays([
      makeRelay({ id: 'mine' }),
      makeRelay({ id: 'theirs', crewId: 'other-crew' }),
    ])
    render(<CrewFlowSection crew={makeCrew(['impl', 'review'])} />)

    expect(screen.getByText('1 relay')).toBeInTheDocument()
  })
})
