import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { ContextDrillService } from '../context-drill/context-drill.service'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import {
  buildClaudeDescriptor,
  buildFallbackCodexDescriptor,
} from '../provider/provider-descriptor.pure'
import { ProviderRegistry } from '../provider/provider-registry'
import { ShellProvider } from '../provider/shell/shell-provider'
import type { Provider, ProviderDescriptor } from '../provider/provider.types'
import { HandoffRefusedError } from '../provider/provider-account-handoff.pure'
import {
  describeFork,
  SessionForkService,
  type SessionForkDeps,
} from '../session/fork/session-fork.service'
import { SessionService } from '../session/session.service'
import type { SessionDispatchRegistry } from '../session/session-dispatch-registry'
import { ConversationActionsService } from './conversation-actions.service'

let dir: string
let sessions: SessionService
let service: ConversationActionsService
let providers: ProviderRegistry
let roles: string[]
let drill: ContextDrillService
let manageContext: ReturnType<
  typeof vi.fn<NonNullable<Provider['manageContext']>>
>
let start: ReturnType<typeof vi.fn<Provider['start']>>
let host: LocalExecutionHost

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'conversation-actions-'))
  const db = getDatabase()
  db.prepare(
    "INSERT INTO projects (id,name,repository_path) VALUES ('p','fixture',?)",
  ).run(dir)
  providers = new ProviderRegistry()
  manageContext = vi.fn<NonNullable<Provider['manageContext']>>()
  start = vi.fn<Provider['start']>(() => {
    throw new Error('A description must not start a provider')
  })
  for (const descriptor of [
    buildClaudeDescriptor(),
    buildFallbackCodexDescriptor(),
  ]) {
    register(descriptor)
  }
  providers.register(new ShellProvider())
  host = new LocalExecutionHost(providers)
  sessions = new SessionService(db, host, dir)
  roles = []
  drill = new ContextDrillService({
    sessions: {
      seatRolesOf: () => roles,
      describeCompactionReadiness: (id) =>
        sessions.describeCompactionReadiness(id),
      onSessionSettled: () => () => {},
      holdQueue: vi.fn(),
      releaseQueue: vi.fn(),
      sendDrillBeat: vi.fn(),
      compactContext: vi.fn(),
      getLastAssistantMessageText: () => null,
      addContextDrillNote: vi.fn(),
    },
  })
  service = new ConversationActionsService({
    sessions,
    drill,
    providers,
    localHost: host,
  })
})

function register(descriptor: ProviderDescriptor): void {
  providers.register({
    id: descriptor.id,
    name: descriptor.name,
    supportsContinuation: true,
    accountHandoff: descriptor.accountHandoff,
    describe: async () => descriptor,
    start,
    manageContext,
  })
}

afterEach(async () => {
  expect(start).not.toHaveBeenCalled()
  expect(manageContext).not.toHaveBeenCalled()
  await sessions.disposeAll()
  closeDatabase()
  resetDatabase()
  rmSync(dir, { recursive: true, force: true })
})

function create(providerId = 'codex', global = false): string {
  const id = sessions.create({
    ...(global
      ? { contextKind: 'global' as const }
      : { contextKind: 'project' as const, projectId: 'p', workspaceId: null }),
    providerId,
    name: 'Fixture',
    model: 'fixture',
    effort: null,
  }).id
  getDatabase()
    .prepare(
      "UPDATE sessions SET status='completed', continuation_token='thread-fixture' WHERE id=?",
    )
    .run(id)
  return id
}

describe('routine listing', () => {
  it.each([
    ['Claude project', 'claude-code', false, false, [], ['compact', 'fork']],
    [
      'Codex project',
      'codex',
      false,
      false,
      [],
      ['compact', 'fork', 'hand-off'],
    ],
    ['shell', 'shell', false, false, [], []],
    ['remote', 'codex', false, true, [], ['fork']],
    ['global chat', 'codex', true, false, [], ['compact', 'hand-off']],
    [
      'mastermind',
      'codex',
      false,
      false,
      ['mastermind'],
      ['drill', 'compact', 'fork', 'hand-off'],
    ],
    [
      'other-role seat',
      'codex',
      false,
      false,
      ['executor'],
      ['compact', 'fork', 'hand-off'],
    ],
  ] as const)(
    '%s lists only routines possible here',
    async (_name, provider, global, remote, seatRoles, expected) => {
      const id = create(provider, global)
      roles = [...seatRoles]
      if (remote)
        getDatabase()
          .prepare(
            "UPDATE sessions SET execution_host='remote-endpoint' WHERE id=?",
          )
          .run(id)
      const actions = await service.describe(id)
      expect(actions.map((action) => action.id)).toEqual(expected)
      expect(
        actions.every(
          (action) => action.offered && action.reason === undefined,
        ),
      ).toBe(true)
    },
  )

  it('requires both an advertised compact capability and host support', async () => {
    const id = create()
    vi.spyOn(host, 'capabilitiesFor').mockReturnValue({
      providerId: 'codex',
      name: 'Codex',
      supportsContinuation: true,
      supportsOneShot: false,
      supportsContextManagement: false,
    })
    expect((await service.describe(id)).map((action) => action.id)).toEqual([
      'fork',
      'hand-off',
    ])
    vi.restoreAllMocks()
    const descriptor = buildFallbackCodexDescriptor()
    descriptor.contextManagement = {
      compact: {
        availability: 'unavailable',
        method: 'unsupported',
        supportsInstructions: false,
      },
    }
    register(descriptor)
    expect((await service.describe(id)).map((action) => action.id)).toEqual([
      'fork',
      'hand-off',
    ])
  })

  it('rejects a missing session without claiming it has no actions', async () => {
    await expect(service.describe('gone')).rejects.toThrow(
      'Session not found: gone',
    )
  })
})

describe('the description is the refusal', () => {
  it.each(['shell', 'non-project'] as const)(
    'fork describes the exact %s run refusal',
    async (scenario) => {
      const id = create(
        scenario === 'shell' ? 'shell' : 'codex',
        scenario === 'non-project',
      )
      const parent = sessions.getSummaryById(id)!
      const result = describeFork(parent)
      expect(result.ready).toBe(false)
      if (result.ready) throw new Error('Expected fork refusal')
      const fork = new SessionForkService({ sessions } as SessionForkDeps)
      await expect(fork.previewSummary(id)).rejects.toMatchObject({
        message: result.reason,
      })
      expect(
        (await service.describe(id)).some((action) => action.id === 'fork'),
      ).toBe(false)
    },
  )

  it.each([
    'running',
    'pending approval',
    'pending input',
    'compacting',
    'dispatching',
  ] as const)(
    '%s quotes compact and hand-off guards; fork remains offered',
    async (scenario) => {
      const id = create()
      roles = ['mastermind']
      // Instrument transient in-memory states without starting a provider.
      const internals = sessions as unknown as {
        compactingSessions: Set<string>
        dispatches: SessionDispatchRegistry
      }
      if (scenario === 'running')
        getDatabase()
          .prepare("UPDATE sessions SET status='running' WHERE id=?")
          .run(id)
      if (scenario === 'pending approval' || scenario === 'pending input')
        getDatabase()
          .prepare('UPDATE sessions SET attention=? WHERE id=?')
          .run(
            scenario === 'pending approval' ? 'needs-approval' : 'needs-input',
            id,
          )
      if (scenario === 'compacting') internals.compactingSessions.add(id)
      if (scenario === 'dispatching') internals.dispatches.begin(id)
      const actions = await service.describe(id)
      const compact = actions.find((action) => action.id === 'compact')!
      expect(compact.offered).toBe(false)
      await expect(sessions.compactContext(id)).rejects.toMatchObject({
        message: compact.reason,
      })
      expect(actions.find((action) => action.id === 'drill')).toMatchObject({
        offered: false,
        reason: compact.reason,
      })
      await expect(drill.run(id)).resolves.toMatchObject({
        ok: false,
        reason: compact.reason,
      })
      expect(actions.find((action) => action.id === 'fork')).toMatchObject({
        offered: true,
      })
      const handoff = actions.find((action) => action.id === 'hand-off')!
      expect(handoff.offered).toBe(false)
      const error = await sessions
        .sendMessage(id, {
          text: 'next',
          providerAccountId: 'other-account',
          deliveryMode: 'steer',
        })
        .catch((error: unknown) => error)
      expect(error).toBeInstanceOf(Error)
      if (!(error instanceof Error)) throw new Error('Expected send refusal')
      expect(handoff.reason).toBe(
        error instanceof HandoffRefusedError
          ? (error.rule ?? error.message)
          : error.message,
      )
      expect(handoff.reason).not.toContain('not sent')
      if (scenario !== 'compacting') {
        expect(error.message).toBe(
          'Wait for this conversation and its pending requests to settle before switching accounts. Your message was not sent.',
        )
      }
      internals.compactingSessions.clear()
    },
  )

  it('remote compact describes the exact run refusal even though it is not listed', async () => {
    const id = create()
    getDatabase()
      .prepare(
        "UPDATE sessions SET execution_host='remote-endpoint' WHERE id=?",
      )
      .run(id)
    const result = sessions.describeCompactionReadiness(id)
    expect(result.ready).toBe(false)
    if (result.ready) throw new Error('Expected remote refusal')
    await expect(sessions.compactContext(id)).rejects.toMatchObject({
      message: result.reason,
    })
    roles = ['mastermind']
    const actions = await service.describe(id)
    expect(actions.map((action) => action.id)).toEqual(['drill', 'fork'])
    expect(actions[0]).toMatchObject({ offered: false, reason: result.reason })
    await expect(drill.run(id)).resolves.toMatchObject({
      ok: false,
      reason: result.reason,
    })
  })
})
