import { afterEach, expect, it, vi } from 'vitest'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { ProviderRegistry } from '../provider/provider-registry'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { ProviderSessionEmitter } from '../provider/provider-session.emitter'
import type { SessionHandle } from '../provider/provider.types'
import { SessionService } from './session.service'
import { HarnessEvidenceService } from './harness-evidence.service'

const services: SessionService[] = []
afterEach(async () => {
  for (const service of services.splice(0)) {
    await service.disposeAll()
  }
  vi.restoreAllMocks()
  vi.useRealTimers()
  closeDatabase()
  resetDatabase()
})

it('R1 broadcasts evidence at most four times per second with persisted summary counts — mutation skip scheduling or broadcast each fact turns red', () => {
  vi.useFakeTimers()
  const { service, emitter } = bed()
  const events: string[] = []
  const summaries: unknown[] = []
  service.setEvidenceUpdateListener(({ sessionId }) => events.push(sessionId))
  service.setSummaryUpdateListener((summary) =>
    summaries.push(summary.parallelWork),
  )
  for (let n = 0; n < 10; n++)
    emitter.recordEvidence({
      kind: 'task.changed',
      taskId: 'monitor',
      at: 'now',
      patch: { status: 'running', taskType: 'monitor' },
    })
  const before = events.length
  for (let n = 0; n < 20; n++) {
    emitter.recordEvidence({
      kind: 'task.changed',
      taskId: 'monitor',
      at: 'now',
      patch: { status: 'running' },
    })
    vi.advanceTimersByTime(50)
  }
  emitter.recordEvidence({
    kind: 'task.changed',
    taskId: 'monitor',
    at: 'end',
    patch: { status: 'completed' },
  })
  vi.advanceTimersByTime(250)
  expect({
    before,
    events,
    summaries,
    final: service.getSummaryById('session')?.parallelWork,
  }).toEqual({
    before: 0,
    events: Array(5).fill('session'),
    summaries: [
      ...Array(4).fill({ running: 1, unknown: 0, failed: 0, stopped: 0 }),
      { running: 0, unknown: 0, failed: 0, stopped: 0 },
    ],
    final: { running: 0, unknown: 0, failed: 0, stopped: 0 },
  })
})
function bed() {
  const db = getDatabase()
  db.prepare(
    "INSERT INTO sessions(id,context_kind,provider_id,name,working_directory) VALUES ('session','global','claude-code','fixture','/tmp')",
  ).run()
  const service = new SessionService(
    db,
    new LocalExecutionHost(new ProviderRegistry()),
    '/tmp',
  )
  services.push(service)
  const source = { dispose: vi.fn(), stop: vi.fn() } as unknown as SessionHandle
  const emitter = new ProviderSessionEmitter({
    providerId: 'claude-code',
    emitDelta: (delta) => service['applyDelta']('session', delta, source),
  })
  return { db, service, source, emitter }
}
it('H1 ten progress links read no transcript and notify only newly affected items — mutation unconditional link return or full transcript walk turns red', () => {
  const { service, emitter } = bed()
  emitter.addToolCall({
    toolName: 'Agent',
    inputText: 'fixture',
    providerItemId: 'spawn',
  })
  const link = {
    kind: 'task.changed' as const,
    taskId: 'task',
    at: 'now',
    patch: { toolUseId: 'spawn', status: 'running' as const },
  }
  emitter.recordEvidence(link)
  const links = vi.spyOn(HarnessEvidenceService.prototype, 'apply')
  const reads = vi.spyOn(service, 'getConversation')
  const notify = vi.spyOn(
    service as unknown as { notifySessionChange: (...args: unknown[]) => void },
    'notifySessionChange',
  )
  for (let n = 0; n < 10; n++) emitter.recordEvidence(link)
  const progressNotifications = notify.mock.calls.length
  const second = emitter.addToolCall({
    toolName: 'Agent',
    inputText: 'second',
    providerItemId: 'spawn',
  })
  notify.mockClear()
  emitter.recordEvidence(link)
  expect({
    links: links.mock.results.slice(0, 10).map((result) => result.value),
    reads: reads.mock.calls.length,
    progressNotifications,
    patches: notify.mock.calls.map(
      (call) => (call[1] as { item: { id: string } }).item.id,
    ),
  }).toEqual({
    links: Array(10).fill(null),
    reads: 0,
    progressNotifications: 0,
    patches: [second],
  })
})
it('M3 unknown evidence leaves streaming patches pending — mutation unconditional evidence flush turns red', () => {
  const { service, emitter, db } = bed()
  const id = emitter.addAssistantMessage({ text: 'first', state: 'streaming' })
  emitter.patchMessage(id, { text: 'pending', state: 'streaming' })
  emitter.recordEvidence({
    kind: 'harness.unknown',
    type: 'system',
    subtype: 'thinking_tokens',
    payload: { count: 2 },
    at: 'now',
  })
  expect({
    pending: service['pendingConversationPatches'].size,
    stored: JSON.parse(
      (
        db
          .prepare(
            'SELECT payload_json FROM session_conversation_items WHERE id=?',
          )
          .get(id) as { payload_json: string }
      ).payload_json,
    ).text,
  }).toEqual({ pending: 1, stored: 'first' })
})
it('M4 superseded accounting cannot overwrite the new active turn — mutation remove evidence source guard turns red', () => {
  const { service, emitter, db, source } = bed()
  db.prepare(
    "INSERT INTO session_turns(id,session_id,sequence,started_at,status) VALUES ('new-turn','session',1,'now','running')",
  ).run()
  service['activeHandles'].set('session', {
    dispose: vi.fn(),
    stop: vi.fn(),
  } as unknown as SessionHandle)
  service['activeTurnIds'].set('session', 'new-turn')
  emitter.recordEvidence({
    kind: 'turn.accounting',
    resultSubtype: 'success',
    usage: { output_tokens: 99 },
    costUsd: 9,
    permissionDenials: [],
    subagentStats: { completed: 9 },
  })
  expect(
    db
      .prepare(
        "SELECT cost_usd,usage_json FROM session_turns WHERE id='new-turn'",
      )
      .get(),
  ).toEqual({ cost_usd: null, usage_json: null })
  service['activeHandles'].set('session', source)
})
it('L3 labels use one indexed agent read — mutation list all agent runs for a label turns red', () => {
  const { db, emitter } = bed()
  new HarnessEvidenceService(db).apply('session', null, {
    kind: 'agent.started',
    run: {
      id: 'agent',
      spawnedByItemId: 'call',
      agentType: 'Explore',
      description: 'Read fixture',
      model: null,
      depth: 1,
      startedAt: 'now',
      transcriptPath: null,
    },
  })
  const prepare = vi.spyOn(db, 'prepare')
  emitter.addToolCall({
    toolName: 'Read',
    inputText: 'fixture',
    agentRunId: 'agent',
  })
  const queries = prepare.mock.calls
    .map((call) => String(call[0]))
    .filter((sql) => /SELECT.*FROM session_agent_runs/s.test(sql))
  expect({
    count: queries.length,
    indexed: queries.every((sql) =>
      /WHERE session_id\s*=\s*\? AND id\s*=\s*\?/.test(sql),
    ),
  }).toEqual({ count: 1, indexed: true })
})

it('M6 streaming patches reuse counts until the coalesced evidence flush — mutation query counts per summary turns red', () => {
  vi.useFakeTimers()
  const { db, service, emitter } = bed()
  service.getSummaryById('session')
  const counts = vi.spyOn(HarnessEvidenceService.prototype, 'countParallelWork')
  const prepare = vi.spyOn(db, 'prepare')
  service.setSummaryUpdateListener(vi.fn())
  const textId = emitter.addAssistantMessage({ text: '', state: 'streaming' })
  emitter.recordEvidence({
    kind: 'task.changed',
    taskId: 'monitor',
    at: 'now',
    patch: { status: 'running', taskType: 'monitor' },
  })
  for (let i = 0; i < 20; i++)
    emitter.patchMessage(textId, { text: `${i}`, state: 'streaming' })
  vi.advanceTimersByTime(250)
  const summary = service.getSummaryById('session')
  expect({
    reads: counts.mock.calls.length,
    prepared: prepare.mock.calls.filter(([sql]) =>
      String(sql).includes('COUNT(*) AS count'),
    ).length,
    counts: summary?.parallelWork,
  }).toEqual({
    reads: 1,
    prepared: 0,
    counts: { running: 1, unknown: 0, failed: 0, stopped: 0 },
  })
})

it.each([false, true])(
  'T10 scoped Stop refuses unavailable capability or terminal row — mutation remove the corresponding refusal turns red (capable=%s)',
  async (capable) => {
    const { service, source, emitter } = bed()
    const stopTask = vi.fn().mockResolvedValue(undefined)
    service['activeHandles'].set('session', {
      ...source,
      canStopTasks: capable,
      stopTask,
    })
    emitter.recordEvidence({
      kind: 'task.changed',
      taskId: 'task',
      at: 'now',
      patch: {
        status: capable ? 'completed' : 'running',
        taskType: 'local_bash',
      },
    })
    let error: string | null = null
    try {
      await service.stopTask('session', 'task')
    } catch (failure) {
      error = (failure as Error).message
    }
    expect({ error, requests: stopTask.mock.calls }).toEqual({
      error: capable
        ? 'This task is not running'
        : 'Stop is not available on this Claude Code version',
      requests: [],
    })
  },
)

it('M6 deleting inside the coalescing window leaves no timer, cache or notification — mutation retain delete timer turns red', () => {
  vi.useFakeTimers()
  const { service, emitter } = bed()
  const notify = vi.fn()
  service.setEvidenceUpdateListener(notify)
  emitter.recordEvidence({
    kind: 'task.changed',
    taskId: 'task',
    at: 'now',
    patch: { status: 'running' },
  })
  const evidenceTimer = service['evidenceUpdateTimers'].get('session')
  const clear = vi.spyOn(globalThis, 'clearTimeout')
  service.delete('session')
  const timerAfterDelete = service['evidenceUpdateTimers'].has('session')
  const evidenceTimerCleared = clear.mock.calls.some(
    ([timer]) => timer === evidenceTimer,
  )
  vi.advanceTimersByTime(250)
  expect({
    timerAfterDelete,
    evidenceTimerCleared,
    cached: service['parallelWorkCounts'].has('session'),
    notifications: notify.mock.calls,
  }).toEqual({
    timerAfterDelete: false,
    evidenceTimerCleared: true,
    cached: false,
    notifications: [],
  })
})

it('M6 a scheduled flush whose row disappeared cannot recreate evidence state — mutation omit row-existence guard turns red', () => {
  vi.useFakeTimers()
  const { db, service, emitter } = bed()
  const notify = vi.fn()
  service.setEvidenceUpdateListener(notify)
  emitter.recordEvidence({
    kind: 'task.changed',
    taskId: 'task',
    at: 'now',
    patch: { status: 'running' },
  })
  db.prepare('DELETE FROM sessions WHERE id=?').run('session')
  vi.advanceTimersByTime(250)
  expect({
    cached: service['parallelWorkCounts'].has('session'),
    notifications: notify.mock.calls,
  }).toEqual({ cached: false, notifications: [] })
})

it('R8 L7 public disposal drains pending conversation patches — mutation omit dispose drain turns red', async () => {
  const { service, emitter } = bed()
  const id = emitter.addAssistantMessage({ text: 'first', state: 'streaming' })
  emitter.patchMessage(id, { text: 'last', state: 'streaming' })
  await service.disposeAll()
  expect({
    pending: service['pendingConversationPatches'].size,
    text: service.getConversation('session').find((item) => item.id === id),
  }).toMatchObject({ pending: 0, text: { text: 'last' } })
})

it('R3 typed facts share the existing 250ms flush — mutation skip evidence scheduling turns red', () => {
  vi.useFakeTimers()
  const { service, emitter } = bed(),
    events: unknown[] = []
  service.setEvidenceUpdateListener(() =>
    events.push(service.harnessFacts('session').compactions.length),
  )
  for (let n = 0; n < 3; n++)
    emitter.recordEvidence({
      kind: 'harness.compaction',
      trigger: 'manual',
      preTokens: 100,
      postTokens: 20,
      durationMs: 10,
      at: 'now',
    })
  const before = events.length
  vi.advanceTimersByTime(249)
  const early = events.length
  vi.advanceTimersByTime(1)
  expect({ before, early, events }).toEqual({
    before: 0,
    early: 0,
    events: [3],
  })
})
