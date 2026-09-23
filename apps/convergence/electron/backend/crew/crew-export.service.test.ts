import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { CrewService } from './crew.service'
import { CrewExportService } from './crew-export.service'
import { readCrewConfig } from './crew-config.pure'
import type { CrewTrackerLookup } from './crew-config.types'

vi.mock('../git/git-origin', () => ({
  readGitOriginUrlAsync: vi.fn(async () => null),
}))

/**
 * What export writes about the tracker (MAR-3211): the id always, the name
 * only when the crew's own key answered with the bound id.
 */
const PROJECT_ID = '6851238a-0000-4000-8000-000000000000'
let root: string
let crewId: string
let crews: CrewService
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'crew-export-tracker-'))
  const db = getDatabase()
  db.prepare(
    "INSERT INTO projects (id,name,repository_path) VALUES ('p','Home',?)",
  ).run(root)
  db.prepare(
    "INSERT INTO sessions (id,project_id,provider_id,name,working_directory) VALUES ('s','p','codex','Horse',?)",
  ).run(root)
  crews = new CrewService(db)
  crewId = crews.create({ name: 'Night shift', sessionIds: ['s'] }).id
})
afterEach(async () => {
  closeDatabase()
  resetDatabase()
  await rm(root, { recursive: true, force: true })
})

async function exportWith(lookup: CrewTrackerLookup) {
  const result = await new CrewExportService(getDatabase(), lookup).export(
    crewId,
    {},
    async () => join(root, 'crew.yaml'),
  )
  const read = readCrewConfig(result!.yaml)
  if (!read.ok) throw new Error(read.reason)
  return { yaml: result!.yaml, tracker: read.config.tracker }
}
const resolved = (id: string) => ({
  kind: 'resolved' as const,
  project: { id, name: 'convergence', url: 'https://linear.app/p' },
})

it('writes the name the key answered beside the bound id, asking by crew and id (ruling A; mutation: skip the lookup)', async () => {
  crews.setTrackerBinding(crewId, { projectId: PROJECT_ID })
  const lookup = vi.fn<CrewTrackerLookup>(async (_crew, id) => resolved(id))
  const { tracker } = await exportWith(lookup)
  expect({ tracker, calls: lookup.mock.calls }).toEqual({
    tracker: {
      kind: 'linear',
      project: PROJECT_ID,
      projectName: 'convergence',
      labelPrefix: 'horse:',
      wavePrefix: 'wave:',
      statusMap: crews.getById(crewId)!.trackerBinding!.statusMap,
      autoDispatch: false,
    },
    calls: [[crewId, PROJECT_ID]],
  })
})

const quietLookups: [string, CrewTrackerLookup][] = [
  ['no key', async () => null],
  ['another project', async () => resolved('another-project')],
  [
    'a refusal',
    async () => ({
      kind: 'refused' as const,
      refusal: {
        kind: 'unreachable' as const,
        message: 'offline',
        retryAt: null,
      },
    }),
  ],
  [
    'a throw',
    async () => {
      throw new Error('keychain locked')
    },
  ],
]
it.each(quietLookups)(
  'writes the id alone on %s, and still exports (ruling A; mutation: trust any resolved name)',
  async (_case, lookup) => {
    crews.setTrackerBinding(crewId, { projectId: PROJECT_ID })
    const { tracker } = await exportWith(lookup)
    expect({
      project: tracker?.project,
      hasName: tracker ? Object.hasOwn(tracker, 'projectName') : null,
    }).toEqual({ project: PROJECT_ID, hasName: false })
  },
)

it('writes no block and asks nothing for an unbound crew (R5; mutation: always render the block)', async () => {
  const lookup = vi.fn<CrewTrackerLookup>(async () => null)
  const { yaml, tracker } = await exportWith(lookup)
  expect({
    trackerLine: yaml.split('\n').some((line) => line.startsWith('tracker')),
    tracker,
    calls: lookup.mock.calls.length,
  }).toEqual({ trackerLine: false, tracker: undefined, calls: 0 })
})
