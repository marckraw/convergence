import { useWorkLedgerStore } from '@/entities/work-ledger'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { SessionCrew } from '@/entities/session-crew'
import type {
  TrackerCredentialStatus,
  TrackerProbeReading,
  TrackerProjectResolution,
} from '@/shared/types/tracker.types'
import { TrackerBindingForm } from './tracker-binding-form.presentational'
import { TrackerBindingFormContainer } from './tracker-binding-form.container'

/**
 * The tracker binding form, rendered (MAR-3084 R9; the MAR-2280 law): the
 * sentence a person reads is asserted on the screen, not in the pure helper.
 */

const KEY = 'lin_api_fixture_never_shown_back'
const AT = '2026-09-17T08:04:00.000Z'

function renderForm(overrides: {
  dispatchCandidates?: readonly string[]
  onAutoDispatchChange?: (enabled: boolean) => void
  credential?: 'present' | 'absent' | null
  lastProbe?: TrackerProbeReading | null
  keyDraft?: string
}) {
  const noop = vi.fn()
  return render(
    <TrackerBindingForm
      dispatchCandidates={overrides.dispatchCandidates}
      onAutoDispatchChange={overrides.onAutoDispatchChange}
      draft={{
        projectId: 'project-1',
        labelPrefix: 'horse:',
        wavePrefix: 'wave:',
      }}
      bound
      credential={overrides.credential ?? 'present'}
      keyDraft={overrides.keyDraft ?? ''}
      lastProbe={overrides.lastProbe ?? null}
      busy={false}
      error={null}
      onDraftChange={noop}
      onSaveBinding={noop}
      onUnbind={noop}
      onKeyDraftChange={noop}
      onSaveKey={noop}
      onForgetKey={noop}
      onTest={noop}
    />,
  )
}

afterEach(() => {
  useWorkLedgerStore.setState({ snapshots: {}, unsubscribeBroadcast: null })
  cleanup()
  delete (window as unknown as { electronAPI?: unknown }).electronAPI
})

describe('MAR-3084 R9: the binding form shows facts, not the key', () => {
  it('present + a probe of 12 reads "12 labeled issues in convergence", with the four fields and the time', () => {
    renderForm({
      credential: 'present',
      lastProbe: {
        probe: { ok: true, issues: 12, projectName: 'convergence' },
        at: AT,
      },
    })

    expect(screen.getByText('12 labeled issues in convergence')).toBeTruthy()
    expect(screen.getByText('Stored in Keychain')).toBeTruthy()
    expect(screen.getByText('Linear')).toBeTruthy()
    expect(screen.getByLabelText('Tracker project')).toHaveProperty(
      'value',
      'project-1',
    )
    expect(screen.getByLabelText('Tracker label prefix')).toHaveProperty(
      'value',
      'horse:',
    )
    expect(screen.getByLabelText('Tracker wave prefix')).toHaveProperty(
      'value',
      'wave:',
    )
    expect(screen.getByText(/^Tested at /)).toBeTruthy()
    // A stored key offers no key field at all.
    expect(screen.queryByLabelText('Linear API key')).toBeNull()
  })

  it('unauthorized reads the refusal by name and offers entering the key again', () => {
    renderForm({
      credential: 'present',
      lastProbe: {
        probe: {
          ok: false,
          refusal: {
            kind: 'unauthorized',
            message: 'Linear refused the API key.',
            retryAt: null,
          },
        },
        at: AT,
      },
    })

    expect(screen.getByText(/^Linear refused the API key — /)).toBeTruthy()
    expect(screen.getByLabelText('Enter the Linear API key again')).toBeTruthy()
  })

  it('a stored key is never shown back: the field empties once the Keychain has it', async () => {
    const crew = {
      id: 'crew-1',
      name: 'Loom',
      emoji: null,
      accentColor: null,
      position: 0,
      roundCap: null,
      stallMinutes: null,
      lapCap: null,
      createdAt: AT,
      updatedAt: AT,
      sessionIds: [],
      members: [],
      trackerBinding: {
        kind: 'linear',
        autoDispatch: false,
        projectId: 'project-1',
        labelPrefix: 'horse:',
        wavePrefix: 'wave:',
        statusMap: {},
      },
    } satisfies SessionCrew
    const setCredential = vi.fn(async () => 'present' as const)
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      workLedger: {
        onUpdated: () => () => {},
        list: async () => ({
          crewId: 'c',
          entries: [],
          dispatchPlan: null,
          trackerHealth: null,
        }),
      },
      tracker: {
        credentialStatus: vi.fn(async () => 'absent' as const),
        setCredential,
        deleteCredential: vi.fn(async () => 'absent' as const),
        probe: vi.fn(async () => ({
          probe: { ok: true, issues: 3, projectName: 'convergence' },
          at: AT,
        })),
        resolveProject: vi.fn(),
      },
      crew: { setTrackerBinding: vi.fn(async () => crew) },
    }

    render(<TrackerBindingFormContainer crew={crew} />)
    await screen.findByText('Not stored')

    fireEvent.change(screen.getByLabelText('Linear API key'), {
      target: { value: KEY },
    })
    expect(screen.queryByDisplayValue(KEY)).not.toBeNull()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Store key' }))
    })

    await waitFor(() =>
      expect(screen.getByText('Stored in Keychain')).toBeTruthy(),
    )
    expect(setCredential).toHaveBeenCalledWith('crew-1', KEY)
    // Mutation: keep the typed key after storing it -> red here.
    expect(screen.queryByDisplayValue(KEY)).toBeNull()
    expect(document.body.textContent).not.toContain(KEY)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    })
    await screen.findByText('3 labeled issues in convergence')
  })
})

describe('MAR-3156 R3: what happens when Bind is pressed', () => {
  const UUID = '4f6d2a1e-8b3c-4d5e-9f01-2a3b4c5d6e7f'
  const URL = 'https://linear.app/marckraw/project/convergence-0a1b2c3d4e5f'

  function crewFor(projectId: string): SessionCrew {
    return {
      id: 'crew-1',
      name: 'Loom',
      emoji: null,
      accentColor: null,
      position: 0,
      roundCap: null,
      stallMinutes: null,
      lapCap: null,
      createdAt: AT,
      updatedAt: AT,
      sessionIds: [],
      members: [],
      trackerBinding: {
        kind: 'linear',
        autoDispatch: false,
        projectId,
        labelPrefix: 'horse:',
        wavePrefix: 'wave:',
        statusMap: {},
      },
    } satisfies SessionCrew
  }

  function bench(input: {
    credential: TrackerCredentialStatus | null
    resolution?: TrackerProjectResolution
    /** What the door answers a save with: the crew as it now stands. */
    savedProjectId?: string
  }) {
    const crew = crewFor('')
    // The door answers with the crew it saved (lap 2, C), so the field's
    // content after a bind is a fact the test can read.
    const setTrackerBinding = vi.fn(async () =>
      crewFor(input.savedProjectId ?? ''),
    )
    const resolveProject = vi.fn(
      async () => input.resolution ?? { kind: 'not-found' as const },
    )
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      workLedger: {
        onUpdated: () => () => {},
        list: async () => ({
          crewId: 'c',
          entries: [],
          dispatchPlan: null,
          trackerHealth: null,
        }),
      },
      tracker: {
        credentialStatus: vi.fn(async () => {
          if (input.credential === null) {
            // The mount's status read never answers: the form does not know.
            return await new Promise<TrackerCredentialStatus>(() => {})
          }
          return input.credential
        }),
        setCredential: vi.fn(async () => 'present' as const),
        deleteCredential: vi.fn(async () => 'absent' as const),
        probe: vi.fn(),
        resolveProject,
      },
      crew: { setTrackerBinding },
    }
    return { crew, setTrackerBinding, resolveProject }
  }

  async function bindWith(
    typed: string,
    doors: ReturnType<typeof bench>,
    crew: SessionCrew,
  ) {
    render(<TrackerBindingFormContainer crew={crew} />)
    await waitFor(() => expect(doors.resolveProject).toBeDefined())
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Tracker project'), {
        target: { value: typed },
      })
    })
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', {
          name: /^(Bind to project|Save binding)$/,
        }),
      )
    })
  }

  it('a UUID binds with no lookup, even with no key stored', async () => {
    const doors = bench({ credential: 'absent' })
    await bindWith(UUID, doors, doors.crew)

    // Mutation: resolve unconditionally -> this asks a door that needs a key
    // and the bind fails for somebody pasting the id, red.
    expect(doors.resolveProject).not.toHaveBeenCalled()
    expect(doors.setTrackerBinding).toHaveBeenCalledWith(
      'crew-1',
      expect.objectContaining({ projectId: UUID }),
    )
  })

  it('a URL with no key stored saves nothing and says what to do', async () => {
    const doors = bench({ credential: 'absent' })
    await bindWith(URL, doors, doors.crew)

    expect(doors.resolveProject).not.toHaveBeenCalled()
    expect(doors.setTrackerBinding).not.toHaveBeenCalled()
    expect(
      screen.getByText(/Store the API key first to look a project up/),
    ).toBeTruthy()
  })

  it('a name the key can resolve binds the ID it found, and says which project that is', async () => {
    const doors = bench({
      credential: 'present',
      resolution: {
        kind: 'resolved',
        project: { id: 'project-9', name: 'convergence', url: URL },
      },
      savedProjectId: 'project-9',
    })
    await bindWith('convergence', doors, doors.crew)

    expect(doors.resolveProject).toHaveBeenCalledWith('crew-1', 'convergence')
    // The id is what gets stored, exactly as before this issue: the binding
    // shape did not change.
    expect(doors.setTrackerBinding).toHaveBeenCalledWith(
      'crew-1',
      expect.objectContaining({ projectId: 'project-9' }),
    )
    // And the field now holds that id, which says nothing to a person...
    expect(screen.getByLabelText('Tracker project')).toHaveProperty(
      'value',
      'project-9',
    )
    // ...so this line does (lap 2, C).
    // Mutation: drop the bound-project line -> red.
    expect(screen.getByText('Bound to “convergence”')).toBeTruthy()
  })

  it('lap 2, C: a UUID bind resolved nothing, so it claims nothing', async () => {
    const doors = bench({ credential: 'present', savedProjectId: UUID })
    await bindWith(UUID, doors, doors.crew)

    expect(doors.resolveProject).not.toHaveBeenCalled()
    expect(document.querySelector('[data-tracker-bound-project]')).toBeNull()
  })

  it('lap 2, C: a form that does not yet know about the key asks the door', async () => {
    // `null` is "the status read has not come back", not "there is no key".
    // Mutation: refuse on anything but `present` -> a person who HAS a key is
    // told to store one, and the lookup never happens, red.
    const doors = bench({
      credential: null,
      resolution: {
        kind: 'resolved',
        project: { id: 'project-9', name: 'convergence', url: URL },
      },
      savedProjectId: 'project-9',
    })
    await bindWith('convergence', doors, doors.crew)

    expect(doors.resolveProject).toHaveBeenCalledWith('crew-1', 'convergence')
    expect(doors.setTrackerBinding).toHaveBeenCalledWith(
      'crew-1',
      expect.objectContaining({ projectId: 'project-9' }),
    )
  })

  it('a name several projects answer to saves nothing and lists them', async () => {
    const doors = bench({
      credential: 'present',
      resolution: {
        kind: 'ambiguous',
        candidates: [
          { id: 'a', name: 'convergence', url: 'https://linear.app/a' },
          { id: 'b', name: 'Convergence', url: 'https://linear.app/b' },
        ],
      },
    })
    await bindWith('convergence', doors, doors.crew)

    expect(doors.setTrackerBinding).not.toHaveBeenCalled()
    expect(
      screen.getByText(/Several projects answer to that name/),
    ).toBeTruthy()
    expect(screen.getByText(/https:\/\/linear\.app\/b/)).toBeTruthy()
  })

  it('a name nothing answers to saves nothing and asks for the URL', async () => {
    const doors = bench({ credential: 'present' })
    await bindWith('nothing answers', doors, doors.crew)

    expect(doors.setTrackerBinding).not.toHaveBeenCalled()
    expect(screen.getByText(/No project answers to that/)).toBeTruthy()
  })
})

it.each([
  { count: 0, candidates: [] },
  { count: 1, candidates: ['MAR-1 → opus'] },
  { count: 2, candidates: ['MAR-1 → opus', 'MAR-2 → astra'] },
])(
  'MAR-2981 R10 Dispatch previews $count candidates before enabling',
  ({ candidates }) => {
    const change = vi.fn()
    renderForm({ dispatchCandidates: candidates, onAutoDispatchChange: change })
    expect(screen.getByRole('region', { name: 'Dispatch' })).toBeTruthy()
    expect(
      screen.getByText(
        candidates.length
          ? `${candidates.length} issue(s) would start now: ${candidates.join(', ')}`
          : 'Nothing would start now',
      ),
    ).toBeTruthy()
    const toggle = screen.getByRole('switch')
    expect(toggle).toHaveProperty('checked', false)
    fireEvent.click(toggle)
    expect(change).toHaveBeenCalledWith(true)
  },
)
