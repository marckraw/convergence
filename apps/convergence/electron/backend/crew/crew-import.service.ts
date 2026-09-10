import { normalizeCrewBatonName } from './crew.pure'
import type Database from 'better-sqlite3'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import type { SessionService } from '../session/session.service'
import type { CreateSessionInput } from '../session/session.types'
import type { CrewService } from './crew.service'
import type { RelayService } from '../relay/relay.service'
import { ExecutionHostEndpointRepository } from '../execution-host-endpoint/execution-host-endpoint.repository'
import { readGitOriginUrlAsync } from '../git/git-origin'
import { parseSessionPermissionConfig } from '../provider/session-permissions.pure'
import { readCrewConfig } from './crew-config.pure'
import { planCrewImport, crewImportRelayFields } from './crew-import.pure'
import type {
  CrewImportWorld,
  CrewImportPlan,
  CrewImportDecisions,
  CrewImportReport,
} from './crew-import.types'
import type { CrewConfig } from './crew-config.types'

/** Application service: commit the synchronous reconciliation before asking the session service for guarded model changes. */
export class CrewImportService {
  constructor(
    private db: Database.Database,
    private sessions: SessionService,
    private crews: CrewService,
    private relays: RelayService,
  ) {}
  async plan(
    path: string,
    choices: Record<string, string> = {},
  ): Promise<CrewImportPlan> {
    requireRecord(choices, 'choices', 'string')
    return (await this.prepare(path, choices)).plan
  }
  async apply(
    path: string,
    decisions: CrewImportDecisions,
  ): Promise<CrewImportReport> {
    if (
      !decisions ||
      typeof decisions.revision !== 'string' ||
      typeof decisions.includeLayout !== 'boolean'
    )
      throw new Error('Invalid import decisions; reopen the plan')
    requireRecord(decisions.choices, 'choices', 'string')
    requireRecord(decisions.updates, 'updates', 'boolean')
    const { plan, config, hash, world } = await this.prepare(
      path,
      decisions.choices,
    )
    if (plan.revision !== decisions.revision)
      throw new Error('The file or local records changed; reopen the plan')
    const keys = new Set([
      'crew',
      'limits',
      ...plan.roles.map((r) => r.key),
      ...plan.wires.map((r) => r.key),
    ])
    if (
      Object.keys(decisions.updates).some((k) => !keys.has(k)) ||
      Object.keys(decisions.choices).some(
        (k) => !keys.has(k.replace(/:project$/, '')),
      )
    )
      throw new Error('Import decision keys changed; reopen the plan')
    if (!plan.canApply)
      throw new Error('Resolve every choose or missing row before applying')
    const report = this.db.transaction(() => {
      // Another import may finish while this request awaits file/origin IO.
      // Recheck the local snapshot under the same transaction that writes it.
      if (
        plan.revision !==
        importRevision(plan.path, hash, this.worldRecords(world.projects))
      )
        throw new Error('Local records changed; reopen the plan')
      return this.applyRecords(plan, config, hash, decisions)
    })()
    // Phase B is deliberately after commit: a running session may refuse a model
    // change while its new crew membership and the other rows have already landed.
    for (const role of plan.roles) {
      if (
        !role.sessionId ||
        !role.differences.some((f) => f === 'model' || f === 'effort') ||
        decisions.updates[role.key] === false
      )
        continue
      const spec = config.roles[role.role]!
      const bound = world.sessions.find((s) => s.id === role.sessionId)!
      if (spec.provider !== bound.providerId) continue
      const entry = report.entries.find((e) => e.key === role.key)!
      report.nothingToChange = false
      try {
        await this.sessions.setModelSelection(role.sessionId, {
          providerId: bound.providerId,
          model: spec.model,
          effort: spec.effort,
        })
        entry.outcome = 'updated'
        report.nothingToChange = false
      } catch (error) {
        entry.outcome = 'not updated'
        entry.reason = error instanceof Error ? error.message : String(error)
      }
    }
    return report
  }
  private applyRecords(
    plan: CrewImportPlan,
    config: CrewConfig,
    hash: string,
    decisions: CrewImportDecisions,
  ): CrewImportReport {
    const entries: CrewImportReport['entries'] = []
    let changed = false
    const ids = new Map<string, string>()
    for (const role of plan.roles) {
      let id = role.sessionId
      if (role.state === 'create') {
        const spec = config.roles[role.role]!
        const context =
          role.projectId === null
            ? { contextKind: 'global' as const }
            : {
                contextKind: 'project' as const,
                projectId: role.projectId,
                workspaceId: null,
              }
        id = this.sessions.create({
          ...context,
          providerId: spec.provider,
          model: spec.model,
          effort: spec.effort as CreateSessionInput['effort'],
          permissionConfig:
            typeof spec.permissions === 'string'
              ? { preset: spec.permissions }
              : spec.permissions,
          name: spec.conversation.trim(),
          executionHost: 'local',
        }).id
        changed = true
      }
      if (!id) throw new Error(`No conversation resolved for ${role.role}`)
      ids.set(role.role, id)
      entries.push({
        key: role.key,
        label: role.label,
        outcome:
          role.state === 'create'
            ? 'created'
            : role.canUpdate && decisions.updates[role.key] === false
              ? 'kept'
              : 'bound',
      })
    }
    let crew = plan.crew.id
      ? this.crews.getById(plan.crew.id)!
      : this.crews.create({
          name: config.crew,
          emoji: config.emoji,
          accentColor: config.color,
        })
    if (!plan.crew.id) changed = true
    const updateCrew = plan.crew.canUpdate && decisions.updates.crew !== false
    if (updateCrew) {
      crew = this.crews.update(crew.id, {
        emoji: config.emoji,
        accentColor: config.color ?? null,
      })
      changed = true
    }
    entries.push({
      key: 'crew',
      label: config.crew,
      outcome: !plan.crew.id
        ? 'created'
        : updateCrew
          ? 'updated'
          : plan.crew.canUpdate
            ? 'kept'
            : 'bound',
    })
    for (const role of plan.roles) {
      const id = ids.get(role.role)!
      const member = crew.members.find((m) => m.sessionId === id)
      const batonName = normalizeCrewBatonName(role.role)!
      if (!member) {
        this.crews.addMember(crew.id, id)
        changed = true
      }
      if (
        member?.batonName !== batonName &&
        (!member || decisions.updates[role.key] !== false)
      ) {
        this.crews.setMemberBatonName(crew.id, id, batonName)
        if (member) entries.find((e) => e.key === role.key)!.outcome = 'updated'
        changed = true
      }
      const position = config.layout?.[role.role]
      if (
        decisions.includeLayout &&
        position &&
        (member?.canvasX !== position[0] || member?.canvasY !== position[1])
      ) {
        this.crews.setMemberPosition(crew.id, id, {
          x: position[0],
          y: position[1],
        })
        changed = true
      }
    }
    for (const row of plan.wires) {
      const wire = config.wires[row.index]!
      const input = {
        ...crewImportRelayFields(wire, row.spawnProjectId),
        sourceSessionId: ids.get(wire.from)!,
        targetSessionId: typeof wire.to === 'string' ? ids.get(wire.to)! : null,
      }
      let outcome: CrewImportReport['entries'][number]['outcome'] = 'bound'
      if (!row.relayId) {
        this.relays.create({ crewId: crew.id, ...input })
        outcome = 'created'
        changed = true
      } else if (row.canUpdate && decisions.updates[row.key] !== false) {
        this.relays.update(row.relayId, input)
        outcome = 'updated'
        changed = true
      } else if (row.canUpdate) outcome = 'kept'
      entries.push({ key: row.key, label: row.label, outcome })
    }
    const updateLimits =
      !plan.crew.id ||
      (plan.limits.canUpdate && decisions.updates.limits !== false)
    // Equal inherited defaults become explicit recipe choices without an
    // effective value change, just as writing the provenance stamp does.
    const materializeDefaults =
      !plan.limits.canUpdate &&
      (crew.roundCap === null || crew.stallMinutes === null)
    if (updateLimits || materializeDefaults) {
      this.crews.update(crew.id, {
        roundCap: config.limits.deliveriesPerRun,
        stallMinutes: config.limits.attentionAfterMinutes,
      })
      if (updateLimits) changed = true
    }
    entries.push({
      key: 'limits',
      label: 'Limits',
      outcome: updateLimits
        ? 'updated'
        : plan.limits.canUpdate
          ? 'kept'
          : 'bound',
    })
    for (const kept of plan.kept)
      entries.push({ key: kept.key, label: kept.label, outcome: 'kept' })
    this.crews.stampConfig(crew.id, plan.path, hash)
    return {
      path: plan.path,
      crewId: crew.id,
      entries,
      nothingToChange: !changed,
    }
  }
  private async prepare(path: string, choices: Record<string, string>) {
    if (typeof path !== 'string' || !path.trim())
      throw new Error('Choose a crew YAML file')
    const absolutePath = resolve(path)
    const text = await readFile(absolutePath, 'utf8')
    const result = readCrewConfig(text)
    if (!result.ok) throw new Error(result.reason)
    const world = await this.world()
    const plan = planCrewImport(result.config, world, choices)
    const hash = digest(text)
    return {
      config: result.config,
      hash,
      world,
      plan: {
        ...plan,
        path: absolutePath,
        revision: importRevision(absolutePath, hash, world),
      },
    }
  }
  private async world(): Promise<CrewImportWorld> {
    const rows = this.db
      .prepare(
        'SELECT id,name,repository_path AS repositoryPath,lane_of AS laneOf,lane_name AS laneName FROM projects ORDER BY id',
      )
      .all() as {
      id: string
      name: string
      repositoryPath: string
      laneOf: string | null
      laneName: string | null
    }[]
    const projects = await Promise.all(
      rows.map(async (project) => ({
        ...project,
        origin: project.laneOf
          ? null
          : await readGitOriginUrlAsync(project.repositoryPath),
      })),
    )
    return this.worldRecords(projects)
  }
  private worldRecords(origins: CrewImportWorld['projects']): CrewImportWorld {
    const rows = this.db
      .prepare(
        'SELECT id,name,repository_path AS repositoryPath,lane_of AS laneOf,lane_name AS laneName FROM projects ORDER BY id',
      )
      .all() as {
      id: string
      name: string
      repositoryPath: string
      laneOf: string | null
      laneName: string | null
    }[]
    const projects = rows.map((project) => ({
      ...project,
      origin: origins.find((p) => p.id === project.id)?.origin ?? null,
    }))
    const sessions = this.db
      .prepare(
        'SELECT id,name,provider_id AS providerId,model,effort,permission_config AS permissionConfig,project_id AS projectId,execution_host AS executionHost,context_kind AS contextKind,updated_at AS lastActivity,archived_at AS archivedAt FROM sessions ORDER BY id',
      )
      .all() as (Omit<
      CrewImportWorld['sessions'][number],
      'permissionConfig'
    > & { permissionConfig: string })[]
    return {
      projects,
      sessions: sessions.map((row) => ({
        ...row,
        permissionConfig: parseSessionPermissionConfig(row.permissionConfig),
      })),
      endpointIds: new ExecutionHostEndpointRepository(this.db)
        .list()
        .map((e) => e.id),
      crews: this.crews.list(),
      relays: this.relays.list(),
    }
  }
}
function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
function requireRecord(
  value: unknown,
  label: string,
  type: 'string' | 'boolean',
): void {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.values(value).some((v) => typeof v !== type)
  )
    throw new Error(`Invalid import ${label}`)
}

// Activity is candidate context, not a binding decision. A running conversation
// must reach the session service's Phase B guard instead of invalidating Phase A.
function importRevision(
  path: string,
  hash: string,
  world: CrewImportWorld,
): string {
  return digest(
    JSON.stringify([path, hash, world], (key, value) =>
      key === 'lastActivity' ? undefined : value,
    ),
  )
}
