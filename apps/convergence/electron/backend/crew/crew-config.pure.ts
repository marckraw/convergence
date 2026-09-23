import { isDeepStrictEqual } from 'node:util'
import { normalizeCrewBatonName } from './crew.pure'
import { parse } from 'yaml'
import { normalizeOriginKey } from '@mrck-labs/execution-host-protocol'
import {
  normalizeRelaySpawnSpec,
  resolveRoundCap,
  normalizeRelayConditionToken,
} from '../relay/relay.pure'
import { resolveStallMinutes } from '../relay/crew-hail.pure'
import { normalizeTrackerBinding } from '../tracker/tracker-binding.pure'
import { TRACKER_LOGICAL_STATUSES } from '../tracker/tracker.types'
import type {
  CrewConfig,
  CrewConfigTracker,
  CrewConfigWire,
  CrewConfigCrew,
  CrewConfigProject,
  CrewConfigSession,
} from './crew-config.types'
import type { SessionCrewMember } from './crew.types'
import type { RelaySpawnSpec, SessionRelay } from '../relay/relay.types'

/** Maps database instances into the portable crew recipe; no IO crosses this boundary. */
export function crewToConfig(
  crew: CrewConfigCrew,
  members: readonly SessionCrewMember[],
  sessions: readonly CrewConfigSession[],
  projects: readonly CrewConfigProject[],
  relays: readonly SessionRelay[],
  options: {
    includePositions?: boolean
    /**
     * The bound project's name as the crew's own key answered it at export
     * (MAR-3211). Null or absent: the id travels alone, never an invented name.
     */
    trackerProjectName?: string | null
  } = {},
): CrewConfig {
  const roles: CrewConfig['roles'] = Object.create(null)
  // A seat whose conversation was deleted is SKIPPED, never thrown on and
  // never dropped in silence (MAR-3118 lap 2, A): the file carries
  // conversations, this seat has none, and `orphanSeatNotes` names it in a
  // comment. A wire still aimed at it keeps refusing (`wireRole`), because a
  // file whose wire names a role it does not carry cannot be read back.
  const carried = members.filter((member) => !member.conversationMissing)
  for (const member of [...carried].sort((a, b) =>
    compare(roleKey(a), roleKey(b)),
  )) {
    // A dynamic seat is a recipe with no conversation (R3), and `roles` is a
    // map of conversations, so it is never written here. What the file does
    // instead is said per recipe by `uncarriedRecipeNotes`: a recipe a wire
    // spawns rides INLINE in that wire (see `spawnTarget`); a recipe no wire
    // spawns is not in the file, and the comment says so. The seat itself
    // travels with MAR-3099.
    if (member.kind === 'dynamic') continue
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
      // What this seat IS travels with the recipe, so a crew imported
      // elsewhere carries its roles rather than being re-typed (R5).
      role: member.role,
      kind: member.kind,
      ...(member.roleCard === null ? {} : { roleCard: member.roleCard }),
      ...(member.lanePolicy === null ? {} : { lanePolicy: member.lanePolicy }),
      wipLimit: member.wipLimit,
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
    ...(crew.trackerBinding
      ? {
          tracker: trackerBlock(
            crew.trackerBinding,
            options.trackerProjectName ?? null,
          ),
        }
      : {}),
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
      [...carried]
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
  /**
   * The spawn's recipe fields, with a named seat's values written in.
   *
   * A recipe that is in this crew wins on what it is, exactly as the engine
   * reads it at firing time, so the exported wire behaves the same on the far
   * side without the seat travelling.
   */
  function inlineRecipe(spec: RelaySpawnSpec): {
    member?: string
    provider: string
    model: string | null
    effort: string | null
    host: string
    roleCard: string | null
  } {
    const seat = spec.member
      ? members.find(
          (entry) =>
            entry.sessionId === null && entry.batonName === spec.member,
        )
      : undefined
    return {
      provider: seat?.providerId ?? spec.providerId,
      model: seat?.model ?? spec.model,
      effort: spec.effort,
      // The seat's host is carried only when this wire can say where that
      // host works: a remote host in a spawn spec needs a work address, and a
      // seat does not hold one. Rather than write a file the reader refuses,
      // the wire keeps its own host and `uncarriedRecipeNotes` says so.
      host: canCarrySeatHost(spec, seat)
        ? seat!.hostPolicy!
        : spec.executionHost,
      roleCard: spec.roleCard ?? seat?.roleCard ?? null,
      // Kept only when it names something this file still carries; a recipe
      // is inlined above instead.
      ...(spec.member && !seat ? { member: spec.member } : {}),
    }
  }

  function spawnTarget(relay: SessionRelay): CrewConfigWire['to'] {
    if (!relay.spawnSpec) throw new Error('A spawn wire has no recipe')
    const spec = normalizeRelaySpawnSpec(relay.spawnSpec)
    const project =
      spec.projectId === null
        ? null
        : projects.find((p) => p.id === spec.projectId)
    if (project === undefined) throw new Error('A spawn project is missing')
    return {
      spawn: {
        name: spec.name,
        // The recipe this wire names is INLINED, and `member` is omitted
        // (MAR-3083 lap 3, K): `roles` cannot carry a seat with no
        // conversation, so a file that kept the reference imported a wire
        // pointing at a seat the crew does not have -- and every firing then
        // recorded "this spawn names no seat this crew has". Inlining keeps
        // the wire working; MAR-3099 gives recipes a home of their own.
        ...inlineRecipe(spec),
        project: projectReference(project),
        ...(project?.laneName ? { lane: project.laneName } : {}),
        account: 'default',
        workAddress: spec.workAddress,
        returnWire: spec.returnWire,
      },
    }
  }
  function wireRole(id: string | null, target: boolean): string {
    const member = carried.find((m) => m.sessionId === id)
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
/**
 * The binding as the file writes it: every stored field, so the far side binds
 * exactly this crew's settings rather than its own defaults. Never a key --
 * the binding type has no field that could hold one.
 */
function trackerBlock(
  binding: NonNullable<CrewConfigCrew['trackerBinding']>,
  projectName: string | null,
): CrewConfigTracker {
  return {
    kind: binding.kind,
    project: binding.projectId,
    ...(projectName ? { projectName } : {}),
    labelPrefix: binding.labelPrefix,
    wavePrefix: binding.wavePrefix,
    statusMap: { ...binding.statusMap },
    autoDispatch: binding.autoDispatch,
  }
}
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
export function renderCrewYaml(
  config: CrewConfig,
  notes: readonly string[] = [],
): string {
  const lines = [
    `# yaml-language-server: $schema=https://raw.githubusercontent.com/marckraw/convergence/master/docs/crews/crew-config.schema.json`,
    ...notes.map((note) => `# ${note}`),
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
      return `${path}: ${reason.replace(/^A /, 'a ')}`
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
const spawnShape = shape({
  name: string,
  member: optional(string),
  provider: string,
  model: nullable(string),
  effort: nullable(string),
  project: nullable(string),
  lane: optional(string),
  account: oneOf('default'),
  host: optional(string),
  workAddress: optional(() => null),
  roleCard: optional(nullable(string)),
  returnWire: optional(nullable(shape({ instruction: string }))),
})
// The record owns acceptance: a provided field must survive normalization unchanged.
const spawn: Check = (v, p) => {
  const reason = spawnShape(v, p)
  if (reason) return reason
  const input = v as import('./crew-config.types').CrewConfigSpawn
  try {
    const normalized = normalizeRelaySpawnSpec({
      name: input.name,
      member: input.member,
      providerId: input.provider,
      model: input.model,
      effort: input.effort,
      projectId: input.project,
      providerAccountId: null,
      executionHost: input.host,
      workAddress: input.workAddress,
      roleCard: input.roleCard,
      returnWire: input.returnWire,
    })
    for (const [field, kept] of Object.entries({
      name: normalized.name,
      member: normalized.member,
      provider: normalized.providerId,
      model: normalized.model,
      effort: normalized.effort,
      host: normalized.executionHost,
      workAddress: normalized.workAddress,
      roleCard: normalized.roleCard,
      returnWire: normalized.returnWire,
    })) {
      if (
        Object.hasOwn(input, field) &&
        !isDeepStrictEqual(input[field as keyof typeof input], kept)
      )
        return `${p}.${field}: write the value exactly as the record stores it`
    }
    return null
  } catch (error) {
    return `${p}: ${error instanceof Error ? error.message : String(error)}`
  }
}
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
    const normalized = normalizeRelayConditionToken(v)
    if (normalized === null) return expected(p, 'settled or a condition')
    return normalized === v
      ? null
      : `${p}: written as ${JSON.stringify(v)}; the record would store it as ${JSON.stringify(normalized)} — write it exactly`
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return `${p}: ${reason.replace(/^A /, 'a ')}`
  }
}
/** The code a refused key carries, so a reader can name the law (MAR-3211 R4). */
export const TRACKER_KEY_FORBIDDEN = 'tracker.key-forbidden'
/** A field name that would hold a credential. None of the block's fields does. */
const CREDENTIAL_FIELD = /key|token|secret|password|credential/i
/** What a Linear API key looks like. */
const TRACKER_KEY_VALUE = /^\s*lin_api_/
const keyForbidden = (path: string): string =>
  `${path}: a crew file never carries a tracker key — set the key on this machine in Mission Control (${TRACKER_KEY_FORBIDDEN})`
/** The first string in the block, key or value, that looks like a key. */
function keyShapedValue(value: unknown, path: string): string | null {
  if (typeof value === 'string')
    return TRACKER_KEY_VALUE.test(value) ? path : null
  if (!object(value)) return null
  for (const [key, child] of Object.entries(value)) {
    const childAt = childPath(path, key)
    if (TRACKER_KEY_VALUE.test(key)) return childAt
    const found = keyShapedValue(child, childAt)
    if (found) return found
  }
  return null
}
const trimmedText: Check = (v, p) =>
  typeof v !== 'string'
    ? expected(p, 'string')
    : !v.trim()
      ? `${p}: must not be empty`
      : v === v.trim()
        ? null
        : `${p}: written with surrounding spaces; write it exactly`
const boolean: Check = (v, p) =>
  typeof v === 'boolean' ? null : expected(p, 'boolean')
const TRACKER_FIELDS: Record<keyof CrewConfigTracker, Check> = {
  kind: oneOf('linear'),
  project: trimmedText,
  projectName: optional(trimmedText),
  labelPrefix: optional(string),
  wavePrefix: optional(string),
  statusMap: optional(record(oneOf(...TRACKER_LOGICAL_STATUSES))),
  autoDispatch: optional(boolean),
}
/**
 * The tracker block (MAR-3211). Three laws, in the order a person needs them:
 *
 * 1. No key, ever (R4). Any field the block does not define is refused, and
 *    one whose name could hold a credential is refused with the law's words;
 *    any string shaped like a Linear key is refused wherever it sits.
 * 2. The id is the binding (ruling A). A file naming a project without its id
 *    is refused: `projectName` is shown, never bound.
 * 3. The record owns acceptance: each field provided must be what
 *    `normalizeTrackerBinding` -- the binding's own write door -- would store.
 */
const tracker: Check = (v, p) => {
  if (!object(v)) return expected(p, 'object')
  const extra = Object.keys(v).find(
    (key) => !Object.hasOwn(TRACKER_FIELDS, key),
  )
  if (extra !== undefined)
    return CREDENTIAL_FIELD.test(extra)
      ? keyForbidden(childPath(p, extra))
      : `${childPath(p, extra)}: unexpected field`
  const leaked = keyShapedValue(v, p)
  if (leaked) return keyForbidden(leaked)
  if (!Object.hasOwn(v, 'project'))
    return Object.hasOwn(v, 'projectName')
      ? `${childPath(p, 'project')}: the project id is the binding — this file names the project but not its id, and projectName is only shown, never bound`
      : expected(childPath(p, 'project'), 'the tracker project id')
  for (const [key, check] of Object.entries(TRACKER_FIELDS)) {
    const reason = check(
      Object.hasOwn(v, key) ? v[key] : undefined,
      childPath(p, key),
    )
    if (reason) return reason
  }
  const input = v as unknown as CrewConfigTracker
  try {
    const normalized = normalizeTrackerBinding({
      kind: input.kind,
      projectId: input.project,
      labelPrefix: input.labelPrefix,
      wavePrefix: input.wavePrefix,
      statusMap: input.statusMap,
      autoDispatch: input.autoDispatch,
    })
    for (const [field, kept] of Object.entries({
      project: normalized.projectId,
      labelPrefix: normalized.labelPrefix,
      wavePrefix: normalized.wavePrefix,
      statusMap: normalized.statusMap,
    })) {
      if (
        Object.hasOwn(input, field) &&
        !isDeepStrictEqual(input[field as keyof CrewConfigTracker], kept)
      )
        return `${childPath(p, field)}: write the value exactly as the binding stores it`
    }
    return null
  } catch (error) {
    return `${p}: ${error instanceof Error ? error.message : String(error)}`
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
  tracker: optional(tracker),
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
      role: optional(oneOf('mastermind', 'horse', 'reviewer', 'designer')),
      // `roles` is a map of CONVERSATIONS: a seat is dynamic exactly when it
      // has none, so a role written as `dynamic` describes something this map
      // cannot hold. Refused by name rather than imported onto a
      // session-bound row (MAR-3083 lap 3, J). Recipes travel with MAR-3099.
      kind: optional(oneOf('resident')),
      roleCard: optional(string),
      lanePolicy: optional(oneOf('main', 'own-worktree')),
      wipLimit: optional(positiveInteger),
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

/**
 * Every seat whose conversation was deleted, said as a comment in the file
 * (MAR-3118 lap 2, A): `crewToConfig` skips it, and the file says so instead
 * of letting the seat vanish.
 */
export function orphanSeatNotes(
  members: readonly SessionCrewMember[],
): string[] {
  return members
    .filter((member) => member.conversationMissing)
    .map(
      (member) =>
        `seat "${member.batonName ?? 'unnamed'}" skipped — its conversation no longer exists`,
    )
}

/**
 * Every dynamic seat this file does not carry, said as a comment in the file
 * (MAR-3083 lap 4, P).
 *
 * `roles` holds conversations, so no recipe is written there. A recipe that a
 * wire spawns is carried INLINE in that wire -- one note per wire, because
 * whether its host travelled is a fact about the wire (a remote host needs a
 * work address the wire states or does not). A recipe no wire spawns is not
 * in the file at all, and the note says exactly that instead of letting it
 * vanish.
 */
export function uncarriedRecipeNotes(
  members: readonly SessionCrewMember[],
  relays: readonly SessionRelay[],
): string[] {
  const notes: string[] = []
  for (const member of members) {
    if (member.sessionId !== null || member.batonName === null) continue
    const wires = relays.filter(
      (relay) => relay.spawnSpec?.member === member.batonName,
    )
    if (wires.length === 0) {
      notes.push(
        `The dynamic seat "${member.batonName}" is not in this file: it has no ` +
          `conversation and no wire spawns it, and this file cannot carry a ` +
          `seat without a conversation yet (MAR-3099).`,
      )
      continue
    }
    for (const wire of wires) {
      const hostTravelled = canCarrySeatHost(wire.spawnSpec!, member)
      notes.push(
        `The dynamic seat "${member.batonName}" is written into the spawn ` +
          `recipe of the wire "${wire.conditionToken ?? 'settled'}": this file ` +
          `cannot carry a seat without a conversation yet (MAR-3099).` +
          (hostTravelled
            ? ''
            : ` Its host "${member.hostPolicy ?? 'local'}" stayed behind on ` +
              `this wire — a remote host needs a work address the wire does ` +
              `not state.`),
      )
    }
  }
  return notes
}

/** Whether a seat's host can travel in this wire's spawn spec (K). */
function canCarrySeatHost(
  spec: RelaySpawnSpec,
  seat: { hostPolicy: string | null } | undefined,
): boolean {
  if (!seat?.hostPolicy) return false
  return seat.hostPolicy === 'local' || spec.workAddress !== null
}
