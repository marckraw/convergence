import { parse } from 'yaml'
import { readGitOriginUrlAsync } from '../git/git-origin'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { CrewService } from './crew.service'
import { CrewExportService } from './crew-export.service'
import { registerCrewExportIpc } from './crew-export.ipc'

const mocks = vi.hoisted(() => ({
  handlers: new Map<
    string,
    (
      event: unknown,
      crewId: string,
      options: { force?: boolean; includePositions?: boolean },
    ) => Promise<{ path: string; yaml: string }>
  >(),
  choose: vi.fn(),
}))
vi.mock('../git/git-origin', () => ({
  readGitOriginUrlAsync: vi.fn(async () => null),
}))
vi.mock('electron', () => ({
  ipcMain: {
    handle: (
      key: string,
      handler: (
        event: unknown,
        crewId: string,
        options: { force?: boolean; includePositions?: boolean },
      ) => Promise<{ path: string; yaml: string }>,
    ) => mocks.handlers.set(key, handler),
  },
  dialog: { showMessageBox: mocks.choose },
}))
let root: string
let crewId: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'crew-export-'))
  const db = getDatabase()
  db.prepare(
    "INSERT INTO projects (id,name,repository_path) VALUES ('p','Home',?)",
  ).run(root)
  db.prepare(
    "INSERT INTO sessions (id,project_id,provider_id,name,working_directory) VALUES ('s','p','codex','Horse',?)",
  ).run(root)
  crewId = new CrewService(db).create({
    name: 'Night shift',
    sessionIds: ['s'],
  }).id
  vi.mocked(readGitOriginUrlAsync).mockReset().mockResolvedValue(null)
  mocks.choose.mockReset()
  mocks.handlers.clear()
  registerCrewExportIpc(new CrewExportService(db))
})
afterEach(async () => {
  closeDatabase()
  resetDatabase()
  await rm(root, { recursive: true, force: true })
})

it('writes exactly the returned YAML at the home-project path (mutation: skip disk write)', async () => {
  const handler = mocks.handlers.get('crew:export')
  if (!handler) throw new Error('crew:export is not registered')
  const result = await handler({}, crewId, {})
  const folder = join(root, '.convergence', 'crews')
  expect({
    path: result.path,
    files: await readdir(folder),
    matches: (await readFile(result.path, 'utf8')) === result.yaml,
  }).toEqual({
    path: join(folder, 'night-shift.yaml'),
    files: ['night-shift.yaml'],
    matches: true,
  })
})

it('refuses an existing file without force and preserves its contents (mutation: use w instead of wx)', async () => {
  const handler = mocks.handlers.get('crew:export')!
  const first = await handler({}, crewId, {})
  new CrewService(getDatabase()).update(crewId, { emoji: '🧩' })
  let refused = false
  try {
    await handler({}, crewId, {})
  } catch (error) {
    refused = String(error).includes('EEXIST')
  }
  expect({
    refused,
    preserved: (await readFile(first.path, 'utf8')) === first.yaml,
  }).toEqual({ refused: true, preserved: true })
})

it('replaces only with explicit force and includes requested positions (mutation: ignore force)', async () => {
  const handler = mocks.handlers.get('crew:export')!
  const first = await handler({}, crewId, {})
  new CrewService(getDatabase()).setMemberPosition(crewId, 's', { x: 1, y: 2 })
  const second = await handler({}, crewId, {
    force: true,
    includePositions: true,
  })
  expect({
    changed: second.yaml !== first.yaml,
    stored: (await readFile(second.path, 'utf8')) === second.yaml,
    layout: second.yaml.includes('layout:'),
  }).toEqual({ changed: true, stored: true, layout: true })
})

it('asks before choosing between tied home projects (mutation: choose first project)', async () => {
  const second = join(root, 'other')
  await mkdir(second)
  const db = getDatabase()
  db.prepare(
    "INSERT INTO projects (id,name,repository_path) VALUES ('p2','Other',?)",
  ).run(second)
  db.prepare(
    "INSERT INTO sessions (id,project_id,provider_id,name,working_directory) VALUES ('s2','p2','codex','Other horse',?)",
  ).run(second)
  new CrewService(db).addMember(crewId, 's2')
  mocks.choose.mockResolvedValueOnce({ response: 2 })
  const result = await mocks.handlers.get('crew:export')!({}, crewId, {})
  expect({ asked: mocks.choose.mock.calls.length, path: result.path }).toEqual({
    asked: 1,
    path: join(second, '.convergence', 'crews', 'night-shift.yaml'),
  })
})

it('refuses a symlinked export directory (mutation: follow directory symlink)', async () => {
  const outside = join(root, 'outside')
  await mkdir(outside)
  await symlink(outside, join(root, '.convergence'))
  let refused = false
  try {
    await mocks.handlers.get('crew:export')!({}, crewId, {})
  } catch (error) {
    refused = String(error).includes('symbolic link')
  }
  expect({ refused, files: await readdir(outside) }).toEqual({
    refused: true,
    files: [],
  })
})

it('reads the root origin through the shared reader for a lane-only crew (mutations: omit root row; bypass shared reader)', async () => {
  const lane = join(root, 'studio')
  await mkdir(lane)
  const db = getDatabase()
  db.prepare(
    "INSERT INTO projects (id,name,repository_path,lane_of,lane_name) VALUES ('lane','Home · lane: studio',?,'p','studio')",
  ).run(lane)
  db.prepare("UPDATE sessions SET project_id='lane' WHERE id='s'").run()
  vi.mocked(readGitOriginUrlAsync).mockImplementation(async (path) =>
    path === root ? 'git@github.com:marckraw/convergence.git' : null,
  )
  const result = await mocks.handlers.get('crew:export')!({}, crewId, {})
  const role = parse(await readFile(result.path, 'utf8')).roles.horse
  expect({
    project: role.project,
    lane: role.lane,
    reads: vi.mocked(readGitOriginUrlAsync).mock.calls,
  }).toEqual({
    project: 'github.com/marckraw/convergence',
    lane: 'studio',
    reads: [[root]],
  })
})
