import Ajv from 'ajv'
import { parse } from 'yaml'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { preProcessFile } from 'typescript'
import { describe, expect, it } from 'vitest'
import {
  crewToConfig,
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

it('keeps the canary libraries out of runtime dependencies (mutations: promote yaml to runtime; remove ajv declaration)', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
  )
  expect({
    runtimeYaml: Object.hasOwn(manifest.dependencies, 'yaml'),
    testYaml: Object.hasOwn(manifest.devDependencies, 'yaml'),
    testAjv: Object.hasOwn(manifest.devDependencies, 'ajv'),
  }).toEqual({ runtimeYaml: false, testYaml: true, testAjv: true })
})

/** C1 inverse belongs only to the canary; production never imports YAML parsing. */
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

it('keeps YAML imports out of production source (mutation: re-add the yaml import)', () => {
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
            ({ fileName }) =>
              fileName === 'yaml' || fileName.startsWith('yaml/'),
          )
          .map(({ fileName }) => `${relative(workspace, path)}: ${fileName}`)
      })
  })
  expect(imports.sort()).toEqual([])
})
