import Ajv from 'ajv'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  crewToConfig,
  renderCrewYaml,
  parseCrewYaml,
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
import type { CrewConfigSession } from './crew-config.types'

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

it('pins the live five-member six-wire YAML (mutations: emit id; reverse wire order)', () => {
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
