import type Database from 'better-sqlite3'
import { lstat, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { CrewService } from './crew.service'
import { RelayService } from '../relay/relay.service'
import { readGitOriginUrlAsync } from '../git/git-origin'
import { parseSessionPermissionConfig } from '../provider/session-permissions.pure'
import {
  crewToConfig,
  uncarriedRecipeNotes,
  renderCrewYaml,
  crewHomeCandidates,
  crewExportSlug,
} from './crew-config.pure'
import type { CrewConfigSession } from './crew-config.types'

export interface CrewExportOptions {
  includePositions?: boolean
}
interface ExportProject {
  id: string
  name: string
  repositoryPath: string
  laneOf: string | null
  laneName: string | null
}
/** Returns a destination approved by the native save/replace dialog, or null on cancel. */
export type ChooseCrewExportPath = (
  defaultPath: string,
) => Promise<string | null>

export type ChooseCrewHome = (
  projects: readonly Pick<ExportProject, 'id' | 'name'>[],
) => Promise<string | null>

/** Facade for snapshotting a crew and writing its recipe; the serializer never sees IO. */
export class CrewExportService {
  constructor(private db: Database.Database) {}
  async export(
    crewId: string,
    options: CrewExportOptions,
    choosePath: ChooseCrewExportPath,
    chooseHome?: ChooseCrewHome,
  ): Promise<{ path: string; yaml: string } | null> {
    const crew = new CrewService(this.db).getById(crewId)
    if (!crew) throw new Error('Crew not found')
    // Explicit projection: continuation tokens and provider accounts are never read.
    const rows = this.db
      .prepare(
        `SELECT s.id,s.name,s.provider_id AS providerId,s.model,s.effort,
      s.permission_config AS permissionConfig,s.project_id AS projectId,s.execution_host AS executionHost
      FROM sessions s JOIN session_crew_members m ON m.session_id=s.id WHERE m.crew_id=?`,
      )
      .all(crewId) as (Omit<CrewConfigSession, 'permissionConfig'> & {
      permissionConfig: string
    })[]
    const sessions = rows.map((row) => ({
      ...row,
      permissionConfig: parseSessionPermissionConfig(row.permissionConfig),
    }))
    const projects = this.db
      .prepare(
        'SELECT id,name,repository_path AS repositoryPath,lane_of AS laneOf,lane_name AS laneName FROM projects',
      )
      .all() as ExportProject[]
    const candidates = crewHomeCandidates(sessions, projects)
    let home = candidates.length === 1 ? candidates[0] : undefined
    if (!crew.lastExportPath && !home && candidates.length && chooseHome) {
      const chosen = await chooseHome(candidates)
      if (chosen === null) return null
      home = candidates.find((project) => project.id === chosen)
    }
    const defaultHomePath = home
      ? join(
          home.repositoryPath,
          '.convergence',
          'crews',
          `${crewExportSlug(crew.name)}.yaml`,
        )
      : null
    const defaultPath = crew.lastExportPath ?? defaultHomePath
    if (!defaultPath)
      throw new Error('Choose a home project to export this crew')
    const path = await choosePath(defaultPath)
    if (!path) return null
    const relays = new RelayService(this.db)
      .list()
      .filter((relay) => relay.crewId === crewId)
    const needed = new Set([
      ...sessions.map((s) => s.projectId),
      ...relays.map((r) => r.spawnSpec?.projectId),
    ])
    // Lanes are one level deep: LaneService.create refuses a lane of a lane;
    // deleting the root cascades to its lanes.
    for (const project of projects) {
      if (needed.has(project.id) && project.laneOf) needed.add(project.laneOf)
    }
    const exportProjects = await Promise.all(
      projects
        .filter((project) => needed.has(project.id))
        .map(async (project) => ({
          ...project,
          origin: project.laneOf
            ? null
            : await readGitOriginUrlAsync(project.repositoryPath),
        })),
    )
    const yaml = renderCrewYaml(
      crewToConfig(
        crew,
        crew.members,
        sessions,
        exportProjects,
        relays,
        options,
      ),
      uncarriedRecipeNotes(crew.members, relays),
    )
    // Keep the default recipe directory's symlink refusal. Other destinations
    // are explicitly selected in the native dialog; validate their parent too.
    const folders =
      path === defaultHomePath && home
        ? [join(home.repositoryPath, '.convergence'), dirname(path)]
        : [dirname(path)]
    for (const folder of folders) {
      await mkdir(folder, { recursive: true })
      const stat = await lstat(folder)
      if (stat.isSymbolicLink())
        throw new Error('Crew export refuses a symbolic link directory')
      if (!stat.isDirectory()) throw new Error('Crew export needs a directory')
    }
    const existing = await lstat(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
      return null
    })
    if (existing?.isSymbolicLink())
      throw new Error('Crew export refuses a symbolic link file')
    await writeFile(path, yaml, {
      encoding: 'utf8',
      // The native save dialog has already obtained replacement consent.
      flag: 'w',
    })
    new CrewService(this.db).recordExportPath(crewId, path)
    return { path, yaml }
  }
}
