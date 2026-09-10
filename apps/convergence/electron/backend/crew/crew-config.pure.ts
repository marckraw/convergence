import { normalizeCrewBatonName } from './crew.pure'
import { parse } from 'yaml'
import { normalizeOriginKey } from '@mrck-labs/execution-host-protocol'
import {
  resolveRoundCap,
  normalizeRelayConditionToken,
} from '../relay/relay.pure'
import { resolveStallMinutes } from '../relay/crew-hail.pure'
import type {
  CrewConfig,
  CrewConfigWire,
  CrewConfigCrew,
  CrewConfigProject,
  CrewConfigSession,
} from './crew-config.types'
import type { SessionCrewMember } from './crew.types'
import type { SessionRelay } from '../relay/relay.types'

/** Maps database instances into the portable crew recipe; no IO crosses this boundary. */
export function crewToConfig(
  crew: CrewConfigCrew,
  members: readonly SessionCrewMember[],
  sessions: readonly CrewConfigSession[],
  projects: readonly CrewConfigProject[],
  relays: readonly SessionRelay[],
  options: { includePositions?: boolean } = {},
): CrewConfig {
  const roles: CrewConfig['roles'] = Object.create(null)
  for (const member of [...members].sort((a, b) =>
    compare(roleKey(a), roleKey(b)),
  )) {
    const session = sessions.find((s) => s.id === member.sessionId)
    if (!session) throw new Error('A crew member has no conversation')
    const key = roleKey(member)
    if (Object.hasOwn(roles, key))
      throw new Error(`Duplicate role name: ${key}`)
    const project =
      session.projectId === null
        ? null
        : projects.find((p) => p.id === session.projectId)
    if (project === undefined)
      throw new Error(`Project missing for role ${key}`)
    const permissions = session.permissionConfig ?? { preset: 'ask' as const }
    roles[key] = {
      conversation: session.name,
      provider: session.providerId,
      model: session.model,
      effort: session.effort,
      permissions:
        permissions.preset === 'custom'
          ? {
              preset: 'custom',
              ...(permissions.codex
                ? {
                    codex: {
                      approvalPolicy: permissions.codex.approvalPolicy,
                      sandbox: permissions.codex.sandbox,
                    },
                  }
                : {}),
              ...(permissions.claudeCode
                ? {
                    claudeCode: {
                      permissionMode: permissions.claudeCode.permissionMode,
                    },
                  }
                : {}),
            }
          : permissions.preset,
      project: projectReference(project),
      ...(project?.laneName ? { lane: project.laneName } : {}),
      host: session.executionHost,
    }
  }
  const config: CrewConfig = {
    version: 1,
    crew: crew.name,
    emoji: crew.emoji,
    ...(crew.accentColor === null ? {} : { color: crew.accentColor }),
    limits: {
      deliveriesPerRun: resolveRoundCap(crew.roundCap),
      attentionAfterMinutes: resolveStallMinutes(crew.stallMinutes),
    },
    roles,
    wires: relays
      .map((relay): CrewConfigWire => {
        if (relay.conditionToken === 'settled')
          throw new Error(
            'A wire condition reads as the reserved word "settled"; rename it before export',
          )
        const from = wireRole(relay.sourceSessionId, false)
        const to =
          relay.action === 'hail'
            ? wireRole(relay.targetSessionId, true)
            : spawnTarget(relay)

        return {
          from,
          to,
          when: relay.conditionToken ?? 'settled',
          opener:
            relay.opener === null
              ? ('keep' as const)
              : relay.opener === '/clear'
                ? ('clear' as const)
                : { first: relay.opener },
          ...(relay.instruction === null
            ? {}
            : { instruction: relay.instruction }),
          ...(relay.armed ? {} : { armed: false as const }),
        }
      })
      .sort(
        (a, b) =>
          compare(a.from, b.from) ||
          compare(
            typeof a.to === 'string' ? a.to : JSON.stringify(a.to),
            typeof b.to === 'string' ? b.to : JSON.stringify(b.to),
          ) ||
          compare(a.when, b.when) ||
          compare(JSON.stringify(a), JSON.stringify(b)),
      ),
  }
  if (options.includePositions)
    config.layout = Object.fromEntries(
      [...members]
        .sort((a, b) => compare(roleKey(a), roleKey(b)))
        .filter((m) => m.canvasX !== null && m.canvasY !== null)
        .map((m) => [roleKey(m), [m.canvasX!, m.canvasY!] as [number, number]]),
    )
  return config
  // Lanes are one level deep: LaneService.create refuses a lane of a lane;
  // deleting the root cascades to its lanes.
  function projectReference(project: CrewConfigProject | null): string | null {
    if (!project) return null
    const root = project.laneOf
      ? projects.find((candidate) => candidate.id === project.laneOf)
      : project
    if (!root)
      throw new Error(`Root project missing for lane ${project.laneName}`)
    return normalizeOriginKey(root.origin) ?? root.name
  }
  function spawnTarget(relay: SessionRelay): CrewConfigWire['to'] {
    const spec = relay.spawnSpec
    if (!spec) throw new Error('A spawn wire has no recipe')
    const project =
      spec.projectId === null
        ? null
        : projects.find((p) => p.id === spec.projectId)
    if (project === undefined) throw new Error('A spawn project is missing')
    return {
      spawn: {
        name: spec.name,
        provider: spec.providerId,
        model: spec.model,
        effort: spec.effort,
        project: projectReference(project),
        ...(project?.laneName ? { lane: project.laneName } : {}),
        account: 'default',
      },
    }
  }
  function wireRole(id: string | null, target: boolean): string {
    const member = members.find((m) => m.sessionId === id)
    if (!member) throw new Error('A wire endpoint is not in the crew')
    if (target && !member.batonName)
      throw new Error('A wire target needs a baton name before export')
    return roleKey(member)
  }
  function roleKey(member: SessionCrewMember): string {
    const sessionName =
      sessions.find((s) => s.id === member.sessionId)?.name ?? ''
    try {
      const key = normalizeCrewBatonName(member.batonName ?? sessionName)
      if (key) return key
    } catch {
      // Export uses the same name law as the record and the import reader.
    }
    throw new Error('A conversation needs a baton name before export')
  }
}
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
export function renderCrewYaml(config: CrewConfig): string {
  const lines = [
    `# yaml-language-server: $schema=https://raw.githubusercontent.com/marckraw/convergence/master/docs/crews/crew-config.schema.json`,
  ]
  for (const [key, value] of Object.entries(config)) {
    if (key === 'roles' || key === 'layout') {
      const entries = Object.entries(value)
      lines.push(entries.length ? `${key}:` : `${key}: {}`)
      for (const [name, item] of entries)
        lines.push(`  ${yamlKey(name)}: ${flow(item)}`)
    } else if (key === 'wires') {
      lines.push(value.length ? 'wires:' : 'wires: []')
      for (const wire of value) lines.push(`  - ${flow(wire)}`)
    } else lines.push(`${key}: ${flow(value)}`)
  }
  return lines.join('\n') + '\n'
}

function yamlKey(key: string): string {
  return /^[a-zA-Z][a-zA-Z0-9]*$/.test(key) && !/^(null|true|false)$/i.test(key)
    ? key
    : JSON.stringify(key)
}
function flow(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(flow).join(', ')}]`
  if (value !== null && typeof value === 'object')
    return `{ ${Object.entries(value)
      .map(([k, v]) => `${yamlKey(k)}: ${flow(v)}`)
      .join(', ')} }`
  return JSON.stringify(value)
}

/** A file name segment, never a relative path supplied by a crew name. */
export function crewExportSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'crew'
  )
}
/** Return every plurality candidate; a tie belongs to the user, not row order. */
export function crewHomeCandidates<T extends { id: string }>(
  sessions: readonly { projectId: string | null }[],
  projects: readonly T[],
): T[] {
  const counts = new Map<string, number>()
  for (const session of sessions)
    if (session.projectId)
      counts.set(session.projectId, (counts.get(session.projectId) ?? 0) + 1)
  const highest = Math.max(0, ...counts.values())
  return projects.filter(
    (project) => highest === 0 || counts.get(project.id) === highest,
  )
}

/** Reads the portable recipe before planning any local changes; AJV stays test-only. */
export function readCrewConfig(
  text: string,
): { ok: true; config: CrewConfig } | { ok: false; reason: string } {
  let value: unknown
  try {
    value = parse(text)
  } catch (error) {
    return {
      ok: false,
      reason: `document: ${error instanceof Error ? error.message : 'invalid YAML'}`,
    }
  }
  const reason =
    validateRecipe(value, '') ??
    validateBatonKeys(Object.keys((value as CrewConfig).roles), 'roles') ??
    validateBatonKeys(
      Object.keys((value as CrewConfig).layout ?? {}),
      'layout',
      true,
    )
  return reason
    ? { ok: false, reason }
    : { ok: true, config: value as CrewConfig }
}

// JSON Schema checks structure; the record's normalizer owns baton semantics.
function validateBatonKeys(
  keys: string[],
  field: string,
  ignoreInvalid = false,
): string | null {
  const names = new Set<string>()
  for (const key of keys) {
    const path = `${field}[${JSON.stringify(key)}]`
    try {
      const name = normalizeCrewBatonName(key)
      if (!name) {
        if (ignoreInvalid) continue
        return `${path}: a baton name must not be empty`
      }
      if (names.has(name)) return `${path}: duplicate baton name ${name}`
      names.add(name)
    } catch (error) {
      if (ignoreInvalid) continue
      const reason = error instanceof Error ? error.message : String(error)
      return `${path}: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}`
    }
  }
  return null
}

type Check = (value: unknown, path: string) => string | null
const expected = (path: string, kind: string): string =>
  `${path || 'document'}: expected ${kind}`
const string: Check = (v, p) =>
  typeof v === 'string' ? null : expected(p, 'string')
const number: Check = (v, p) =>
  typeof v === 'number' && Number.isFinite(v)
    ? null
    : expected(p, 'finite number')
const positiveInteger: Check = (v, p) =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1
    ? null
    : expected(p, 'positive integer')
const nullable =
  (check: Check): Check =>
  (v, p) =>
    v === null ? null : check(v, p)
const optional =
  (check: Check): Check =>
  (v, p) =>
    v === undefined ? null : check(v, p)
const oneOf =
  (...values: unknown[]): Check =>
  (v, p) =>
    values.includes(v) ? null : expected(p, values.map(String).join(' | '))
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const childPath = (p: string, key: string): string => (p ? `${p}.${key}` : key)
function shape(fields: Record<string, Check>): Check {
  return (v, p) => {
    if (!object(v)) return expected(p, 'object')
    for (const [key, check] of Object.entries(fields)) {
      const reason = check(
        Object.hasOwn(v, key) ? v[key] : undefined,
        childPath(p, key),
      )
      if (reason) return reason
    }
    const extra = Object.keys(v).find((key) => !Object.hasOwn(fields, key))
    return extra === undefined
      ? null
      : `${childPath(p, extra)}: unexpected field`
  }
}
const record =
  (check: Check): Check =>
  (v, p) => {
    if (!object(v)) return expected(p, 'record')
    for (const [key, value] of Object.entries(v)) {
      const reason = check(value, childPath(p, key))
      if (reason) return reason
    }
    return null
  }
const list =
  (check: Check): Check =>
  (v, p) => {
    if (!Array.isArray(v)) return expected(p, 'array')
    for (let i = 0; i < v.length; i++) {
      const reason = check(v[i], `${p}[${i}]`)
      if (reason) return reason
    }
    return null
  }
const customPermissions = shape({
  preset: oneOf('custom'),
  codex: optional(
    shape({
      approvalPolicy: oneOf('untrusted', 'on-request', 'never'),
      sandbox: oneOf('read-only', 'workspace-write', 'danger-full-access'),
    }),
  ),
  claudeCode: optional(
    shape({
      permissionMode: oneOf(
        'default',
        'acceptEdits',
        'auto',
        'dontAsk',
        'plan',
        'bypassPermissions',
      ),
    }),
  ),
})
const permissions: Check = (v, p) =>
  typeof v === 'string' ? oneOf('ask', 'yolo')(v, p) : customPermissions(v, p)
const spawn = shape({
  name: string,
  provider: string,
  model: nullable(string),
  effort: nullable(string),
  project: nullable(string),
  lane: optional(string),
  account: oneOf('default'),
})
const target: Check = (v, p) =>
  typeof v === 'string'
    ? null
    : object(v)
      ? shape({ spawn })(v, p)
      : expected(p, 'role | { spawn }')
const opener: Check = (v, p) =>
  typeof v === 'string'
    ? oneOf('keep', 'clear')(v, p)
    : object(v)
      ? shape({ first: string })(v, p)
      : expected(p, 'keep | clear | { first }')
const condition: Check = (v, p) => {
  if (typeof v !== 'string') return expected(p, 'string')
  if (v === 'settled') return null
  try {
    return normalizeRelayConditionToken(v) === null
      ? expected(p, 'settled or a condition')
      : null
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return `${p}: ${reason.replace(/^A /, 'a ')}`
  }
}
const pair: Check = (v, p) =>
  !Array.isArray(v) || v.length !== 2
    ? expected(p, 'pair of coordinates')
    : list(number)(v, p)
const validateRecipe = shape({
  version: oneOf(1),
  crew: string,
  emoji: nullable(string),
  color: optional(string),
  limits: shape({
    deliveriesPerRun: positiveInteger,
    attentionAfterMinutes: positiveInteger,
  }),
  roles: record(
    shape({
      conversation: string,
      provider: string,
      model: nullable(string),
      effort: nullable(string),
      permissions,
      project: nullable(string),
      lane: optional(string),
      host: string,
    }),
  ),
  wires: list(
    shape({
      from: string,
      to: target,
      when: condition,
      opener,
      instruction: optional(string),
      armed: optional(oneOf(false)),
    }),
  ),
  layout: optional(record(pair)),
})
