import { describe, expect, it } from 'vitest'
import type { ExecutionHostEndpoint } from '@/entities/execution-host'
import {
  providerCatalogSourceForHost,
  type RemoteProject,
  type RemoteProjectCatalogState,
} from '@/entities/session'
import { resolveExecutionBarView } from './execution-bar.pure'
import {
  REPOSITORY_WORK_ADDRESS_CHOICE_ID,
  resolveWorkAddressSlot,
  workAddressForNewSession,
  workAddressReadyForSend,
  type LocalRepositoryState,
  type WorkAddressSlotInput,
} from './work-address-slot.pure'

const ENDPOINT: ExecutionHostEndpoint = {
  id: 'little-monster',
  label: 'little-monster',
  baseUrl: 'https://little.test',
  position: 0,
  createdAt: '2026-08-28',
  updatedAt: '2026-08-28',
  configurationEpoch: 0,
}

const LOCAL_REPOSITORY = 'https://github.com/marckraw/new-blok.git'

function project(overrides: Partial<RemoteProject> = {}): RemoteProject {
  return {
    id: 'new-blok',
    name: 'new-blok',
    workingDirectory: '/srv/projects/new-blok',
    origin: LOCAL_REPOSITORY,
    ...overrides,
  }
}

const SOURCE = providerCatalogSourceForHost(ENDPOINT.id, [ENDPOINT])

function landed(
  projects: RemoteProject[],
  overrides: { supported?: boolean; unreachableReason?: string | null } = {},
): RemoteProjectCatalogState {
  return {
    status: 'landed',
    source: SOURCE,
    supported: overrides.supported ?? true,
    projects,
    unreachableReason: overrides.unreachableReason ?? null,
  }
}

function bar(hostId: string) {
  return resolveExecutionBarView({
    endpoints: [ENDPOINT],
    liveSessionHostId: null,
    contextKind: 'project',
    selectedHostId: hostId,
  })
}

function liveBar(hostId: string) {
  return resolveExecutionBarView({
    endpoints: [ENDPOINT],
    liveSessionHostId: hostId,
    contextKind: 'project',
    selectedHostId: hostId,
  })
}

function slot(
  overrides: Partial<WorkAddressSlotInput> = {},
): ReturnType<typeof resolveWorkAddressSlot> {
  const known: LocalRepositoryState = {
    status: 'known',
    repository: LOCAL_REPOSITORY,
  }
  return resolveWorkAddressSlot({
    executionBar: bar(ENDPOINT.id),
    hostLabel: 'little-monster',
    projects: landed([project()]),
    localRepository: known,
    selectedId: null,
    branchDraft: '',
    recordedAddress: null,
    reportedWorkspace: null,
    ...overrides,
  })
}

describe('the slot on Local', () => {
  it('does not exist', () => {
    expect(slot({ executionBar: bar('local') })).toEqual({ mode: 'hidden' })
  })

  it('does not exist for a live local session either', () => {
    expect(slot({ executionBar: liveBar('local') })).toEqual({
      mode: 'hidden',
    })
  })

  it('does not exist on a global chat, where the strip itself is hidden', () => {
    expect(
      slot({
        executionBar: resolveExecutionBarView({
          endpoints: [ENDPOINT],
          liveSessionHostId: null,
          contextKind: 'global',
          selectedHostId: ENDPOINT.id,
        }),
      }),
    ).toEqual({ mode: 'hidden' })
  })
})

describe('what a machine offers', () => {
  it('lists the Projects of a machine that has them, plus the repository', () => {
    const view = slot()
    expect(view.mode).toBe('choosing')
    expect(
      view.mode === 'choosing' && view.choices.map((c) => c.label),
    ).toEqual(['Project new-blok', 'marckraw/new-blok'])
  })

  it('offers only the repository on a machine that does no Projects', () => {
    const view = slot({ projects: landed([], { supported: false }) })
    expect(view.mode === 'choosing' && view.choices.map((c) => c.id)).toEqual([
      REPOSITORY_WORK_ADDRESS_CHOICE_ID,
    ])
  })

  it('says it is asking while the machine has not answered', () => {
    expect(slot({ projects: null }).mode).toBe('asking')
    expect(slot({ projects: { status: 'pending', source: SOURCE } }).mode).toBe(
      'asking',
    )
  })

  it('says it is asking while this project origin has not been read', () => {
    expect(slot({ localRepository: { status: 'asking' } }).mode).toBe('asking')
  })

  it('still offers the repository when the machine could not be asked', () => {
    const view = slot({
      projects: { status: 'failed', source: SOURCE, reason: 'timed out.' },
    })
    expect(view.mode === 'choosing' && view.choices.map((c) => c.id)).toEqual([
      REPOSITORY_WORK_ADDRESS_CHOICE_ID,
    ])
    expect(view.mode === 'choosing' && view.notice).toContain('timed out.')
  })

  it('says a machine could not be re-asked beside the Projects it last reported', () => {
    const view = slot({
      projects: landed([project()], { unreachableReason: 'network down.' }),
    })
    expect(view.mode === 'choosing' && view.notice).toContain('network down.')
  })

  it('says nothing at all about a machine that simply has no Projects', () => {
    const view = slot({ projects: landed([], { supported: false }) })
    expect(view.mode).toBe('choosing')
    expect(view.mode === 'choosing' && view.notice).toBeNull()
  })

  it('has nothing to offer when there is no origin and no Project', () => {
    const view = slot({
      projects: landed([], { supported: false }),
      localRepository: { status: 'known', repository: null },
    })
    expect(view.mode).toBe('unavailable')
  })
})

describe('what is preselected', () => {
  it('picks the Project holding the same repository as this one', () => {
    const view = slot({
      projects: landed([
        project({ id: 'other', name: 'other', origin: null }),
        project(),
      ]),
    })
    expect(view.mode === 'choosing' && view.selectedId).toBe('project:new-blok')
    expect(view.mode === 'choosing' && view.address).toEqual({
      mode: 'project',
      projectId: 'new-blok',
      workingDirectory: '/srv/projects/new-blok',
      label: 'Project new-blok',
    })
  })

  it('matches across spellings of one repository', () => {
    const view = slot({
      projects: landed([
        project({ origin: 'git@github.com:marckraw/new-blok.git' }),
      ]),
      localRepository: {
        status: 'known',
        repository: 'https://github.com/marckraw/new-blok',
      },
    })
    expect(view.mode === 'choosing' && view.selectedId).toBe('project:new-blok')
  })

  it('falls back to the repository when no Project holds it', () => {
    const view = slot({
      projects: landed([project({ id: 'other', name: 'other', origin: null })]),
    })
    expect(view.mode === 'choosing' && view.selectedId).toBe(
      REPOSITORY_WORK_ADDRESS_CHOICE_ID,
    )
    expect(view.mode === 'choosing' && view.address).toEqual({
      mode: 'repository',
      repository: LOCAL_REPOSITORY,
      branchName: null,
      label: 'marckraw/new-blok',
    })
  })

  it('falls back to the repository when the daemon reports no origins yet', () => {
    const view = slot({ projects: landed([project({ origin: null })]) })
    expect(view.mode === 'choosing' && view.selectedId).toBe(
      REPOSITORY_WORK_ADDRESS_CHOICE_ID,
    )
  })

  it('chooses nothing rather than the first Project when nothing can be matched', () => {
    const view = slot({
      projects: landed([project({ origin: null })]),
      localRepository: { status: 'known', repository: null },
    })
    expect(view.mode === 'choosing' && view.selectedId).toBeNull()
    expect(workAddressForNewSession(view)).toBeNull()
  })

  it('honours his pick over the default', () => {
    const view = slot({
      projects: landed([project()]),
      selectedId: REPOSITORY_WORK_ADDRESS_CHOICE_ID,
    })
    expect(view.mode === 'choosing' && view.selectedId).toBe(
      REPOSITORY_WORK_ADDRESS_CHOICE_ID,
    )
  })

  it('clamps a pick the machine does not offer, without erasing it', () => {
    const stalePick = 'project:from-another-machine'
    const view = slot({ selectedId: stalePick })
    expect(view.mode === 'choosing' && view.selectedId).toBe('project:new-blok')
    // The raw pick is the caller's to keep: switching back to the machine that
    // has it restores the place he chose.
    expect(
      slot({
        projects: landed([project({ id: 'from-another-machine' })]),
        selectedId: stalePick,
      }).mode === 'choosing',
    ).toBe(true)
  })
})

describe('a live session', () => {
  it('states the place from its record rather than offering a choice', () => {
    expect(
      slot({
        executionBar: liveBar(ENDPOINT.id),
        recordedAddress: {
          mode: 'project',
          projectId: 'new-blok',
          workingDirectory: '/srv/projects/new-blok',
          label: 'Project new-blok',
        },
      }),
    ).toEqual({
      mode: 'settled',
      label: 'Project new-blok',
      requestedBranch: null,
    })
  })

  it('says Unknown for a row written before places were recorded', () => {
    expect(
      slot({
        executionBar: liveBar(ENDPOINT.id),
        recordedAddress: { mode: 'unknown' },
      }),
    ).toEqual({ mode: 'settled', label: 'Unknown', requestedBranch: null })
  })

  it('records nothing further on a later turn', () => {
    expect(
      workAddressForNewSession(
        slot({
          executionBar: liveBar(ENDPOINT.id),
          recordedAddress: { mode: 'unknown' },
        }),
      ),
    ).toBeNull()
  })
})

describe('the stated place and the sent place', () => {
  it('are the same value, not two derivations', () => {
    const view = slot()
    const stated =
      view.mode === 'choosing'
        ? view.choices.find((choice) => choice.id === view.selectedId)?.address
        : null
    expect(workAddressForNewSession(view)).toBe(stated)
  })
})

describe('whether a send may leave', () => {
  it('holds the send while the machine has not said where it can work', () => {
    // The shortcut he actually uses reached `session:create` here, and the
    // record took `unknown` — the original incident through the new control.
    //
    // Mutation: make `workAddressReadyForSend` return true for `asking` (or
    // drop the `canSend` term in the presentational), and this goes red.
    expect(workAddressReadyForSend(slot({ projects: null }))).toBe(false)
  })

  it('holds the send when the machine offers nowhere at all', () => {
    const view = slot({
      projects: landed([]),
      localRepository: { status: 'known', repository: null },
    })
    expect(view.mode).toBe('unavailable')
    expect(workAddressReadyForSend(view)).toBe(false)
  })

  it('holds the send when a chooser could preselect nothing', () => {
    // Choices exist but none is defaulted and he has picked none, so there is
    // no place to state. A guard keyed on the *mode* rather than on the
    // address would let this one through.
    const view = slot({
      projects: landed([project({ origin: null })]),
      localRepository: { status: 'known', repository: null },
    })
    expect(view.mode).toBe('choosing')
    expect(workAddressForNewSession(view)).toBeNull()
    expect(workAddressReadyForSend(view)).toBe(false)
  })

  it('lets the send leave once the strip states a place', () => {
    expect(workAddressReadyForSend(slot())).toBe(true)
  })

  it('never holds a Local send, which has no place to state', () => {
    expect(workAddressReadyForSend(slot({ executionBar: bar('local') }))).toBe(
      true,
    )
  })

  it('never holds a live session, whose place was recorded at birth', () => {
    expect(
      workAddressReadyForSend(
        slot({ executionBar: liveBar(ENDPOINT.id), recordedAddress: null }),
      ),
    ).toBe(true)
  })
})

describe('the branch field (MAR-2694)', () => {
  /**
   * The field belongs to Repository mode alone: an errand cuts a branch, a
   * residency runs on the checkout's own HEAD.
   *
   * Mutation: key the field on the choice id instead of the address mode, or
   * render it for every mode, and this goes red.
   */
  it('exists for the repository and not for a Project', () => {
    const errand = slot({
      projects: landed([project({ id: 'other', name: 'other', origin: null })]),
    })
    expect(errand.mode === 'choosing' && errand.branch).toEqual({
      value: '',
      statement: 'branch: daemon-named',
    })

    const residency = slot()
    expect(residency.mode === 'choosing' && residency.branch).toBeNull()
  })

  /**
   * What was typed reaches the address the send carries, untouched. Emptiness
   * is decided by trimming and the value is never trimmed -- the same split
   * `namesAConcreteWorkPlace` already makes.
   *
   * Mutation: trim the draft in `branchNameFromDraft` and the second row goes
   * red; treat a whitespace draft as written down and the third does.
   */
  it('carries what was typed onto the address, verbatim', () => {
    const withBranch = slot({
      projects: landed([project({ id: 'other', name: 'other', origin: null })]),
      branchDraft: ' agent/mar-2694 ',
    })
    expect(withBranch.mode === 'choosing' && withBranch.address).toEqual({
      mode: 'repository',
      repository: LOCAL_REPOSITORY,
      branchName: ' agent/mar-2694 ',
      label: 'marckraw/new-blok',
    })

    const blank = slot({
      projects: landed([project({ id: 'other', name: 'other', origin: null })]),
      branchDraft: '   ',
    })
    expect(
      blank.mode === 'choosing' && blank.address?.mode === 'repository'
        ? blank.address.branchName
        : 'not repository mode',
    ).toBeNull()
  })

  it('is the same value the send carries, not a second derivation', () => {
    const view = slot({
      projects: landed([project({ id: 'other', name: 'other', origin: null })]),
      branchDraft: 'agent/mar-2694',
    })
    expect(workAddressForNewSession(view)).toHaveProperty(
      'branchName',
      'agent/mar-2694',
    )
  })

  /**
   * A live session reads the daemon's branch, and says what was asked for when
   * the daemon cut a different one.
   *
   * Mutation: drop `requestedBranch` from the settled view and the second row
   * goes red.
   */
  it('states the daemon branch once the echo has landed', () => {
    expect(
      slot({
        executionBar: liveBar(ENDPOINT.id),
        recordedAddress: {
          mode: 'repository',
          repository: LOCAL_REPOSITORY,
          branchName: 'agent/mar-2694',
          label: 'marckraw/new-blok',
        },
        reportedWorkspace: {
          mode: 'repository',
          repository: LOCAL_REPOSITORY,
          branchName: 'agent/34372e47',
          baseRef: 'master',
          workspacePath: null,
          environment: null,
        },
      }),
    ).toEqual({
      mode: 'settled',
      label: 'marckraw/new-blok @ agent/34372e47',
      requestedBranch: 'agent/mar-2694',
    })
  })

  it('says daemon-named on a live errand the machine has not described yet', () => {
    expect(
      slot({
        executionBar: liveBar(ENDPOINT.id),
        recordedAddress: {
          mode: 'repository',
          repository: LOCAL_REPOSITORY,
          branchName: null,
          label: 'marckraw/new-blok',
        },
      }),
    ).toEqual({
      mode: 'settled',
      label: 'marckraw/new-blok @ daemon-named',
      requestedBranch: null,
    })
  })
})
