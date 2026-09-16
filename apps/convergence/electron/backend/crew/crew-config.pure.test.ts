import { DEFAULT_CREW_MEMBER_SEAT } from './crew.types'
import { crewImportRelayFields } from './crew-import.pure'
import { normalizeRelaySpawnSpec } from '../relay/relay.pure'
import Ajv from 'ajv'
import { parse } from 'yaml'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  crewToConfig,
  uncarriedRecipeNotes,
  readCrewConfig,
  renderCrewYaml,
  crewExportSlug,
  crewHomeCandidates,
} from './crew-config.pure'
import {
  liveCrew,
  liveCrewYaml,
  liveSessions,
  liveMembers,
  liveProjects,
  liveRelays,
} from './crew-config.fixture'
import type { CrewConfig, CrewConfigSession } from './crew-config.types'

// The schema is a shipped data artifact, not a cross-workspace code import.
const schema = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../docs/crews/crew-config.schema.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as object

const crew = {
  name: 'convergence development',
  emoji: '🧪',
  accentColor: null,
  roundCap: 24,
  stallMinutes: 30,
}
const session: CrewConfigSession = {
  id: 'session-private-id',
  name: '-- Fable Mastermind --',
  providerId: 'claude-code',
  model: 'claude-fable-5-1',
  effort: 'high',
  permissionConfig: { preset: 'yolo' },
  projectId: 'project-private-id',
  executionHost: 'local',
}
const member = {
  ...DEFAULT_CREW_MEMBER_SEAT,
  sessionId: session.id,
  batonName: 'fable',
  canvasX: -323,
  canvasY: 679,
}
const project = {
  id: 'project-private-id',
  name: 'convergence',
  origin: 'git@github.com:marckraw/convergence.git',
  laneOf: null,
  laneName: null,
}

describe('crew config export', () => {
  it('exports a role without database identity (mutation: emit session id)', () => {
    const config = crewToConfig(crew, [member], [session], [project], [])
    expect(config).toEqual({
      version: 1,
      crew: crew.name,
      emoji: '🧪',
      limits: { deliveriesPerRun: 24, attentionAfterMinutes: 30 },
      roles: {
        fable: {
          conversation: session.name,
          // Every export now says what the seat is (MAR-3083 R5).
          role: 'horse',
          kind: 'resident',
          wipLimit: 1,
          provider: 'claude-code',
          model: 'claude-fable-5-1',
          effort: 'high',
          permissions: 'yolo',
          project: 'github.com/marckraw/convergence',
          host: 'local',
        },
      },
      wires: [],
    })
  })
})

it('pins the live five-member six-wire YAML (mutations: emit id; reverse wire order; use the lane row)', () => {
  expect(
    renderCrewYaml(
      crewToConfig(
        liveCrew,
        liveMembers,
        liveSessions,
        liveProjects,
        liveRelays,
      ),
    ),
  ).toBe(liveCrewYaml)
})

it('exports a spawn recipe with the default account (mutation: retain account id)', () => {
  const relay = {
    ...liveRelays[0]!,
    action: 'spawn' as const,
    targetSessionId: null,
    spawnSpec: {
      executionHost: 'local',
      workAddress: null,
      roleCard: null,
      member: null,
      returnWire: null,
      name: 'Reviewer · lap {lap}',
      providerId: 'codex',
      model: 'gpt-6-astra',
      effort: 'high',
      projectId: null,
      providerAccountId: 'private-account-id',
    },
  }
  expect(
    crewToConfig(liveCrew, liveMembers, liveSessions, liveProjects, [relay])
      .wires[0]?.to,
  ).toEqual({
    spawn: {
      name: 'Reviewer · lap {lap}',
      provider: 'codex',
      model: 'gpt-6-astra',
      effort: 'high',
      project: null,
      account: 'default',
      host: 'local',
      workAddress: null,
      roleCard: null,
      returnWire: null,
    },
  })
})

it('includes only stored positions when requested (mutation: omit layout)', () => {
  expect(
    crewToConfig(
      liveCrew,
      liveMembers,
      liveSessions,
      liveProjects,
      liveRelays,
      { includePositions: true },
    ).layout,
  ).toEqual({ fable: [-323, 679], 'horse astra': [398, 720] })
})

it('exports global roles with project null (mutation: replace null with a project)', () => {
  expect(
    crewToConfig(crew, [member], [{ ...session, projectId: null }], [], [])
      .roles.fable?.project,
  ).toBeNull()
})

it('carries custom provider permissions verbatim (mutation: retain only preset)', () => {
  const permissionConfig = {
    preset: 'custom' as const,
    codex: {
      approvalPolicy: 'never' as const,
      sandbox: 'workspace-write' as const,
    },
  }
  expect(
    crewToConfig(
      crew,
      [member],
      [{ ...session, permissionConfig }],
      [project],
      [],
    ).roles.fable?.permissions,
  ).toEqual(permissionConfig)
})

it('is byte-identical regardless of input order (mutation: retain member order)', () => {
  const first = renderCrewYaml(
    crewToConfig(liveCrew, liveMembers, liveSessions, liveProjects, liveRelays),
  )
  const second = renderCrewYaml(
    crewToConfig(
      liveCrew,
      [...liveMembers].reverse(),
      [...liveSessions].reverse(),
      [...liveProjects].reverse(),
      [...liveRelays].reverse(),
    ),
  )
  expect(second).toBe(first)
})

it('validates the exported recipe against the shipped schema (mutation: drop version)', () => {
  const validate = new Ajv().compile(schema)
  expect(
    validate(
      crewToConfig(
        liveCrew,
        liveMembers,
        liveSessions,
        liveProjects,
        liveRelays,
      ),
    ),
  ).toBe(true)
})

it('round-trips the exported recipe including text and layout (mutation: discard layout while parsing)', () => {
  const config = crewToConfig(
    liveCrew,
    liveMembers,
    liveSessions,
    liveProjects,
    [
      {
        ...liveRelays[0]!,
        opener: 'first: "quoted"\nnext',
        instruction: 'unicode 🧩\n# not a comment',
        armed: false,
      },
    ],
    { includePositions: true },
  )
  expect(parseCrewYaml(renderCrewYaml(config))).toEqual(config)
})

it('keeps filename slugs inside one directory (mutation: return the raw crew name)', () => {
  expect(crewExportSlug('../Night shift / crew')).toBe('night-shift-crew')
})

it('keeps all tied home projects available for the question (mutation: choose first candidate)', () => {
  expect(
    crewHomeCandidates(
      [{ projectId: 'a' }, { projectId: 'b' }, { projectId: null }],
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    ),
  ).toEqual([{ id: 'a' }, { id: 'b' }])
})

it('round-trips baton names that are YAML scalars (mutation: leave null keys unquoted)', () => {
  const sessions = [session, { ...session, id: 'second-session' }]
  const config = crewToConfig(
    crew,
    [
      { ...member, batonName: 'null' },
      { ...member, sessionId: 'second-session', batonName: 'True' },
    ],
    sessions,
    [project],
    [],
  )
  expect(parseCrewYaml(renderCrewYaml(config))).toEqual(config)
})

it('fixes custom permission key order (mutation: copy the input block order)', () => {
  const first = crewToConfig(
    crew,
    [member],
    [
      {
        ...session,
        permissionConfig: {
          preset: 'custom',
          codex: { sandbox: 'read-only', approvalPolicy: 'never' },
        },
      },
    ],
    [project],
    [],
  )
  const second = crewToConfig(
    crew,
    [member],
    [
      {
        ...session,
        permissionConfig: {
          codex: { approvalPolicy: 'never', sandbox: 'read-only' },
          preset: 'custom',
        },
      },
    ],
    [project],
    [],
  )
  expect(renderCrewYaml(second)).toBe(renderCrewYaml(first))
})

it('preserves the disarmed wire’s condition, opener and standing text (mutation: drop armed false)', () => {
  const relay = {
    ...liveRelays[0]!,
    conditionToken: 'BATON: custom',
    opener: 'first line\nsecond line',
    instruction: 'standing "text"\n🧩',
    armed: false,
  }
  expect(
    crewToConfig(liveCrew, liveMembers, liveSessions, liveProjects, [relay])
      .wires,
  ).toEqual([
    {
      from: 'fable',
      to: 'horse opus',
      when: relay.conditionToken,
      opener: { first: relay.opener },
      instruction: relay.instruction,
      armed: false,
    },
  ])
})

it('keeps the configured remote host label (mutation: coerce host to local)', () => {
  expect(
    crewToConfig(
      crew,
      [member],
      [{ ...session, executionHost: 'remote:workshop' }],
      [project],
      [],
    ).roles.fable?.host,
  ).toBe('remote:workshop')
})

it.each([
  [
    'git@github.com:marckraw/convergence.git',
    'github.com/marckraw/convergence',
  ],
  [null, 'Root project'],
])(
  'names the root project for a lane with root origin %s (mutation: use the lane row)',
  (origin, expected) => {
    const root = { ...project, name: 'Root project', origin }
    const lane = {
      ...project,
      id: 'lane-id',
      name: 'Root project · lane: studio',
      origin: null,
      laneOf: root.id,
      laneName: 'studio',
    }
    const role = crewToConfig(
      crew,
      [member],
      [{ ...session, projectId: lane.id }],
      [lane, root],
      [],
    ).roles.fable!
    expect({ project: role.project, lane: role.lane }).toEqual({
      project: expected,
      lane: 'studio',
    })
  },
)

it('declares runtime YAML and test-only AJV (mutations: demote yaml; promote ajv)', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
  )
  expect({
    runtimeYaml: Object.hasOwn(manifest.dependencies, 'yaml'),
    runtimeAjv: Object.hasOwn(manifest.dependencies, 'ajv'),
    testAjv: Object.hasOwn(manifest.devDependencies, 'ajv'),
  }).toEqual({ runtimeYaml: true, runtimeAjv: false, testAjv: true })
})

/** Independent YAML inverse for serializer canaries. */
function parseCrewYaml(yaml: string): CrewConfig {
  return parse(yaml) as CrewConfig
}

it('preserves the spawn lane beside its root project (mutations: use the lane row; drop spawn lane; forbid spawn lane in schema)', () => {
  const relay = {
    ...liveRelays[0]!,
    action: 'spawn' as const,
    targetSessionId: null,
    spawnSpec: {
      executionHost: 'local',
      workAddress: null,
      roleCard: null,
      member: null,
      returnWire: null,
      name: 'Lane worker',
      providerId: 'codex',
      model: 'gpt-6-astra',
      effort: 'high',
      projectId: 'lane-id',
      providerAccountId: null,
    },
  }
  const config = crewToConfig(
    liveCrew,
    liveMembers,
    liveSessions,
    liveProjects,
    [relay],
  )
  expect(config.wires[0]?.to).toEqual({
    spawn: {
      name: 'Lane worker',
      provider: 'codex',
      model: 'gpt-6-astra',
      effort: 'high',
      project: 'github.com/marckraw/convergence',
      lane: 'studio',
      account: 'default',
      host: 'local',
      workAddress: null,
      roleCard: null,
      returnWire: null,
    },
  })
  const validate = new Ajv({ allErrors: true }).compile(schema)
  expect({
    valid: validate(parseCrewYaml(renderCrewYaml(config))),
    errors: validate.errors,
  }).toEqual({ valid: true, errors: null })
})

it('reads the exported recipe at runtime (mutation: refuse valid YAML)', () => {
  expect(readCrewConfig(liveCrewYaml)).toEqual({
    ok: true,
    config: parseCrewYaml(liveCrewYaml),
  })
})

const invalidRecipes: [string, (value: ReturnType<typeof parse>) => void][] = [
  // MAR-3083 lap 4, N: the schema and the reader agree that `roles` holds no
  // recipe. Mutation: widen the schema's enum back to `dynamic` and this row
  // reads schema-valid while the runtime refuses it.
  [
    'roles.fable.kind',
    (c) => {
      c.roles.fable.kind = 'dynamic'
    },
  ],
  [
    'version',
    (c) => {
      c.version = 2
    },
  ],
  [
    'crew',
    (c) => {
      c.crew = null
    },
  ],
  [
    'emoji',
    (c) => {
      delete c.emoji
    },
  ],
  [
    'color',
    (c) => {
      c.color = 1
    },
  ],
  [
    'limits.deliveriesPerRun',
    (c) => {
      c.limits.deliveriesPerRun = 0
    },
  ],
  [
    'limits.attentionAfterMinutes',
    (c) => {
      c.limits.attentionAfterMinutes = 1.2
    },
  ],
  [
    'roles',
    (c) => {
      c.roles = []
    },
  ],
  [
    'roles.fable.conversation',
    (c) => {
      c.roles.fable.conversation = null
    },
  ],
  [
    'roles.fable.provider',
    (c) => {
      delete c.roles.fable.provider
    },
  ],
  [
    'roles.fable.model',
    (c) => {
      c.roles.fable.model = 1
    },
  ],
  [
    'roles.fable.effort',
    (c) => {
      delete c.roles.fable.effort
    },
  ],
  [
    'roles.fable.project',
    (c) => {
      c.roles.fable.project = false
    },
  ],
  [
    'roles.fable.lane',
    (c) => {
      c.roles.fable.lane = 1
    },
  ],
  [
    'roles.fable.host',
    (c) => {
      delete c.roles.fable.host
    },
  ],
  [
    'roles.fable.permissions',
    (c) => {
      c.roles.fable.permissions = 'silent'
    },
  ],
  [
    'roles.fable.permissions.codex.sandbox',
    (c) => {
      c.roles.fable.permissions = {
        preset: 'custom',
        codex: { approvalPolicy: 'never', sandbox: 'anything' },
      }
    },
  ],
  [
    'roles.fable.permissions.claudeCode.permissionMode',
    (c) => {
      c.roles.fable.permissions = {
        preset: 'custom',
        claudeCode: { permissionMode: 'anything' },
      }
    },
  ],
  [
    'wires',
    (c) => {
      c.wires = {}
    },
  ],
  [
    'wires[2].when',
    (c) => {
      delete c.wires[2].when
    },
  ],
  [
    'wires[0].from',
    (c) => {
      c.wires[0].from = null
    },
  ],
  [
    'wires[0].to',
    (c) => {
      c.wires[0].to = 1
    },
  ],
  [
    'wires[0].opener',
    (c) => {
      c.wires[0].opener = 'restart'
    },
  ],
  [
    'wires[0].instruction',
    (c) => {
      c.wires[0].instruction = null
    },
  ],
  [
    'wires[0].armed',
    (c) => {
      c.wires[0].armed = true
    },
  ],
  [
    'layout.fable',
    (c) => {
      c.layout = { fable: [1] }
    },
  ],
  [
    'extra',
    (c) => {
      c.extra = true
    },
  ],
]
it.each(invalidRecipes)(
  'agrees with the schema and names %s first (mutation: accept that malformed field)',
  (path, corrupt) => {
    const config = parse(liveCrewYaml)
    corrupt(config)
    const result = readCrewConfig(JSON.stringify(config))
    const schemaValid = new Ajv().validate(schema, config)
    expect({
      schemaValid,
      ok: result.ok,
      path: result.ok ? null : result.reason.split(':')[0],
    }).toEqual({ schemaValid: false, ok: false, path })
  },
)

it.each([
  'custom permissions',
  'spawn and layout',
  'empty crew',
  'resident kind',
])(
  'accepts schema-valid %s at runtime (mutation: refuse valid YAML)',
  (kind) => {
    const config = parse(liveCrewYaml)
    // A role may say what it is; the only thing it can be is a conversation.
    if (kind === 'resident kind') config.roles.fable.kind = 'resident'
    if (kind === 'custom permissions')
      config.roles.fable.permissions = {
        preset: 'custom',
        codex: { approvalPolicy: 'on-request', sandbox: 'workspace-write' },
        claudeCode: { permissionMode: 'acceptEdits' },
      }
    if (kind === 'spawn and layout') {
      config.wires[0].to = {
        spawn: {
          name: 'Worker',
          provider: 'codex',
          model: null,
          effort: null,
          project: null,
          account: 'default',
          host: 'local',
          workAddress: null,
          roleCard: null,
          returnWire: null,
        },
      }
      config.wires[0].opener = { first: 'Hello\nworld' }
      config.layout = { fable: [-1, 2.5] }
    }
    if (kind === 'empty crew') {
      config.roles = {}
      config.wires = []
    }
    expect({
      schemaValid: new Ajv().validate(schema, config),
      result: readCrewConfig(JSON.stringify(config)),
    }).toEqual({ schemaValid: true, result: { ok: true, config } })
  },
)

it.each([
  ['a:b', 'a baton name cannot contain a colon'],
  ['   ', 'a baton name must not be empty'],
  ['***', 'a baton name cannot start or end with a formatting mark'],
])(
  'rejects invalid role key %s before apply (mutation: omit baton-name validation)',
  (key, reason) => {
    const config = parseCrewYaml(liveCrewYaml)
    config.roles = { [key]: config.roles.fable! }
    config.wires = []
    expect(readCrewConfig(JSON.stringify(config))).toEqual({
      ok: false,
      reason: `roles[${JSON.stringify(key)}]: ${reason}`,
    })
  },
)
it('refuses normalized role-key collisions (mutation: allow duplicate normalized keys)', () => {
  const config = parseCrewYaml(liveCrewYaml)
  config.roles.Fable = config.roles.fable!
  expect(readCrewConfig(JSON.stringify(config))).toEqual({
    ok: false,
    reason: 'roles["Fable"]: duplicate baton name fable',
  })
})

it.each(['a'.repeat(50), '', '**Horse**'])(
  'refuses an unnameable unnamed export: %s (mutation: skip roleKey normalizer)',
  (name) => {
    expect(() =>
      crewToConfig(
        crew,
        [{ ...member, batonName: null }],
        [{ ...session, name }],
        [project],
        [],
      ),
    ).toThrow('A conversation needs a baton name before export')
  },
)
it('imports its own 20-character unnamed export (mutation: emit an over-length fallback)', () => {
  const exported = crewToConfig(
    crew,
    [{ ...member, batonName: null }],
    [{ ...session, name: 'a'.repeat(20) }],
    [project],
    [],
  )
  expect(readCrewConfig(renderCrewYaml(exported))).toEqual({
    ok: true,
    config: exported,
  })
})
it('imports its own live crew export with layout (mutation: skip a required exported field)', () => {
  const exported = crewToConfig(
    liveCrew,
    liveMembers,
    liveSessions,
    liveProjects,
    liveRelays,
    { includePositions: true },
  )
  expect(readCrewConfig(renderCrewYaml(exported))).toEqual({
    ok: true,
    config: exported,
  })
})

it.each([
  ['', 'expected settled or a condition'],
  ['  \t', 'expected settled or a condition'],
  ['BATON:', 'a relay condition that says BATON: must name somebody'],
  [
    'BATON: marcin',
    'BATON: marcin is reserved — it always parks the loop and hails Marcin, so no wire may claim it',
  ],
  [
    '**',
    'a relay condition must wait on a letter or a number, not only formatting marks',
  ],
  ['one\ntwo', 'a relay condition is one line, not a paragraph'],
  ['x'.repeat(121), 'a relay condition cannot be longer than 120 characters'],
])(
  'refuses condition %s at the reader (mutation: pass when raw)',
  (when, reason) => {
    const recipe = parseCrewYaml(liveCrewYaml)
    recipe.wires[2]!.when = when
    expect(readCrewConfig(JSON.stringify(recipe))).toEqual({
      ok: false,
      reason: `wires[2].when: ${reason}`,
    })
  },
)

it('refuses an exported reserved condition (mutation: export settled token)', () => {
  expect(() =>
    crewToConfig(liveCrew, liveMembers, liveSessions, liveProjects, [
      { ...liveRelays[0]!, conditionToken: 'settled' },
    ]),
  ).toThrow(
    'A wire condition reads as the reserved word "settled"; rename it before export',
  )
})
it.each(['a:b', '**horse**', 'x'.repeat(33)])(
  'refuses invalid stored baton %s (mutation: return stored baton raw)',
  (batonName) => {
    expect(() =>
      crewToConfig(crew, [{ ...member, batonName }], [session], [project], []),
    ).toThrow('A conversation needs a baton name before export')
  },
)
it('normalizes stored baton names through the export door (mutation: return stored baton raw)', () => {
  const exported = crewToConfig(
    crew,
    [{ ...member, batonName: '  Horse   Opus ' }],
    [session],
    [project],
    [],
  )
  expect(Object.keys(exported.roles)).toEqual(['horse opus'])
})

it('refuses normalized layout-key collisions (mutation: omit layout-key validation)', () => {
  const recipe = parseCrewYaml(liveCrewYaml)
  recipe.layout = { fable: [1, 2], ' Fable ': [3, 4] }
  expect(readCrewConfig(JSON.stringify(recipe))).toEqual({
    ok: false,
    reason: 'layout[" Fable "]: duplicate baton name fable',
  })
})

it.each(['settled', 'Settled', ' settled ', ' BATON: horse '])(
  'reads only unchanged condition %s (mutation: accept the trimmed form)',
  (when) => {
    const recipe = parseCrewYaml(liveCrewYaml)
    recipe.wires[0]!.when = when
    expect(readCrewConfig(JSON.stringify(recipe))).toEqual(
      when === when.trim()
        ? { ok: true, config: recipe }
        : {
            ok: false,
            reason: `wires[0].when: written as ${JSON.stringify(when)}; the record would store it as ${JSON.stringify(when.trim())} — write it exactly`,
          },
    )
  },
)

it('refuses an empty stored baton without falling back to the conversation name (mutation: treat empty baton as absent)', () => {
  expect(() =>
    crewToConfig(
      crew,
      [{ ...member, batonName: '' }],
      [{ ...session, name: 'Valid fallback' }],
      [project],
      [],
    ),
  ).toThrow('A conversation needs a baton name before export')
})

it.each([null, 'root-id'])(
  'round-trips only project-bound remote recipes: %s (mutation: drop remote project refusal or omit spawn place)',
  (projectId) => {
    const spec = {
      name: 'Remote review',
      providerId: 'codex',
      model: null,
      effort: null,
      projectId,
      providerAccountId: null,
      executionHost: 'little-monster',
      workAddress: {
        mode: 'repository' as const,
        repository: 'https://github.com/marckraw/convergence',
        branchName: null,
        label: 'marckraw/convergence',
      },
      roleCard: 'You are the reviewer.',
      member: null,
      returnWire: { instruction: 'Report the result.' },
    }
    const exportRecipe = () =>
      crewToConfig(liveCrew, liveMembers, liveSessions, liveProjects, [
        {
          ...liveRelays[0]!,
          action: 'spawn',
          targetSessionId: null,
          spawnSpec: spec,
        },
      ])
    if (projectId === null) {
      expect(exportRecipe).toThrow(
        'An errand on a remote host belongs to a project',
      )
      return
    }
    const config = exportRecipe()
    expect(new Ajv().validate(schema, config)).toBe(true)
    const to = config.wires[0]!.to
    expect(to).toMatchObject({
      spawn: {
        host: spec.executionHost,
        workAddress: spec.workAddress,
        roleCard: spec.roleCard,
        returnWire: spec.returnWire,
      },
    })
    const read = readCrewConfig(renderCrewYaml(config))
    expect(read).toEqual({ ok: true, config })
    expect(
      crewImportRelayFields(config.wires[0]!, projectId).spawnSpec,
    ).toEqual(spec)
  },
)

it.each([
  { host: '', workAddress: null },
  { host: 'little-monster', workAddress: null },
  {
    host: 'local',
    workAddress: {
      mode: 'repository' as const,
      repository: 'https://github.com/marckraw/convergence',
      branchName: null,
      label: 'repo',
    },
  },
  { host: 'local', roleCard: ' padded ' },
])(
  'refuses a spawn field the record would change: %j (mutation: bypass record validation)',
  (fields) => {
    const config = crewToConfig(
      liveCrew,
      liveMembers,
      liveSessions,
      liveProjects,
      liveRelays,
    )
    config.wires[0]!.to = {
      spawn: {
        name: 'Remote',
        provider: 'codex',
        model: null,
        effort: null,
        project: null,
        account: 'default',
        ...fields,
      },
    }
    expect(readCrewConfig(renderCrewYaml(config)).ok).toBe(false)
  },
)

it.each([8000, 8001])(
  'inherits the role-card bound at %s characters (mutation: change the one role-card cap)',
  (length) => {
    const config = crewToConfig(
      liveCrew,
      liveMembers,
      liveSessions,
      liveProjects,
      liveRelays,
    )
    config.wires[0]!.to = {
      spawn: {
        name: 'Reviewer',
        provider: 'codex',
        model: null,
        effort: null,
        project: null,
        account: 'default',
        roleCard: 'x'.repeat(length),
      },
    }
    expect(readCrewConfig(renderCrewYaml(config)).ok).toBe(length <= 8000)
  },
)

describe('the seat in the recipe (MAR-3083 R5)', () => {
  it('writes what each seat is', () => {
    const seated = {
      ...member,
      role: 'mastermind' as const,
      roleCard: 'You hold the map.',
      wipLimit: 3,
      lanePolicy: 'own-worktree' as const,
    }

    const config = crewToConfig(crew, [seated], [session], [project], [])

    // Mutation: drop one of these from the export and the round trip loses
    // it silently -- the crew imports elsewhere as a horse with no card.
    expect(config.roles.fable).toMatchObject({
      role: 'mastermind',
      kind: 'resident',
      roleCard: 'You hold the map.',
      wipLimit: 3,
      lanePolicy: 'own-worktree',
    })
  })

  it('omits a card and a lane nobody set, so an untouched crew exports as it always did', () => {
    const config = crewToConfig(crew, [member], [session], [project], [])

    expect(config.roles.fable).toMatchObject({
      role: 'horse',
      kind: 'resident',
      wipLimit: 1,
    })
    expect(config.roles.fable).not.toHaveProperty('roleCard')
    expect(config.roles.fable).not.toHaveProperty('lanePolicy')
  })

  it('reads a recipe that names a seat, and refuses a role no seat could be', () => {
    const yaml = renderCrewYaml(
      crewToConfig(
        crew,
        [{ ...member, role: 'reviewer' as const, roleCard: 'You read blind.' }],
        [session],
        [project],
        [],
      ),
    )

    const read = readCrewConfig(yaml)
    expect(read.ok).toBe(true)
    expect(read.ok && read.config.roles.fable?.role).toBe('reviewer')

    const bad = readCrewConfig(yaml.replace('"reviewer"', '"general"'))
    expect(bad.ok).toBe(false)
    expect(bad.ok === false && bad.reason).toContain('roles')
  })

  /**
   * A dynamic seat is a recipe with no conversation (R3), and `roles` is a map
   * of conversations. It is skipped rather than exported half-formed -- the
   * one seat field this recipe cannot carry yet.
   */
  it('skips a seat that has no conversation instead of failing the export', () => {
    const recipe = {
      ...member,
      sessionId: null,
      batonName: 'errand',
      kind: 'dynamic' as const,
      providerId: 'codex',
      model: 'gpt-6-astra',
    }

    const config = crewToConfig(
      crew,
      [member, recipe],
      [session],
      [project],
      [],
    )

    expect(Object.keys(config.roles)).toEqual(['fable'])
  })
})

/**
 * A wire may name the seat it spawns instead of restating the recipe
 * (MAR-3083 R3/C), and that has to survive the recipe file: without it, an
 * imported crew loses the link and spawns on a copy that can drift.
 */
describe('a spawn wire that names a seat', () => {
  const spawningCrew = {
    id: 'crew-1',
    crewId: 'crew-1',
    sourceSessionId: session.id,
    action: 'spawn' as const,
    targetSessionId: null,
    conditionToken: 'BATON: errand',
    instruction: null,
    opener: null,
    armed: true,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    spawnSpec: {
      executionHost: 'local',
      workAddress: null,
      roleCard: null,
      returnWire: null,
      name: 'Errand',
      member: 'errand',
      providerId: 'codex',
      model: 'gpt-6-astra',
      effort: 'high',
      projectId: 'project-private-id',
      providerAccountId: null,
    },
  }

  const recipe = {
    ...member,
    sessionId: null,
    batonName: 'errand',
    kind: 'dynamic' as const,
    providerId: 'claude-code',
    model: 'claude-opus-5',
    hostPolicy: 'little-monster',
    roleCard: 'You are an errand.',
  }

  it('writes the recipe into the wire rather than naming a seat the file drops', () => {
    const config = crewToConfig(
      crew,
      [member, recipe],
      [session],
      [project],
      [spawningCrew as never],
    )
    const to = config.wires[0]!.to as {
      spawn: {
        member?: string
        provider: string
        model: string | null
        host: string
        roleCard: string | null
      }
    }

    // Mutation: keep `member` (lap 2) and the imported wire names a seat this
    // file never carried — every firing then records F's error.
    expect(to.spawn.member).toBeUndefined()
    expect(to.spawn).toMatchObject({
      provider: 'claude-code',
      model: 'claude-opus-5',
      roleCard: 'You are an errand.',
      // The seat's own host stayed behind: a remote host in a spawn spec
      // needs a work address, and this wire states none. Writing it anyway
      // would produce a file the reader refuses.
      host: 'local',
    })

    const yaml = renderCrewYaml(
      config,
      uncarriedRecipeNotes([member, recipe], [spawningCrew as never]),
    )
    expect(yaml).toContain(
      'The dynamic seat "errand" is written into the spawn recipe of the wire "BATON: errand"',
    )
    expect(yaml).toContain('MAR-3099')
    expect(yaml).toContain('stayed behind')
    const read = readCrewConfig(yaml)
    expect(read.ok ? null : read.reason).toBeNull()
  })

  it("carries the seat's remote host when the wire says where that host works", () => {
    const addressed = {
      ...spawningCrew,
      spawnSpec: {
        ...spawningCrew.spawnSpec,
        executionHost: 'little-monster',
        workAddress: {
          mode: 'repository' as const,
          repository: 'git@github.com:marckraw/convergence.git',
          branchName: null,
          label: 'convergence',
        },
      },
    }

    const config = crewToConfig(
      crew,
      [member, recipe],
      [session],
      [project],
      [addressed as never],
    )

    // Mutation: carry the host unconditionally and the first test's file
    // becomes unreadable; drop it here and the seat's host never travels.
    expect(
      (config.wires[0]!.to as { spawn: { host: string } }).spawn.host,
    ).toBe('little-monster')
    expect(
      uncarriedRecipeNotes([member, recipe], [addressed as never])[0],
    ).not.toContain('stayed behind')
  })

  it('writes the seat it names, and reads it back', () => {
    const config = crewToConfig(
      crew,
      [member],
      [session],
      [project],
      [spawningCrew as never],
    )

    const to = config.wires[0]!.to as { spawn: { member?: string } }
    // Mutation: drop `member` from the exported spawn and the wire imports as
    // a standalone recipe -- the seat it was aimed at is lost.
    expect(to.spawn.member).toBe('errand')

    const read = readCrewConfig(renderCrewYaml(config))
    expect(read.ok).toBe(true)
    expect(
      read.ok &&
        (read.config.wires[0]!.to as { spawn: { member?: string } }).spawn
          .member,
    ).toBe('errand')
  })
})

/**
 * One encoding for `member`, from the door on (MAR-3083 lap 4, O). Seats are
 * stored lowercased and the engine resolves through the same normalizer; the
 * export compared the name raw, so a spec saying "Errand" fired correctly and
 * exported as a reference to a seat the file does not carry.
 */
describe('a spawn spec naming a seat in another spelling', () => {
  it('is normalized at the door, so the export inlines the recipe it names', () => {
    const spec = normalizeRelaySpawnSpec({
      executionHost: 'local',
      providerId: 'codex',
      name: 'Errand',
      member: '  Errand  ',
    })
    // Mutation: trim only (lap 3) and this reads "Errand"...
    expect(spec.member).toBe('errand')

    const recipe = {
      ...member,
      sessionId: null,
      batonName: 'errand',
      kind: 'dynamic' as const,
      providerId: 'claude-code',
      model: 'claude-opus-5',
      hostPolicy: 'local',
    }
    const config = crewToConfig(
      crew,
      [member, recipe],
      [session],
      [project],
      [
        {
          id: 'r1',
          crewId: 'c1',
          sourceSessionId: session.id,
          action: 'spawn',
          targetSessionId: null,
          conditionToken: 'BATON: errand',
          instruction: null,
          opener: null,
          armed: true,
          createdAt: 'x',
          updatedAt: 'y',
          spawnSpec: { ...spec, member: 'Errand' },
        } as never,
      ],
    )
    const to = config.wires[0]!.to as {
      spawn: { member?: string; provider: string }
    }

    // ...and here the export writes a dangling `member: "Errand"` with the
    // wire's own provider — the far side then records F's error on every
    // firing.
    expect(to.spawn.member).toBeUndefined()
    expect(to.spawn.provider).toBe('claude-code')
  })

  it('refuses a recipe file that spells the name differently from the record', () => {
    const yaml = renderCrewYaml(
      crewToConfig(crew, [member], [session], [project], []),
    ).replace(
      'wires: []',
      [
        'wires:',
        '  - { from: "fable", to: { spawn: { name: "Errand", member: "Errand", provider: "codex", model: null, effort: null, project: null, account: "default" } }, when: "BATON: errand", opener: "keep" }',
      ].join('\n'),
    )

    // The reader derived from the record: a value the record would rewrite is
    // a value the reader refuses, loudly, rather than importing it silently.
    const read = readCrewConfig(yaml)
    expect(read.ok ? null : read.reason).toContain('member')
  })
})

/**
 * Every recipe the file does not carry is named in the file (MAR-3083 lap 4,
 * P). A recipe no wire spawns used to vanish without a word.
 */
describe('recipes the file does not carry', () => {
  const unwired = {
    ...member,
    sessionId: null,
    batonName: 'scout',
    kind: 'dynamic' as const,
    providerId: 'codex',
    model: null,
    hostPolicy: 'local',
  }

  it('names a recipe no wire spawns', () => {
    const notes = uncarriedRecipeNotes([member, unwired], [])

    // Mutation: note only the recipes a wire points at (lap 3) and this is
    // empty — the seat is gone from the file with nothing said.
    expect(notes).toEqual([
      'The dynamic seat "scout" is not in this file: it has no conversation and no wire spawns it, and this file cannot carry a seat without a conversation yet (MAR-3099).',
    ])
  })

  it('decides "stayed behind" per wire, not per recipe', () => {
    const remote = {
      ...unwired,
      batonName: 'errand',
      hostPolicy: 'little-monster',
    }
    const base = {
      id: 'r',
      crewId: 'c1',
      sourceSessionId: session.id,
      action: 'spawn',
      targetSessionId: null,
      instruction: null,
      opener: null,
      armed: true,
      createdAt: 'x',
      updatedAt: 'y',
    }
    const spec = normalizeRelaySpawnSpec({
      executionHost: 'local',
      providerId: 'codex',
      name: 'Errand',
      member: 'errand',
    })
    const addressed = {
      ...base,
      id: 'r2',
      conditionToken: 'BATON: addressed',
      spawnSpec: {
        ...spec,
        workAddress: {
          mode: 'repository',
          repository: 'git@github.com:marckraw/convergence.git',
          branchName: null,
          label: 'convergence',
        },
      },
    }
    const bare = {
      ...base,
      id: 'r1',
      conditionToken: 'BATON: bare',
      spawnSpec: spec,
    }

    const notes = uncarriedRecipeNotes([member, remote], [
      bare,
      addressed,
    ] as never)

    // Mutation: decide from the first wire only and both notes agree.
    expect(notes).toHaveLength(2)
    expect(notes[0]).toContain('"BATON: bare"')
    expect(notes[0]).toContain('stayed behind')
    expect(notes[1]).toContain('"BATON: addressed"')
    expect(notes[1]).not.toContain('stayed behind')
  })
})
