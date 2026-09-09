import { normalizeOriginKey } from '@mrck-labs/execution-host-protocol'
import { resolveRoundCap } from '../relay/relay.pure'
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
    const name =
      member.batonName ??
      sessions.find((s) => s.id === member.sessionId)?.name ??
      ''
    const key =
      member.batonName ??
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
    if (!key) throw new Error('A conversation needs a name before export')
    return key
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
