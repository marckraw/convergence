import { parse } from 'yaml'
import * as configPure from './crew-config.pure'
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
      options: { includePositions?: boolean },
    ) => Promise<{ path: string; yaml: string }>
  >(),
  choose: vi.fn(),
  save: vi.fn(),
  broadcast: vi.fn(),
}))
vi.mock('./crew.ipc', () => ({ broadcastCrews: mocks.broadcast }))
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
        options: { includePositions?: boolean },
      ) => Promise<{ path: string; yaml: string }>,
    ) => mocks.handlers.set(key, handler),
  },
  dialog: { showMessageBox: mocks.choose, showSaveDialog: mocks.save },
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
  mocks.save.mockReset().mockImplementation(async ({ defaultPath }) => ({
    canceled: false,
    filePath: defaultPath,
  }))
  mocks.broadcast.mockReset()
  mocks.handlers.clear()
  registerCrewExportIpc(new CrewExportService(db), new CrewService(db))
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

it('replaces an existing file only after native confirmation and includes positions (mutation: ignore dialog cancellation)', async () => {
  const handler = mocks.handlers.get('crew:export')!
  const first = await handler({}, crewId, {})
  new CrewService(getDatabase()).setMemberPosition(crewId, 's', { x: 1, y: 2 })
  mocks.save.mockResolvedValueOnce({ canceled: true, filePath: first.path })
  const cancelled = await handler({}, crewId, { includePositions: true })
  expect({ cancelled, bytes: await readFile(first.path, 'utf8') }).toEqual({
    cancelled: null,
    bytes: first.yaml,
  })
  const second = await handler({}, crewId, { includePositions: true })
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

it('defaults to the home path then remembers the chosen destination per crew (mutation: forget the path)', async () => {
  const chosen = join(root, 'elsewhere.yaml')
  mocks.save.mockResolvedValueOnce({ canceled: false, filePath: chosen })
  const handler = mocks.handlers.get('crew:export')!
  const first = await handler({}, crewId, {})
  const crew = new CrewService(getDatabase()).getById(crewId)
  await rm(chosen)
  const second = await handler({}, crewId, {})
  expect({
    defaults: mocks.save.mock.calls.map(([options]) => options.defaultPath),
    paths: [first.path, second.path],
    recorded: crew?.lastExportPath,
    broadcasts: mocks.broadcast.mock.calls.map(
      ([crews]) =>
        crews.find((crew: { id: string }) => crew.id === crewId)
          ?.lastExportPath,
    ),
    bytes: await readFile(chosen, 'utf8'),
  }).toEqual({
    defaults: [join(root, '.convergence', 'crews', 'night-shift.yaml'), chosen],
    paths: [chosen, chosen],
    recorded: chosen,
    broadcasts: [chosen, chosen],
    bytes: first.yaml,
  })
})

it.each([false, true])(
  'cancel changes no file, directory or crew fact (previous export: %s; mutation: write on cancel)',
  async (previous) => {
    const db = getDatabase()
    const path = join(root, 'chosen.yaml')
    if (previous) {
      mocks.save.mockResolvedValueOnce({ canceled: false, filePath: path })
      await mocks.handlers.get('crew:export')!({}, crewId, {})
    }
    const row = () =>
      db.prepare('SELECT * FROM session_crews WHERE id=?').get(crewId)
    const before = row()
    const files = await readdir(root)
    mocks.broadcast.mockClear()
    mocks.save.mockResolvedValueOnce({
      canceled: true,
      filePath: join(root, 'not-written.yaml'),
    })
    const result = await mocks.handlers.get('crew:export')!({}, crewId, {})
    expect({
      result,
      row: row(),
      files: await readdir(root),
      broadcasts: mocks.broadcast.mock.calls,
    }).toEqual({ result: null, row: before, files, broadcasts: [] })
  },
)

it('a failed write retains the last successful path and sends no broadcast (mutation: record before write)', async () => {
  const path = join(root, 'saved.yaml')
  mocks.save.mockResolvedValueOnce({ canceled: false, filePath: path })
  await mocks.handlers.get('crew:export')!({}, crewId, {})
  mocks.broadcast.mockClear()
  mocks.save.mockResolvedValueOnce({ canceled: false, filePath: root })
  await expect(
    mocks.handlers.get('crew:export')!({}, crewId, {}),
  ).rejects.toThrow()
  expect({
    path: new CrewService(getDatabase()).getById(crewId)?.lastExportPath,
    broadcasts: mocks.broadcast.mock.calls,
  }).toEqual({ path, broadcasts: [] })
})

it('writes the unchanged serializer output at the chosen destination (mutation: alter the bytes)', async () => {
  const serialize = vi.spyOn(configPure, 'renderCrewYaml')
  try {
    const chosen = join(root, 'portable.yaml')
    mocks.save.mockResolvedValueOnce({ canceled: false, filePath: chosen })
    const result = await mocks.handlers.get('crew:export')!({}, crewId, {})
    expect({
      calls: serialize.mock.calls.length,
      disk: await readFile(chosen, 'utf8'),
      returned: result.yaml,
    }).toEqual({
      calls: 1,
      disk: serialize.mock.results[0]?.value,
      returned: serialize.mock.results[0]?.value,
    })
  } finally {
    serialize.mockRestore()
  }
})
