import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { ProviderRegistry } from '../provider/provider-registry'
import { SessionService } from '../session/session.service'
import { CrewService } from './crew.service'
import { RelayService } from '../relay/relay.service'
import { CrewImportService } from './crew-import.service'
import { readGitOriginUrlAsync } from '../git/git-origin'
import type { CrewConfig } from './crew-config.types'
import type { CrewImportPlan } from './crew-import.types'

vi.mock('../git/git-origin', () => ({
  readGitOriginUrlAsync: vi.fn(async () => null),
}))
let root: string
let path: string
let sessions: SessionService
let crews: CrewService
let relays: RelayService
let service: CrewImportService
let config: CrewConfig
const decisions = (plan: CrewImportPlan) => ({
  revision: plan.revision,
  choices: {},
  updates: {},
  includeLayout: true,
})
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'crew-import-'))
  path = join(root, 'recipe.yaml')
  const db = getDatabase()
  db.prepare(
    "INSERT INTO projects(id,name,repository_path) VALUES ('root','Convergence',?)",
  ).run(root)
  db.prepare(
    "INSERT INTO projects(id,name,repository_path,lane_of,lane_name) VALUES ('lane','Studio',?,'root','studio')",
  ).run(join(root, 'lane'))
  vi.mocked(readGitOriginUrlAsync)
    .mockReset()
    .mockResolvedValue('git@github.com:marckraw/convergence.git')
  sessions = new SessionService(
    db,
    new LocalExecutionHost(new ProviderRegistry()),
    join(root, 'global'),
  )
  crews = new CrewService(db)
  relays = new RelayService(db)
  service = new CrewImportService(db, sessions, crews, relays)
  config = {
    version: 1,
    crew: 'Import test',
    emoji: '🧩',
    limits: { deliveriesPerRun: 12, attentionAfterMinutes: 30 },
    roles: {
      horse: {
        conversation: 'Horse',
        provider: 'codex',
        model: 'old-model',
        effort: 'high',
        permissions: 'ask',
        project: 'github.com/marckraw/convergence',
        lane: 'studio',
        host: 'local',
      },
      fable: {
        conversation: 'Fable',
        provider: 'codex',
        model: null,
        effort: null,
        permissions: 'yolo',
        project: null,
        host: 'local',
      },
    },
    wires: [
      {
        from: 'fable',
        to: 'horse',
        when: 'BATON: horse',
        opener: 'clear',
        instruction: 'Ride',
      },
    ],
    layout: { horse: [4, 8] },
  }
  await save()
})
afterEach(async () => {
  vi.restoreAllMocks()
  await sessions.disposeAll()
  closeDatabase()
  resetDatabase()
  await rm(root, { recursive: true, force: true })
})
async function save() {
  await writeFile(path, JSON.stringify(config))
}
function counts() {
  const db = getDatabase()
  return [
    'sessions',
    'session_crews',
    'session_crew_members',
    'session_relays',
  ].map(
    (t) =>
      (db.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n,
  )
}

it('applies through services, stamps the hash and is idempotent (mutations: skip stamp; always create relay)', async () => {
  const plan = await service.plan(path)
  const report = await service.apply(path, decisions(plan))
  const crew = crews.getById(report.crewId)!
  const horse = sessions.getAll().find((s) => s.name === 'Horse')!
  const stamp = getDatabase()
    .prepare(
      'SELECT config_path,config_sha256,config_applied_at FROM session_crews WHERE id=?',
    )
    .get(crew.id)
  expect({
    counts: counts(),
    project: horse.projectId,
    model: horse.model,
    permissions: horse.permissionConfig,
    member: crew.members.find((m) => m.sessionId === horse.id),
    wire: relays.list().map((r) => [r.conditionToken, r.opener, r.instruction]),
    stamp,
    reads: vi.mocked(readGitOriginUrlAsync).mock.calls,
  }).toEqual({
    counts: [2, 1, 2, 1],
    project: 'lane',
    model: 'old-model',
    permissions: { preset: 'ask' },
    member: { sessionId: horse.id, batonName: 'horse', canvasX: 4, canvasY: 8 },
    wire: [['BATON: horse', '/clear', 'Ride']],
    stamp: {
      config_path: path,
      config_sha256: createHash('sha256')
        .update(JSON.stringify(config))
        .digest('hex'),
      config_applied_at: expect.any(String),
    },
    reads: [[root], [root]],
  })
  const again = await service.plan(path)
  const second = await service.apply(path, decisions(again))
  expect({
    states: again.roles.map((r) => r.state),
    wire: again.wires[0]!.state,
    nothing: second.nothingToChange,
    counts: counts(),
  }).toEqual({
    states: ['bound', 'bound'],
    wire: 'existing',
    nothing: true,
    counts: [2, 1, 2, 1],
  })
})

it('rolls back Phase A after the first real session insert (mutation: remove outer transaction)', async () => {
  const original = sessions.create.bind(sessions)
  vi.spyOn(sessions, 'create').mockImplementation((input) => {
    original(input)
    throw new Error('interrupt after insert')
  })
  const plan = await service.plan(path)
  await expect(service.apply(path, decisions(plan))).rejects.toThrow(
    'interrupt after insert',
  )
  expect(counts()).toEqual([0, 0, 0, 0])
})

it('keeps Phase A when a running conversation refuses Phase B (mutation: report refusal as updated)', async () => {
  const horse = sessions.create({
    projectId: 'lane',
    workspaceId: null,
    providerId: 'codex',
    name: 'Horse',
    model: 'local-model',
    effort: 'high',
    permissionConfig: { preset: 'ask' },
  })
  getDatabase()
    .prepare("UPDATE sessions SET status='running' WHERE id=?")
    .run(horse.id)
  const plan = await service.plan(path)
  const report = await service.apply(path, decisions(plan))
  const next = await service.plan(path)
  expect({
    counts: counts(),
    outcome: report.entries.find((e) => e.key === 'role:horse'),
    model: sessions.getById(horse.id)!.model,
    next: next.roles.find((r) => r.role === 'horse')!.state,
    stamp: getDatabase().prepare('SELECT config_path FROM session_crews').get(),
  }).toEqual({
    counts: [2, 1, 2, 1],
    outcome: {
      key: 'role:horse',
      label: 'Horse',
      outcome: 'not updated',
      reason: expect.stringMatching(/running|turn|idle/i),
    },
    model: 'local-model',
    next: 'differs',
    stamp: { config_path: path },
  })
})

it('records the service model-change note after commit (mutation: raw UPDATE sessions)', async () => {
  const horse = sessions.create({
    projectId: 'lane',
    workspaceId: null,
    providerId: 'codex',
    name: 'Horse',
    model: 'local-model',
    effort: 'high',
    permissionConfig: { preset: 'ask' },
  })
  const original = sessions.setModelSelection.bind(sessions)
  const inTransaction: boolean[] = []
  vi.spyOn(sessions, 'setModelSelection').mockImplementation((id, input) => {
    inTransaction.push(getDatabase().inTransaction)
    return original(id, input)
  })
  const plan = await service.plan(path)
  const report = await service.apply(path, decisions(plan))
  expect({
    model: sessions.getById(horse.id)!.model,
    notes: sessions
      .getConversation(horse.id)
      .filter((i) => i.kind === 'note')
      .map((i) => i.text),
    outcome: report.entries.find((e) => e.key === 'role:horse')!.outcome,
    inTransaction,
  }).toEqual({
    model: 'old-model',
    notes: [expect.stringMatching(/local-model.*old-model/)],
    outcome: 'updated',
    inTransaction: [false],
  })
})

it('refuses stale files and decisions without writing (mutation: omit revision comparison)', async () => {
  const plan = await service.plan(path)
  config.roles.horse!.model = 'changed'
  await save()
  await expect(service.apply(path, decisions(plan))).rejects.toThrow(
    /changed.*plan|plan.*changed/i,
  )
  expect(counts()).toEqual([0, 0, 0, 0])
})

it('keeps omitted members and wires and respects update/layout opt-outs (mutation: update unchecked rows)', async () => {
  const initial = await service.plan(path)
  const first = await service.apply(path, decisions(initial))
  const local = sessions.create({
    contextKind: 'global',
    providerId: 'codex',
    name: 'Local only',
    model: null,
    effort: null,
  })
  crews.addMember(first.crewId, local.id)
  const oldWire = relays.create({
    crewId: first.crewId,
    sourceSessionId: local.id,
    action: 'hail',
    targetSessionId: crews.getById(first.crewId)!.sessionIds[0]!,
  })
  config.roles.horse!.model = 'file-model'
  config.wires[0]!.instruction = 'changed'
  config.limits.deliveriesPerRun = 20
  config.layout = { horse: [50, 50] }
  await save()
  const plan = await service.plan(path)
  const report = await service.apply(path, {
    ...decisions(plan),
    updates: { 'role:horse': false, 'wire:0': false, limits: false },
    includeLayout: false,
  })
  const horse = sessions.getAll().find((s) => s.name === 'Horse')!
  expect({
    kept: report.entries.filter((e) => e.outcome === 'kept').map((e) => e.key),
    model: horse.model,
    wire: relays.list().find((r) => r.id !== oldWire.id)!.instruction,
    limits: crews.getById(first.crewId)!.roundCap,
    position: crews
      .getById(first.crewId)!
      .members.find((m) => m.sessionId === horse.id)!.canvasX,
    counts: counts(),
  }).toEqual({
    kept: expect.arrayContaining([
      `member:${local.id}`,
      `relay:${oldWire.id}`,
      'role:horse',
      'wire:0',
      'limits',
    ]),
    model: 'old-model',
    wire: 'Ride',
    limits: 12,
    position: 4,
    counts: [3, 1, 3, 2],
  })
})

it('rejects a concurrent stale apply before it can duplicate records (mutation: omit in-transaction recheck)', async () => {
  const plan = await service.plan(path)
  const waiting: (() => void)[] = []
  vi.mocked(readGitOriginUrlAsync).mockImplementation(
    () =>
      new Promise((resolve) => {
        waiting.push(() => resolve('git@github.com:marckraw/convergence.git'))
        if (waiting.length === 2) waiting.forEach((release) => release())
      }),
  )
  const results = await Promise.allSettled([
    service.apply(path, decisions(plan)),
    service.apply(path, decisions(plan)),
  ])
  expect({
    outcomes: results.map((r) => r.status).sort(),
    counts: counts(),
  }).toEqual({ outcomes: ['fulfilled', 'rejected'], counts: [2, 1, 2, 1] })
})

it('materializes exported defaults without an effective limits change (mutation: keep inherited defaults)', async () => {
  const firstPlan = await service.plan(path)
  const first = await service.apply(path, decisions(firstPlan))
  crews.update(first.crewId, { roundCap: null, stallMinutes: null })
  const plan = await service.plan(path)
  const report = await service.apply(path, decisions(plan))
  const crew = crews.getById(first.crewId)!
  expect({
    state: plan.limits.state,
    roundCap: crew.roundCap,
    stallMinutes: crew.stallMinutes,
    nothing: report.nothingToChange,
  }).toEqual({
    state: 'existing',
    roundCap: 12,
    stallMinutes: 30,
    nothing: true,
  })
})

it('lets live activity reach the model guard without invalidating bindings (mutation: hash activity timestamps)', async () => {
  const horse = sessions.create({
    projectId: 'lane',
    workspaceId: null,
    providerId: 'codex',
    name: 'Horse',
    model: 'local-model',
    effort: 'high',
    permissionConfig: { preset: 'ask' },
  })
  const plan = await service.plan(path)
  getDatabase()
    .prepare(
      "UPDATE sessions SET status='running',updated_at='2099-01-01' WHERE id=?",
    )
    .run(horse.id)
  const report = await service.apply(path, decisions(plan))
  expect({
    counts: counts(),
    outcome: report.entries.find((e) => e.key === 'role:horse')!.outcome,
  }).toEqual({ counts: [2, 1, 2, 1], outcome: 'not updated' })
})
