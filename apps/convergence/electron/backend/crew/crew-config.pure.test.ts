import Ajv from 'ajv'
import { parse } from 'yaml'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { preProcessFile } from 'typescript'
import { describe, expect, it } from 'vitest'
import {
  crewToConfig,
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
      { ...member, sessionId: 'second-session', batonName: 'Null' },
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
    },
  })
  const validate = new Ajv({ allErrors: true }).compile(schema)
  expect({
    valid: validate(parseCrewYaml(renderCrewYaml(config))),
    errors: validate.errors,
  }).toEqual({ valid: true, errors: null })
})

it('keeps AJV imports out of production source (mutation: add runtime ajv import)', () => {
  const workspace = fileURLToPath(new URL('../../../', import.meta.url))
  const imports = ['electron', 'src'].flatMap((directory) => {
    const root = join(workspace, directory)
    return readdirSync(root, { recursive: true })
      .map(String)
      .filter(
        (file) =>
          /\.[cm]?[jt]sx?$/.test(file) &&
          !/\.(test|spec)\.|(^|[/\\])__tests__[/\\]/.test(file),
      )
      .flatMap((file) => {
        const path = join(root, file)
        return preProcessFile(readFileSync(path, 'utf8'), true, true)
          .importedFiles.filter(
            ({ fileName }) => fileName === 'ajv' || fileName.startsWith('ajv/'),
          )
          .map(({ fileName }) => `${relative(workspace, path)}: ${fileName}`)
      })
  })
  expect(imports.sort()).toEqual([])
})

it('reads the exported recipe at runtime (mutation: refuse valid YAML)', () => {
  expect(readCrewConfig(liveCrewYaml)).toEqual({
    ok: true,
    config: parseCrewYaml(liveCrewYaml),
  })
})

const invalidRecipes: [string, (value: ReturnType<typeof parse>) => void][] = [
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

it.each(['custom permissions', 'spawn and layout', 'empty crew'])(
  'accepts schema-valid %s at runtime (mutation: refuse valid YAML)',
  (kind) => {
    const config = parse(liveCrewYaml)
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
