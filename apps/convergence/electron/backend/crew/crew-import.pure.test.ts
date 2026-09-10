import { expect, it } from 'vitest'
import { readCrewConfig } from './crew-config.pure'
import {
  liveCrewYaml,
  liveMembers,
  liveProjects,
  liveRelays,
  liveSessions,
} from './crew-config.fixture'
import type { CrewImportWorld } from './crew-import.types'
import { planCrewImport, crewImportRelayFields } from './crew-import.pure'
const read = readCrewConfig(liveCrewYaml)
if (!read.ok) throw new Error(read.reason)
const config = read.config
const world: CrewImportWorld = {
  sessions: liveSessions.map((s) => ({
    ...s,
    contextKind: 'project',
    lastActivity: null,
  })),
  projects: liveProjects,
  endpointIds: [],
  relays: liveRelays,
  crews: [
    {
      id: liveRelays[0]!.crewId,
      name: config.crew,
      emoji: config.emoji,
      accentColor: null,
      roundCap: 24,
      stallMinutes: 30,
      position: 0,
      createdAt: '',
      updatedAt: '',
      members: liveMembers,
      sessionIds: liveMembers.map((m) => m.sessionId),
    },
  ],
}
it('binds the exported crew by name, root, lane and host (mutation: bind by name alone)', () => {
  const other = {
    ...world.sessions[0]!,
    id: 'other-fable',
    projectId: 'other-root',
  }
  const plan = planCrewImport(config, {
    ...world,
    sessions: [other, ...world.sessions],
    projects: [
      ...world.projects,
      {
        ...world.projects[0]!,
        id: 'other-root',
        name: 'sb-mig',
        origin: 'git@github.com:ef-global/sb-mig.git',
      },
    ],
  })
  expect({
    roles: plan.roles.map((r) => [r.role, r.state, r.sessionId]),
    wires: plan.wires.map((w) => w.state),
    crew: plan.crew.state,
    limits: plan.limits.state,
    canApply: plan.canApply,
  }).toEqual({
    roles: Object.keys(config.roles)
      .sort()
      .map((key) => [
        key,
        'bound',
        liveMembers.find((m) => m.batonName === key)!.sessionId,
      ]),
    wires: config.wires.map(() => 'existing'),
    crew: 'existing',
    limits: 'existing',
    canApply: true,
  })
})

const one = { ...config, roles: { fable: config.roles.fable! }, wires: [] }
const classify: [string, (w: CrewImportWorld) => void, string, string[]][] = [
  [
    'no conversation',
    (w) => {
      w.sessions = []
    },
    'create',
    [],
  ],
  [
    'missing project',
    (w) => {
      w.projects = []
    },
    'missing-project',
    [],
  ],
  [
    'ambiguous conversation',
    (w) => {
      w.sessions.push({ ...w.sessions[0]!, id: 'duplicate' })
    },
    'choose',
    [],
  ],
  [
    'model only',
    (w) => {
      w.sessions[0]!.model = 'other'
    },
    'differs',
    ['model'],
  ],
  [
    'effort only',
    (w) => {
      w.sessions[0]!.effort = 'low'
    },
    'differs',
    ['effort'],
  ],
  [
    'permissions only',
    (w) => {
      w.sessions[0]!.permissionConfig = { preset: 'ask' }
    },
    'choose',
    ['permissions'],
  ],
  [
    'provider only',
    (w) => {
      w.sessions[0]!.providerId = 'codex'
    },
    'choose',
    ['provider'],
  ],
  [
    'model and permissions',
    (w) => {
      w.sessions[0]!.model = 'other'
      w.sessions[0]!.permissionConfig = { preset: 'ask' }
    },
    'choose',
    ['model', 'permissions'],
  ],
]
it.each(classify)(
  'classifies %s without guessing (mutation: mark every role bound)',
  (_, change, state, differences) => {
    const copy = structuredClone(world)
    change(copy)
    const plan = planCrewImport(one, copy)
    expect({
      state: plan.roles[0]!.state,
      differences: plan.roles[0]!.differences,
      canApply: plan.canApply,
    }).toEqual({
      state,
      differences,
      canApply: ['create', 'differs'].includes(state),
    })
  },
)

it('reconciles wires and limits while listing local-only records as kept (mutation: pretend every wire exists)', () => {
  const copy = structuredClone(world)
  copy.relays[0]!.instruction = 'local instruction'
  copy.relays = copy.relays.slice(0, -1)
  copy.crews[0]!.roundCap = 12
  copy.crews[0]!.members.push({
    sessionId: 'kept',
    batonName: 'local-only',
    canvasX: null,
    canvasY: null,
  })
  copy.crews[0]!.sessionIds.push('kept')
  copy.sessions.push({ ...copy.sessions[0]!, id: 'kept', name: 'Local only' })
  copy.relays.push({
    ...copy.relays[0]!,
    id: 'kept-wire',
    sourceSessionId: 'kept',
  })
  const plan = planCrewImport(config, copy)
  expect({
    differs: plan.wires
      .filter((w) => w.state === 'differs')
      .map((w) => w.differences),
    creates: plan.wires.filter((w) => w.state === 'create').length,
    limits: plan.limits.differences,
    kept: plan.kept.map((k) => k.key).sort(),
  }).toEqual({
    differs: [['instruction']],
    creates: 1,
    limits: ['deliveriesPerRun'],
    kept: ['member:kept', 'relay:kept-wire'],
  })
})
it('plans a new crew and its wires without deleting the old crew (mutation: always reuse a crew)', () => {
  const plan = planCrewImport({ ...config, crew: 'New crew' }, world)
  expect({
    crew: plan.crew.state,
    id: plan.crew.id,
    wires: plan.wires.map((w) => w.state),
  }).toEqual({ crew: 'new', id: null, wires: config.wires.map(() => 'create') })
})

it('requires an immutable-field choice and updates the model only when binding as is (mutation: ignore decisions)', () => {
  const copy = structuredClone(world)
  copy.sessions[0]!.permissionConfig = { preset: 'ask' }
  copy.sessions[0]!.model = 'other'
  const initial = planCrewImport(one, copy)
  const bind = planCrewImport(one, copy, { 'role:fable': copy.sessions[0]!.id })
  const create = planCrewImport(one, copy, { 'role:fable': 'new' })
  expect({
    options: initial.roles[0]!.options.map((o) => o.label),
    bind: [
      bind.roles[0]!.state,
      bind.roles[0]!.sessionId,
      bind.roles[0]!.canUpdate,
    ],
    create: [
      create.roles[0]!.state,
      create.roles[0]!.sessionId,
      create.roles[0]!.canUpdate,
    ],
  }).toEqual({
    options: ['Bind as is', 'Create new'],
    bind: ['differs', copy.sessions[0]!.id, true],
    create: ['create', null, false],
  })
})

it.each([
  [
    'missing-lane',
    {
      project: 'github.com/marckraw/convergence',
      lane: 'unknown',
      host: 'local',
    },
    [],
  ],
  ['missing-endpoint', { host: 'remote:absent' }, []],
  ['remote-create-unsupported', { host: 'remote:known' }, ['remote:known']],
] as const)(
  'blocks %s with an actionable row (mutation: label missing rows bound)',
  (state, patch, endpoints) => {
    const plan = planCrewImport(
      { ...one, roles: { fable: { ...one.roles.fable!, ...patch } } },
      { ...world, endpointIds: [...endpoints] },
    )
    expect({ state: plan.roles[0]!.state, canApply: plan.canApply }).toEqual({
      state,
      canApply: false,
    })
  },
)

it.each(['remote', 'global'])(
  'binds an existing %s conversation without host requests (mutation: match name alone)',
  (kind) => {
    const expected = {
      ...world.sessions[0]!,
      id: kind,
      executionHost: kind === 'remote' ? 'remote:known' : 'local',
      projectId: kind === 'global' ? null : world.sessions[0]!.projectId,
      contextKind:
        kind === 'global' ? ('global' as const) : ('project' as const),
    }
    const plan = planCrewImport(
      {
        ...one,
        roles: {
          fable: {
            ...one.roles.fable!,
            host: expected.executionHost,
            project: kind === 'global' ? null : one.roles.fable!.project,
          },
        },
      },
      {
        ...world,
        sessions: [...world.sessions, expected],
        endpointIds: ['remote:known'],
      },
    )
    expect({
      state: plan.roles[0]!.state,
      id: plan.roles[0]!.sessionId,
      canApply: plan.canApply,
    }).toEqual({ state: 'bound', id: kind, canApply: true })
  },
)

it('resolves spawn lanes and translates the wire once for RelayService (mutation: lose the spawn project)', () => {
  const wire = {
    ...config.wires[0]!,
    to: {
      spawn: {
        name: 'worker',
        provider: 'codex',
        model: null,
        effort: null,
        project: 'github.com/marckraw/convergence',
        lane: 'studio',
        account: 'default' as const,
      },
    },
    opener: 'keep' as const,
  }
  const plan = planCrewImport({ ...config, wires: [wire] }, world)
  expect({
    state: plan.wires[0]!.state,
    project: crewImportRelayFields(wire, plan.wires[0]!.spawnProjectId)
      .spawnSpec?.projectId,
    account: crewImportRelayFields(wire, plan.wires[0]!.spawnProjectId)
      .spawnSpec?.providerAccountId,
  }).toEqual({ state: 'create', project: 'lane-id', account: null })
})

it('shows a new crew’s mandatory limits without an update opt-out (mutation: offer an ignored checkbox)', () => {
  const plan = planCrewImport({ ...config, crew: 'New crew' }, world)
  expect({
    state: plan.limits.state,
    canUpdate: plan.limits.canUpdate,
  }).toEqual({ state: 'create', canUpdate: false })
})

it('refuses a spawn first-message opener the relay service cannot store (mutation: silently discard spawn opener)', () => {
  const wire = {
    ...config.wires[0]!,
    to: {
      spawn: {
        name: 'worker',
        provider: 'codex',
        model: null,
        effort: null,
        project: null,
        account: 'default' as const,
      },
    },
    opener: { first: 'Do this first' },
  }
  const plan = planCrewImport({ ...config, wires: [wire] }, world)
  expect({
    state: plan.wires[0]!.state,
    detail: plan.wires[0]!.detail,
    canApply: plan.canApply,
  }).toEqual({
    state: 'choose',
    detail:
      'wires[0].opener: spawn wires start fresh and cannot store an opener; use keep.',
    canApply: false,
  })
})
