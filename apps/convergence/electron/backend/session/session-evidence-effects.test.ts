import { afterEach, expect, it, vi } from 'vitest'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { ProviderRegistry } from '../provider/provider-registry'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { ProviderSessionEmitter } from '../provider/provider-session.emitter'
import type { SessionHandle } from '../provider/provider.types'
import { SessionService } from './session.service'
import { HarnessEvidenceService } from './harness-evidence.service'

const services: SessionService[] = []
afterEach(() => {
  for (const service of services.splice(0)) service.disposeAll()
  vi.restoreAllMocks()
  closeDatabase()
  resetDatabase()
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
