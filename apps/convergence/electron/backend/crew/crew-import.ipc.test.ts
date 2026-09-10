import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { ProviderRegistry } from '../provider/provider-registry'
import { SessionService } from '../session/session.service'
import { CrewService } from './crew.service'
import { RelayService } from '../relay/relay.service'
import { CrewImportService } from './crew-import.service'
import { registerCrewImportIpc } from './crew-import.ipc'
import type {
  CrewImportDecisions,
  CrewImportPlan,
  CrewImportReport,
} from './crew-import.types'
const mocks = vi.hoisted(() => ({
  handlers: new Map<
    string,
    (
      event: unknown,
      path?: string,
      input?: unknown,
      updates?: unknown,
    ) => Promise<unknown>
  >(),
  parent: { id: 'parent' },
  choose: vi.fn(),
  broadcast: vi.fn(),
  broadcastWires: vi.fn(),
}))
vi.mock('electron', () => ({
  ipcMain: {
    handle: (
      key: string,
      handler: (
        event: unknown,
        path?: string,
        input?: unknown,
        updates?: unknown,
      ) => Promise<unknown>,
    ) => mocks.handlers.set(key, handler),
  },
  BrowserWindow: { fromWebContents: vi.fn(() => mocks.parent) },
  dialog: { showOpenDialog: mocks.choose },
}))
vi.mock('./crew.ipc', () => ({ broadcastCrews: mocks.broadcast }))
vi.mock('../relay/relay.ipc', () => ({ broadcastRelays: mocks.broadcastWires }))
vi.mock('../git/git-origin', () => ({
  readGitOriginUrlAsync: vi.fn(async () => null),
}))
let root: string
let path: string
let sessions: SessionService
let crews: CrewService
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'crew-import-ipc-'))
  path = join(root, 'crew.yml')
  const db = getDatabase()
  sessions = new SessionService(
    db,
    new LocalExecutionHost(new ProviderRegistry()),
    join(root, 'global'),
  )
  crews = new CrewService(db)
  await writeFile(
    path,
    JSON.stringify({
      version: 1,
      crew: 'IPC crew',
      emoji: null,
      limits: { deliveriesPerRun: 12, attentionAfterMinutes: 30 },
      roles: {
        horse: {
          conversation: 'Horse',
          provider: 'codex',
          model: null,
          effort: null,
          permissions: 'ask',
          project: null,
          host: 'local',
        },
      },
      wires: [],
    }),
  )
  mocks.handlers.clear()
  mocks.choose.mockReset()
  mocks.broadcast.mockReset()
  mocks.broadcastWires.mockReset()
  registerCrewImportIpc(
    new CrewImportService(db, sessions, crews, new RelayService(db)),
    crews,
    new RelayService(db),
  )
})
afterEach(async () => {
  await sessions.disposeAll()
  closeDatabase()
  resetDatabase()
  await rm(root, { recursive: true, force: true })
})
it('parents the YAML picker, plans and applies through both handlers, then broadcasts (mutation: omit broadcast)', async () => {
  mocks.choose.mockResolvedValue({ canceled: false, filePaths: [path] })
  const plan = (await mocks.handlers.get('crew:importPlan')!({
    sender: { id: 'sender' },
  })) as CrewImportPlan
  const input: CrewImportDecisions = {
    revision: plan.revision,
    choices: {},
    updates: {},
    includeLayout: false,
  }
  const report = (await mocks.handlers.get('crew:importApply')!(
    { sender: {} },
    path,
    input,
  )) as CrewImportReport
  expect({
    channels: [...mocks.handlers.keys()],
    picker: mocks.choose.mock.calls,
    states: plan.roles.map((r) => r.state),
    path: report.path,
    crews: crews.list().length,
    broadcast: mocks.broadcast.mock.calls,
    broadcastWires: mocks.broadcastWires.mock.calls,
  }).toEqual({
    channels: ['crew:importPlan', 'crew:importApply'],
    picker: [
      [
        mocks.parent,
        {
          properties: ['openFile'],
          filters: [{ name: 'Crew YAML', extensions: ['yaml', 'yml'] }],
        },
      ],
    ],
    states: ['create'],
    path,
    crews: 1,
    broadcast: [[crews.list()]],
    broadcastWires: [[[]]],
  })
})
it('cancel leaves the world alone (mutation: read a cancelled picker result)', async () => {
  mocks.choose.mockResolvedValue({ canceled: true, filePaths: [path] })
  expect(
    await mocks.handlers.get('crew:importPlan')!({ sender: {} }),
  ).toBeNull()
  expect(crews.list()).toEqual([])
})
it('replans a supplied path without another picker and refuses malformed YAML before writes (mutation: bypass reader)', async () => {
  await writeFile(path, 'version: 2')
  await expect(
    mocks.handlers.get('crew:importPlan')!({ sender: {} }, path, {}),
  ).rejects.toThrow('version:')
  expect({
    pickers: mocks.choose.mock.calls.length,
    crews: crews.list(),
  }).toEqual({ pickers: 0, crews: [] })
})

it('validates update decisions through the plan handler (mutation: drop IPC updates)', async () => {
  await expect(
    mocks.handlers.get('crew:importPlan')!(
      { sender: {} },
      path,
      {},
      { 'role:horse': 'false' },
    ),
  ).rejects.toThrow('Invalid import updates')
})
