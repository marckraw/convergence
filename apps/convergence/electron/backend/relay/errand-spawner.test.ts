import { expect, it, vi } from 'vitest'
import { ErrandSpawner } from './errand-spawner'
import type { RelaySpawnSpec } from './relay.types'
const spec: RelaySpawnSpec = {
  executionHost: 'local',
  workAddress: null,
  roleCard: 'card',
  returnWire: { instruction: 'return' },
  projectId: 'wire-project',
  providerId: 'codex',
  model: 'gpt-5.5',
  effort: 'high',
  name: 'recipe · MAR-3186',
  member: 'recipe',
  providerAccountId: null,
}
function bench() {
  const sessions = {
    create: vi.fn(() => ({ id: 'spawn' })),
    start: vi.fn(async () => 'receipt'),
  }
  const crews = { addMember: vi.fn() }
  const relays = { create: vi.fn() }
  const accounts = {
    listByProvider: vi.fn(() => [
      { id: 'default', status: 'connected' as const, isDefault: true },
    ]),
  }
  const spawner = new ErrandSpawner({ sessions, crews, relays, accounts })
  return { spawner, sessions, crews, relays }
}
it('R3/R4 opens the recipe session, starts exactly the supplied brief, joins crew and arms its return wire', async () => {
  const b = bench()
  const onCreated = vi.fn(() => expect(b.sessions.start).not.toHaveBeenCalled())
  expect(
    await b.spawner.spawn(spec, 'exact auto-dispatch brief', {
      crewId: 'crew',
      returnTo: 'master',
      onCreated,
    }),
  ).toEqual({ sessionId: 'spawn', dispatchId: 'receipt', error: null })
  expect(b.sessions.create).toHaveBeenCalledWith({
    origin: 'spawn',
    contextKind: 'project',
    projectId: 'wire-project',
    workspaceId: null,
    providerId: 'codex',
    model: 'gpt-5.5',
    effort: 'high',
    name: 'recipe · MAR-3186',
  })
  expect(onCreated).toHaveBeenCalledWith('spawn')
  expect(b.sessions.start).toHaveBeenCalledWith('spawn', {
    text: 'exact auto-dispatch brief',
    providerAccountId: 'default',
  })
  expect(b.crews.addMember).toHaveBeenCalledWith('crew', 'spawn')
  expect(b.relays.create).toHaveBeenCalledWith({
    crewId: 'crew',
    sourceSessionId: 'spawn',
    targetSessionId: 'master',
    action: 'hail',
    conditionToken: null,
    instruction: 'return',
    armed: true,
  })
})
it('remote recipe host and address reach create without a local account', async () => {
  const b = bench()
  await b.spawner.spawn(
    { ...spec, executionHost: 'remote', providerAccountId: 'local-account' },
    'brief',
    { crewId: 'crew', returnTo: 'master' },
  )
  expect(b.sessions.create).toHaveBeenCalledWith(
    expect.objectContaining({ executionHost: 'remote', workAddress: null }),
  )
  expect(b.sessions.start).toHaveBeenCalledWith('spawn', {
    text: 'brief',
    providerAccountId: null,
  })
})
it('R6 distinguishes failed create, failed start, and failed return wire without losing created identity or receipt', async () => {
  const b = bench()
  b.sessions.create.mockImplementationOnce(() => {
    throw new Error('create')
  })
  expect(
    await b.spawner.spawn(spec, 'brief', {
      crewId: 'crew',
      returnTo: 'master',
    }),
  ).toMatchObject({
    sessionId: null,
    dispatchId: null,
    error: 'Could not open the session: create',
  })
  b.sessions.start.mockRejectedValueOnce(new Error('start'))
  expect(
    await b.spawner.spawn(spec, 'brief', {
      crewId: 'crew',
      returnTo: 'master',
    }),
  ).toMatchObject({
    sessionId: 'spawn',
    dispatchId: null,
    error: 'Opened the session but could not start it: start',
  })
  b.relays.create.mockImplementationOnce(() => {
    throw new Error('wire')
  })
  expect(
    await b.spawner.spawn(spec, 'brief', {
      crewId: 'crew',
      returnTo: 'master',
    }),
  ).toEqual({
    sessionId: 'spawn',
    dispatchId: 'receipt',
    error: 'Started the errand but could not draw its return wire: wire',
  })
})
