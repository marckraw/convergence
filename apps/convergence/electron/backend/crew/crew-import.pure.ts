import { normalizeCrewBatonName } from './crew.pure'
import { normalizeOriginKey } from '@mrck-labs/execution-host-protocol'
import type {
  CrewConfig,
  CrewConfigRole,
  CrewConfigWire,
} from './crew-config.types'
import type { CrewImportWorld, CrewImportPlan } from './crew-import.types'
import {
  resolveRoundCap,
  sameCondition,
  batonConditionToken,
} from '../relay/relay.pure'
import { resolveStallMinutes } from '../relay/crew-hail.pure'
import type {
  CrewImportRow,
  CrewImportRoleRow,
  CrewImportWireRow,
} from '../../../src/shared/types/crew-import.types'

/** Pure reconciliation: the explicit world contains records, never live handles or IO. */
export function planCrewImport(
  config: CrewConfig,
  world: CrewImportWorld,
  choices: Record<string, string> = {},
): CrewImportPlan {
  const crews = world.crews.filter((c) => c.name === config.crew)
  const crew = choices.crew
    ? crews.find((c) => c.id === choices.crew)
    : crews.length === 1
      ? crews[0]
      : undefined
  const roles = Object.entries(config.roles)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([role, spec]): CrewImportRoleRow => {
      const key = `role:${role}`
      const batonName = normalizeCrewBatonName(role)!
      const project = resolveProject(
        spec.project,
        spec.lane,
        key,
        world,
        choices,
      )
      const base = {
        ...row(key, spec.conversation, 'bound'),
        role,
        sessionId: null,
        projectId: project.projectId,
      }
      if (project.state) return { ...base, ...project }
      if (spec.host !== 'local' && !world.endpointIds.includes(spec.host))
        return {
          ...base,
          state: 'missing-endpoint',
          detail: `missing endpoint ${spec.host}; configure it in Settings → execution hosts`,
        }
      const matches = world.sessions.filter(
        (s) =>
          s.name.trim() === spec.conversation.trim() &&
          s.projectId === project.projectId &&
          s.executionHost === spec.host &&
          (project.projectId !== null || s.contextKind === 'global'),
      )
      const candidates = matches.filter((s) => s.archivedAt === null)
      const options = candidates.map((s) => ({
        value: s.id,
        label: `${s.name} · ${candidateContext(s)} · ${s.id} · ${world.crews.some((c) => c.sessionIds.includes(s.id)) ? 'in a crew' : 'not in a crew'} · ${s.lastActivity ?? 'no activity'}`,
      }))
      if (spec.host === 'local')
        options.push({ value: 'new', label: 'Create new' })
      const selected = choices[key]
      if (selected === 'new' || candidates.length === 0)
        return {
          ...base,
          state: spec.host === 'local' ? 'create' : 'remote-create-unsupported',
          detail:
            spec.host === 'local'
              ? matches.some((s) => s.archivedAt !== null) &&
                candidates.length === 0
                ? 'an archived conversation of this name exists; import does not unarchive'
                : 'will create'
              : 'Remote conversations can be bound, but cannot be created by import yet.',
        }
      const bound = selected
        ? candidates.find((s) => s.id === selected)
        : candidates.length === 1
          ? candidates[0]
          : undefined
      if (!bound)
        return {
          ...base,
          state: 'choose',
          detail: 'Choose a conversation; none is selected automatically.',
          options,
        }
      const differences = roleDifferences(spec, bound)
      const member = crew?.members.find((m) => m.sessionId === bound.id)
      if (member && member.batonName !== batonName)
        differences.push('batonName')
      const describeDifferences = () =>
        differences
          .map((field) =>
            field === 'batonName'
              ? `baton name (${member?.batonName ?? 'unnamed'} → ${batonName})`
              : field,
          )
          .join(', ')
      const immutable = differences.filter(
        (f) => f === 'provider' || f === 'permissions',
      )
      const canUpdate =
        differences.includes('batonName') ||
        modelUpdateOffered(spec, bound, differences)
      if (immutable.length && !selected)
        return {
          ...base,
          state: 'choose',
          detail: `differs: ${describeDifferences()}`,
          differences,
          options: [
            {
              value: bound.id,
              label: `Bind as is · ${candidateContext(bound)}`,
            },
            ...(spec.host === 'local'
              ? [{ value: 'new', label: 'Create new' }]
              : []),
          ],
        }
      return {
        ...base,
        sessionId: bound.id,
        state: canUpdate ? 'differs' : 'bound',
        differences,
        canUpdate,
        detail: differences.length
          ? `differs: ${describeDifferences()}${immutable.length ? (spec.provider !== bound.providerId ? '; provider, model, effort and permissions kept when binding as is' : '; provider/permissions kept when binding as is') : ''}`
          : 'bound',
      }
    })
  for (const role of roles) {
    if (
      role.sessionId &&
      roles.some(
        (other) => other !== role && other.sessionId === role.sessionId,
      )
    ) {
      role.state = 'choose'
      role.detail =
        'Two roles bind the same conversation. Choose distinct conversations or create new.'
      role.options = [
        {
          value: role.sessionId,
          label: `Bind this conversation · ${candidateContext(world.sessions.find((s) => s.id === role.sessionId)!)}`,
        },
        ...(config.roles[role.role]!.host === 'local'
          ? [{ value: 'new', label: 'Create new' }]
          : []),
      ]
    }
  }
  const crewRow: CrewImportPlan['crew'] = {
    ...row(
      'crew',
      config.crew,
      crew ? 'existing' : crews.length ? 'choose' : 'new',
    ),
    id: crew?.id ?? null,
  }
  if (crewRow.state === 'choose') {
    crewRow.detail = 'Choose the crew with this name'
    crewRow.options = crews.map((c) => ({
      value: c.id,
      label: `${c.name} · ${c.id}`,
    }))
  }
  if (crew) {
    crewRow.differences = [
      ...(crew.emoji !== config.emoji ? ['emoji'] : []),
      ...(crew.accentColor !== (config.color ?? null) ? ['color'] : []),
    ]
    if (crewRow.differences.length) {
      crewRow.state = 'differs'
      crewRow.canUpdate = true
      crewRow.detail = `differs: ${crewRow.differences.join(', ')}`
    }
  }
  const wires: CrewImportWireRow[] = config.wires.map((wire, index) => {
    const key = `wire:${index}`
    const targetName =
      typeof wire.to === 'string' ? wire.to : wire.to.spawn.name
    const base: CrewImportWireRow = {
      ...row(key, `${wire.from} → ${targetName} · ${wire.when}`, 'create'),
      index,
      relayId: null,
      spawnProjectId: null,
    }
    const source = roles.find(
      (r) =>
        normalizeCrewBatonName(r.role) === normalizedRoleReference(wire.from),
    )
    const targetReference =
      typeof wire.to === 'string' ? normalizedRoleReference(wire.to) : null
    const target =
      typeof wire.to === 'string'
        ? roles.find((r) => normalizeCrewBatonName(r.role) === targetReference)
        : null
    if (!source || (typeof wire.to === 'string' && !target))
      return {
        ...base,
        state: 'choose',
        detail: 'Wire names a role absent from the file; edit the recipe.',
      }
    if (
      config.wires.some(
        (other, i) =>
          i < index &&
          wireKey(other) === wireKey(wire) &&
          sameCondition(
            crewImportRelayFields(other, null).conditionToken,
            crewImportRelayFields(wire, null).conditionToken,
          ),
      )
    )
      return {
        ...base,
        state: 'choose',
        detail: 'Duplicate wire key in the file; edit the recipe.',
      }
    if (typeof wire.to !== 'string') {
      if (wire.opener !== 'keep')
        return {
          ...base,
          state: 'choose',
          detail: `wires[${index}].opener: spawn wires start fresh and cannot store an opener; use keep.`,
        }
      const project = resolveProject(
        wire.to.spawn.project,
        wire.to.spawn.lane,
        key,
        world,
        choices,
      )
      base.spawnProjectId = project.projectId
      if (project.state) return { ...base, ...project }
    }
    const existing = crew
      ? world.relays.filter(
          (r) =>
            r.crewId === crew.id &&
            r.sourceSessionId === source.sessionId &&
            sameCondition(
              r.conditionToken,
              crewImportRelayFields(wire, null).conditionToken,
            ) &&
            (typeof wire.to === 'string'
              ? r.action === 'hail' && r.targetSessionId === target?.sessionId
              : r.action === 'spawn' &&
                r.spawnSpec?.name === wire.to.spawn.name),
        )
      : []
    const selected = choices[key]
    const bound =
      selected === 'new'
        ? undefined
        : selected
          ? existing.find((r) => r.id === selected)
          : existing.length === 1
            ? existing[0]
            : undefined
    if (!bound && existing.length && selected !== 'new')
      return {
        ...base,
        state: 'choose',
        detail: 'Choose a matching local wire',
        options: [
          ...existing.map((r) => ({ value: r.id, label: r.id })),
          { value: 'new', label: 'Create new' },
        ],
      }
    if (!bound) return base
    const fields = crewImportRelayFields(wire, base.spawnProjectId)
    const differences = [
      ...(bound.opener !== fields.opener ? ['opener'] : []),
      ...(bound.instruction !== fields.instruction ? ['instruction'] : []),
      ...(bound.armed !== fields.armed ? ['armed'] : []),
      ...(stable(bound.spawnSpec) !== stable(fields.spawnSpec)
        ? ['spawn']
        : []),
    ]
    return {
      ...base,
      relayId: bound.id,
      state: differences.length ? 'differs' : 'existing',
      differences,
      canUpdate: !!differences.length,
      detail: differences.length
        ? `differs: ${differences.join(', ')}`
        : 'existing',
    }
  })
  const limits = row('limits', 'Limits', 'existing')
  limits.differences = [
    ...(!crew ||
    resolveRoundCap(crew.roundCap) !== config.limits.deliveriesPerRun
      ? ['deliveriesPerRun']
      : []),
    ...(!crew ||
    resolveStallMinutes(crew.stallMinutes) !==
      config.limits.attentionAfterMinutes
      ? ['attentionAfterMinutes']
      : []),
  ]
  if (limits.differences.length) {
    limits.state = crew ? 'differs' : 'create'
    limits.canUpdate = !!crew
    limits.detail = `differs: ${limits.differences.join(', ')}`
  }
  const kept = crew
    ? [
        ...crew.members
          .filter((m) => !roles.some((r) => r.sessionId === m.sessionId))
          .map((m) => ({
            ...row(
              `member:${m.sessionId}`,
              m.batonName ??
                world.sessions.find((s) => s.id === m.sessionId)?.name ??
                m.sessionId,
              'kept',
            ),
            detail: 'member not in file — kept',
          })),
        ...world.relays
          .filter(
            (r) =>
              r.crewId === crew.id && !wires.some((w) => w.relayId === r.id),
          )
          .map((r) => ({
            ...row(`relay:${r.id}`, r.id, 'kept'),
            detail: 'wire not in file — kept',
            warnings: roles
              .filter((role) => {
                const oldName = crew.members.find(
                  (m) => m.sessionId === role.sessionId,
                )?.batonName
                return (
                  oldName &&
                  role.differences.includes('batonName') &&
                  sameCondition(
                    r.conditionToken,
                    batonConditionToken(oldName),
                  ) &&
                  !roles.some(
                    (next) =>
                      normalizeCrewBatonName(next.role) === oldName &&
                      !next.differences.includes('batonName'),
                  ) &&
                  !crew.members.some(
                    (m) =>
                      m.batonName === oldName &&
                      !roles.some((next) => next.sessionId === m.sessionId),
                  )
                )
              })
              .map((role) => {
                const oldName = crew.members.find(
                  (m) => m.sessionId === role.sessionId,
                )!.batonName!
                const source =
                  crew.members.find((m) => m.sessionId === r.sourceSessionId)
                    ?.batonName ??
                  world.sessions.find((s) => s.id === r.sourceSessionId)
                    ?.name ??
                  r.sourceSessionId
                const takeover = roles.find(
                  (next) => normalizeCrewBatonName(next.role) === oldName,
                )
                return {
                  updateKey: role.key,
                  ...(takeover ? { takeoverUpdateKey: takeover.key } : {}),
                  message: `wire ${source} → ${oldName} waits on a baton no member will carry`,
                }
              }),
          })),
      ]
    : []
  return {
    path: '',
    revision: '',
    crew: crewRow,
    roles,
    wires,
    limits,
    kept,
    hasLayout: !!config.layout,
    canApply: [crewRow, ...roles, ...wires].every((r) => !blocked(r)),
  }
}
function row(
  key: string,
  label: string,
  state: CrewImportRow['state'],
): CrewImportRow {
  return {
    key,
    label,
    state,
    detail: state,
    differences: [],
    canUpdate: false,
    options: [],
  }
}
function blocked(row: CrewImportRow): boolean {
  return (
    row.state === 'choose' ||
    row.state.startsWith('missing-') ||
    row.state === 'remote-create-unsupported'
  )
}
function resolveProject(
  reference: string | null,
  lane: string | undefined,
  key: string,
  world: CrewImportWorld,
  choices: Record<string, string>,
): {
  projectId: string | null
  state?: CrewImportRow['state']
  detail?: string
  options?: CrewImportRow['options']
  choiceKey?: string
} {
  if (reference === null)
    return lane
      ? {
          projectId: null,
          state: 'missing-lane',
          detail: `missing lane ${lane}: global conversations have no lanes`,
        }
      : { projectId: null }
  const normalizedReference = normalizeOriginKey(reference) ?? reference
  const roots = world.projects.filter(
    (p) =>
      !p.laneOf &&
      (normalizedReference.includes('/')
        ? normalizeOriginKey(p.origin) === normalizedReference
        : p.name === normalizedReference),
  )
  if (!roots.length)
    return {
      projectId: null,
      state: 'missing-project',
      detail: `missing project ${reference}`,
    }
  const choiceKey = `${key}:project`
  const root = choices[choiceKey]
    ? roots.find((p) => p.id === choices[choiceKey])
    : roots.length === 1
      ? roots[0]
      : undefined
  if (!root)
    return {
      projectId: null,
      state: 'choose',
      detail: `Choose project ${reference}`,
      choiceKey,
      options: roots.map((p) => ({
        value: p.id,
        label: `${p.name} · ${p.id}`,
      })),
    }
  if (!lane) return { projectId: root.id }
  const lanes = world.projects.filter(
    (p) => p.laneOf === root.id && p.laneName === lane,
  )
  if (lanes.length !== 1)
    return {
      projectId: null,
      state: 'missing-lane',
      detail: `missing lane ${lane} in ${reference}; create it in the project's Lanes UI`,
    }
  return { projectId: lanes[0]!.id }
}
function candidateContext(
  session: CrewImportWorld['sessions'][number],
): string {
  return `${session.providerId} · ${session.model ?? 'default model'} · ${stable(session.permissionConfig)}`
}
function roleDifferences(
  spec: CrewConfigRole,
  session: CrewImportWorld['sessions'][number],
): string[] {
  return [
    ...(spec.provider !== session.providerId ? ['provider'] : []),
    ...(spec.model !== session.model ? ['model'] : []),
    ...(spec.effort !== session.effort ? ['effort'] : []),
    ...(stable(
      typeof spec.permissions === 'string'
        ? { preset: spec.permissions }
        : spec.permissions,
    ) !== stable(session.permissionConfig)
      ? ['permissions']
      : []),
  ]
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(',')}}`
  return JSON.stringify(value)
}

/** The same wire translation is compared in the plan and handed to RelayService on apply. */
export function crewImportRelayFields(
  wire: CrewConfigWire,
  projectId: string | null,
) {
  const spawnSpec =
    typeof wire.to === 'string'
      ? null
      : {
          projectId,
          providerId: wire.to.spawn.provider,
          model: wire.to.spawn.model,
          effort: wire.to.spawn.effort,
          name: wire.to.spawn.name,
          providerAccountId: null,
        }
  return {
    action: spawnSpec ? ('spawn' as const) : ('hail' as const),
    spawnSpec,
    conditionToken: wire.when === 'settled' ? null : wire.when,
    opener:
      wire.opener === 'keep'
        ? null
        : wire.opener === 'clear'
          ? '/clear'
          : wire.opener.first,
    instruction: wire.instruction ?? null,
    armed: wire.armed !== false,
  }
}
function wireKey(wire: CrewConfigWire): string {
  return JSON.stringify([
    normalizedRoleReference(wire.from),
    typeof wire.to === 'string'
      ? ['role', normalizedRoleReference(wire.to)]
      : ['spawn', wire.to.spawn.name],
  ])
}

/** Invalid references remain unresolved; valid ones use the record's name law. */
export function normalizedRoleReference(reference: string): string | null {
  try {
    return normalizeCrewBatonName(reference)
  } catch {
    return null
  }
}

/** The preview and Phase B offer exactly the same model/effort operation. */
export function modelUpdateOffered(
  spec: CrewConfigRole,
  bound: CrewImportWorld['sessions'][number],
  differences: string[],
): boolean {
  return (
    spec.provider === bound.providerId &&
    differences.some((field) => field === 'model' || field === 'effort')
  )
}
