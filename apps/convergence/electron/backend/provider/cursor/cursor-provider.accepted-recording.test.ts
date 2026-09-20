import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  closeDatabase,
  getDatabase,
  resetDatabase,
} from '../../database/database'
import { LocalExecutionHost } from '../execution-host/local-execution-host'
import { ProviderRegistry } from '../provider-registry'
import { SessionService } from '../../session/session.service'
import type { AcceptedRecordingFailureEvent } from '../../session/session.types'
import { CursorProvider } from './cursor-provider'
import {
  createMockCursorAcp,
  MockCursorAcpChild,
} from './cursor-acp-server.fixture'
import { CURSOR_ACP_RECORDED_UPDATE_TODOS_FULL_REQUEST } from './cursor-acp.recorded.fixture'

/**
 * Cursor accepted-recording boundary through SessionService (MAR-3143 / CP2).
 * TEMP TRIGGER shape matches MAR-3023's Claude door tests.
 */

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))
vi.mock('child_process', async (original) => ({
  ...(await original<typeof import('child_process')>()),
  spawn: spawnMock,
}))

let cleanup: (() => void) | undefined

afterEach(() => {
  cleanup?.()
  cleanup = undefined
  spawnMock.mockReset()
  closeDatabase()
  resetDatabase()
})

async function fixture(
  options: {
    holdPrompt?: boolean
    holdInitialize?: boolean
    permissionConfig?: { preset: 'yolo' | 'ask' | 'custom' }
  } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), 'cursor-recording-'))
  const child = new MockCursorAcpChild()
  spawnMock.mockReturnValue(child)
  const server = createMockCursorAcp(child, {
    holdPrompt: options.holdPrompt,
    holdInitialize: options.holdInitialize,
  })
  const db = getDatabase()
  const registry = new ProviderRegistry()
  registry.register(new CursorProvider('agent'))
  const service = new SessionService(db, new LocalExecutionHost(registry), dir)
  db.prepare(
    "INSERT INTO projects(id,name,repository_path) VALUES ('p','fixture',?)",
  ).run(dir)
  const session = service.create({
    projectId: 'p',
    workspaceId: null,
    providerId: 'cursor',
    model: null,
    effort: null,
    name: 'cursor-recording',
    ...(options.permissionConfig
      ? { permissionConfig: options.permissionConfig }
      : {}),
  })
  cleanup = () => {
    try {
      const handles = (
        service as unknown as {
          activeHandles: Map<string, { dispose: () => void }>
        }
      ).activeHandles
      handles.get(session.id)?.dispose()
    } catch {
      /* ignore */
    }
    rmSync(dir, { recursive: true, force: true })
  }
  return { service, session, child, server, dir }
}

/** Active provider handle for handle-layer assertions (MAR-3143 lap 2, C). */
function activeHandle(
  service: SessionService,
  sessionId: string,
): {
  stop: () => void
  approve: (id?: string) => void
  deny: (id?: string) => void
  dispose: () => void
} {
  const handle = (
    service as unknown as {
      activeHandles: Map<
        string,
        {
          stop: () => void
          approve: (id?: string) => void
          deny: (id?: string) => void
          dispose: () => void
        }
      >
    }
  ).activeHandles.get(sessionId)
  if (!handle) throw new Error(`No active handle for ${sessionId}`)
  return handle
}

function recordingFailedNotes(service: SessionService, sessionId: string) {
  return service
    .getConversation(sessionId)
    .filter(
      (item): item is Extract<typeof item, { kind: 'note' }> =>
        item.kind === 'note' &&
        item.providerMeta.providerEventType === 'recording-failed',
    )
}

describe('Cursor accepted-recording boundary (MAR-3143)', () => {
  it('door: a refused assistant insert mid-turn is announced and the run completes', async () => {
    const { service, session, server } = await fixture({ holdPrompt: true })
    const failures: AcceptedRecordingFailureEvent[] = []
    service.onAcceptedRecordingFailure((event) => failures.push(event))
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

    await service.start(session.id, { text: 'hi' })
    await vi.waitUntil(() =>
      server.requests.some((request) => request.method === 'session/prompt'),
    )

    getDatabase().exec(`CREATE TEMP TRIGGER refuse_assistant_reply
      BEFORE INSERT ON session_conversation_items
      WHEN NEW.kind = 'message'
           AND json_extract(NEW.payload_json, '$.actor') = 'assistant'
      BEGIN SELECT RAISE(ABORT, 'fixture reply refused'); END`)

    server.send({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'cursor-session-1',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'hello' },
        },
      },
    })
    server.resolveHeldPrompt({ stopReason: 'end_turn' })

    await vi.waitUntil(() => service.getById(session.id)?.status !== 'running')
    expect(service.getById(session.id)?.status).toBe('completed')
    expect(failures).toHaveLength(1)
    expect(recordingFailedNotes(service, session.id)).toHaveLength(1)
    expect(recordingFailedNotes(service, session.id)[0].text).toContain(
      'do not resend it',
    )
    getDatabase().exec('DROP TRIGGER refuse_assistant_reply')
    errors.mockRestore()
  })

  it('a refused user-message write before session/prompt is an honest failed send', async () => {
    const { service, session, server } = await fixture({ holdPrompt: true })
    const failures: AcceptedRecordingFailureEvent[] = []
    service.onAcceptedRecordingFailure((event) => failures.push(event))
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

    getDatabase().exec(`CREATE TEMP TRIGGER refuse_user_message
      BEFORE INSERT ON session_conversation_items
      WHEN NEW.kind = 'message'
           AND json_extract(NEW.payload_json, '$.actor') = 'user'
      BEGIN SELECT RAISE(ABORT, 'fixture user message refused'); END`)

    await service.start(session.id, { text: 'never accepted' })

    await vi.waitUntil(() => service.getById(session.id)?.status === 'failed')
    expect(server.requests.some((r) => r.method === 'session/prompt')).toBe(
      false,
    )
    expect(failures).toEqual([])
    expect(recordingFailedNotes(service, session.id)).toEqual([])
    getDatabase().exec('DROP TRIGGER refuse_user_message')
    errors.mockRestore()
  })

  it('auto-approve permission with a refused note still answers Cursor (no -32603)', async () => {
    const { service, session, server } = await fixture({
      holdPrompt: true,
      permissionConfig: { preset: 'yolo' },
    })
    const failures: AcceptedRecordingFailureEvent[] = []
    service.onAcceptedRecordingFailure((event) => failures.push(event))
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

    await service.start(session.id, { text: 'hi' })
    await vi.waitUntil(() =>
      server.requests.some((request) => request.method === 'session/prompt'),
    )

    getDatabase().exec(`CREATE TEMP TRIGGER refuse_permission_note
      BEFORE INSERT ON session_conversation_items
      WHEN NEW.kind = 'note'
           AND NEW.provider_event_type = 'session/request_permission'
      BEGIN SELECT RAISE(ABORT, 'fixture permission note refused'); END`)

    server.send({
      jsonrpc: '2.0',
      id: 77,
      method: 'session/request_permission',
      params: {
        sessionId: 'cursor-session-1',
        toolCall: { title: 'Run tests', kind: 'execute' },
        options: [{ optionId: 'allow-once', name: 'Allow once' }],
      },
    })

    await vi.waitUntil(() =>
      server.responses.some(
        (response) =>
          response.id === 77 &&
          (response.result as { outcome?: { optionId?: string } })?.outcome
            ?.optionId === 'allow-once',
      ),
    )
    expect(
      server.responses.find((response) => response.id === 77),
    ).not.toMatchObject({ error: expect.anything() })
    expect(
      failures.length + recordingFailedNotes(service, session.id).length,
    ).toBeGreaterThanOrEqual(1)

    server.resolveHeldPrompt({ stopReason: 'end_turn' })
    getDatabase().exec('DROP TRIGGER refuse_permission_note')
    errors.mockRestore()
  })

  it('a refused exit note still leaves the session failed', async () => {
    const { service, session, child, server } = await fixture({
      holdPrompt: true,
    })
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

    await service.start(session.id, { text: 'hi' })
    await vi.waitUntil(() =>
      server.requests.some((request) => request.method === 'session/prompt'),
    )

    getDatabase().exec(`CREATE TEMP TRIGGER refuse_exit_note
      BEFORE INSERT ON session_conversation_items
      WHEN NEW.kind = 'note'
           AND json_extract(NEW.payload_json, '$.text') LIKE 'Cursor ACP exited%'
      BEGIN SELECT RAISE(ABORT, 'fixture exit note refused'); END`)

    child.emit('exit', 1, null)

    await vi.waitUntil(() => service.getById(session.id)?.status === 'failed')
    expect(
      errors.mock.calls.some((call) =>
        String(call[0]).includes('Could not record the exit note'),
      ),
    ).toBe(true)
    getDatabase().exec('DROP TRIGGER refuse_exit_note')
    errors.mockRestore()
  })

  it('Stop with a refused status write still SIGTERMs the child', async () => {
    const { service, session, child, server } = await fixture({
      holdPrompt: true,
    })
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

    await service.start(session.id, { text: 'hi' })
    await vi.waitUntil(() =>
      server.requests.some((request) => request.method === 'session/prompt'),
    )

    getDatabase().exec(`CREATE TEMP TRIGGER refuse_status_patch
      BEFORE UPDATE ON sessions
      WHEN NEW.status = 'failed'
      BEGIN SELECT RAISE(ABORT, 'fixture status refused'); END`)

    // Assert at the handle layer (MAR-3143 lap 2, C): SessionService.stop
    // catches a throwing stop, so a kill spy alone cannot go red.
    expect(() => activeHandle(service, session.id).stop()).not.toThrow()

    await vi.waitUntil(() => child.kill.mock.calls.length > 0)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(
      errors.mock.calls.some((call) =>
        String(call[0]).includes('Could not record the failed status'),
      ),
    ).toBe(true)
    getDatabase().exec('DROP TRIGGER refuse_status_patch')
    errors.mockRestore()
  })

  it('a refused approval insert before any prompt still leaves approve able to answer Cursor', async () => {
    const { service, session, server } = await fixture({
      holdInitialize: true,
    })
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

    void service.start(session.id, { text: 'hi' })
    await vi.waitUntil(() =>
      server.requests.some((request) => request.method === 'initialize'),
    )
    expect(
      server.requests.some((request) => request.method === 'session/prompt'),
    ).toBe(false)

    getDatabase().exec(`CREATE TEMP TRIGGER refuse_approval_request
      BEFORE INSERT ON session_conversation_items
      WHEN NEW.kind = 'approval-request'
      BEGIN SELECT RAISE(ABORT, 'fixture approval refused'); END`)

    server.send({
      jsonrpc: '2.0',
      id: 55,
      method: 'session/request_permission',
      params: {
        sessionId: 'cursor-session-1',
        toolCall: { title: 'Run tests', kind: 'execute' },
        options: [{ optionId: 'allow-once', name: 'Allow once' }],
      },
    })

    await vi.waitUntil(
      () => service.getById(session.id)?.attention === 'needs-approval',
    )
    expect(
      errors.mock.calls.some((call) =>
        String(call[0]).includes('Could not record the approval request'),
      ),
    ).toBe(true)

    activeHandle(service, session.id).approve('55')

    await vi.waitUntil(() =>
      server.responses.some(
        (response) =>
          response.id === 55 &&
          (response.result as { outcome?: { optionId?: string } })?.outcome
            ?.optionId === 'allow-once',
      ),
    )
    expect(
      server.responses.find((response) => response.id === 55),
    ).not.toMatchObject({ error: expect.anything() })

    getDatabase().exec('DROP TRIGGER refuse_approval_request')
    server.resolveHeldInitialize()
    errors.mockRestore()
  })

  it('a refused passive note after endTurn still acknowledges Cursor', async () => {
    const { service, session, server } = await fixture({ holdPrompt: true })
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

    await service.start(session.id, { text: 'hi' })
    await vi.waitUntil(() =>
      server.requests.some((request) => request.method === 'session/prompt'),
    )
    server.resolveHeldPrompt({ stopReason: 'end_turn' })
    await vi.waitUntil(
      () => service.getById(session.id)?.status === 'completed',
    )

    getDatabase().exec(`CREATE TEMP TRIGGER refuse_task_note
      BEFORE INSERT ON session_conversation_items
      WHEN NEW.kind = 'note'
           AND NEW.provider_event_type = 'cursor/task'
      BEGIN SELECT RAISE(ABORT, 'fixture task note refused'); END`)

    server.send({
      jsonrpc: '2.0',
      id: 88,
      method: 'cursor/task',
      params: {
        toolCallId: 'call-task-1',
        description: 'Background task finished',
        agentId: 'agent-1',
        durationMs: 12,
      },
    })

    await vi.waitUntil(() =>
      server.responses.some(
        (response) =>
          response.id === 88 &&
          (response.result as { outcome?: { outcome?: string } })?.outcome
            ?.outcome === 'completed',
      ),
    )
    expect(
      server.responses.find((response) => response.id === 88),
    ).not.toMatchObject({ error: expect.anything() })
    expect(
      errors.mock.calls.some((call) =>
        String(call[0]).includes('Could not record the passive update note'),
      ),
    ).toBe(true)

    getDatabase().exec('DROP TRIGGER refuse_task_note')
    errors.mockRestore()
  })

  it('Stop mid-stream completes the buffered assistant item before the kill', async () => {
    const { service, session, child, server } = await fixture({
      holdPrompt: true,
    })

    await service.start(session.id, { text: 'hi' })
    await vi.waitUntil(() =>
      server.requests.some((request) => request.method === 'session/prompt'),
    )

    server.send({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'cursor-session-1',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'partial reply' },
        },
      },
    })

    await vi.waitUntil(() =>
      service
        .getConversation(session.id)
        .some(
          (item) =>
            item.kind === 'message' &&
            item.actor === 'assistant' &&
            item.state === 'streaming' &&
            item.text.includes('partial reply'),
        ),
    )

    activeHandle(service, session.id).stop()

    await vi.waitUntil(() => child.kill.mock.calls.length > 0)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    const assistant = service
      .getConversation(session.id)
      .find(
        (item): item is Extract<typeof item, { kind: 'message' }> =>
          item.kind === 'message' &&
          item.actor === 'assistant' &&
          item.text.includes('partial reply'),
      )
    expect(assistant?.state).toBe('complete')
  })

  it('Stop with a refused assistant flush still SIGTERMs the child', async () => {
    const { service, session, child, server } = await fixture({
      holdPrompt: true,
    })
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

    await service.start(session.id, { text: 'hi' })
    await vi.waitUntil(() =>
      server.requests.some((request) => request.method === 'session/prompt'),
    )

    server.send({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'cursor-session-1',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'will not flush' },
        },
      },
    })

    await vi.waitUntil(() =>
      service
        .getConversation(session.id)
        .some(
          (item) =>
            item.kind === 'message' &&
            item.actor === 'assistant' &&
            item.text.includes('will not flush'),
        ),
    )

    getDatabase().exec(`CREATE TEMP TRIGGER refuse_assistant_complete
      BEFORE UPDATE ON session_conversation_items
      WHEN NEW.kind = 'message'
           AND NEW.state = 'complete'
           AND json_extract(NEW.payload_json, '$.actor') = 'assistant'
      BEGIN SELECT RAISE(ABORT, 'fixture assistant flush refused'); END`)

    expect(() => activeHandle(service, session.id).stop()).not.toThrow()

    await vi.waitUntil(() => child.kill.mock.calls.length > 0)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(
      errors.mock.calls.some((call) =>
        String(call[0]).includes(
          'Could not record the flushed assistant buffer',
        ),
      ),
    ).toBe(true)
    getDatabase().exec('DROP TRIGGER refuse_assistant_complete')
    errors.mockRestore()
  })

  it('a late deny after the turn\u2019s end is a no-op', async () => {
    const { service, session, server } = await fixture({ holdPrompt: true })

    await service.start(session.id, { text: 'hi' })
    await vi.waitUntil(() =>
      server.requests.some((request) => request.method === 'session/prompt'),
    )

    server.send({
      jsonrpc: '2.0',
      id: 66,
      method: 'session/request_permission',
      params: {
        sessionId: 'cursor-session-1',
        toolCall: { title: 'Late deny', kind: 'execute' },
        options: [{ optionId: 'allow-once', name: 'Allow once' }],
      },
    })

    await vi.waitUntil(
      () => service.getById(session.id)?.attention === 'needs-approval',
    )

    server.resolveHeldPrompt({ stopReason: 'end_turn' })
    await vi.waitUntil(
      () => service.getById(session.id)?.status === 'completed',
    )

    const responsesFor66 = server.responses.filter((r) => r.id === 66)
    expect(responsesFor66).toHaveLength(1)
    expect(responsesFor66[0].result).toEqual({
      outcome: { outcome: 'cancelled' },
    })

    expect(() => activeHandle(service, session.id).deny('66')).not.toThrow()
    expect(server.responses.filter((r) => r.id === 66)).toHaveLength(1)
  })

  it('a refused attention clear from a mid-turn deny does not throw and is logged', async () => {
    const { service, session, server } = await fixture({ holdPrompt: true })
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

    await service.start(session.id, { text: 'hi' })
    await vi.waitUntil(() =>
      server.requests.some((request) => request.method === 'session/prompt'),
    )

    server.send({
      jsonrpc: '2.0',
      id: 66,
      method: 'session/request_permission',
      params: {
        sessionId: 'cursor-session-1',
        toolCall: { title: 'Mid-turn deny', kind: 'execute' },
        options: [{ optionId: 'allow-once', name: 'Allow once' }],
      },
    })

    await vi.waitUntil(
      () => service.getById(session.id)?.attention === 'needs-approval',
    )

    getDatabase().exec(`CREATE TEMP TRIGGER refuse_attention_none
      BEFORE UPDATE ON sessions
      WHEN NEW.attention = 'none'
      BEGIN SELECT RAISE(ABORT, 'fixture attention refused'); END`)

    expect(() => activeHandle(service, session.id).deny('66')).not.toThrow()
    expect(
      errors.mock.calls.some((call) =>
        String(call[0]).includes(
          'Accepted turn could not record session patch',
        ),
      ),
    ).toBe(true)
    await vi.waitUntil(() =>
      server.responses.some(
        (response) =>
          response.id === 66 &&
          (response.result as { outcome?: { optionId?: string } })?.outcome
            ?.optionId === 'reject-once',
      ),
    )

    getDatabase().exec('DROP TRIGGER refuse_attention_none')
    server.resolveHeldPrompt({ stopReason: 'end_turn' })
    await vi.waitUntil(
      () => service.getById(session.id)?.status === 'completed',
    )
    errors.mockRestore()
  })

  it('door: a refused passive notification note after endTurn is logged by the provider recorder (MAR-3152 R1)', async () => {
    const { service, session, server, child } = await fixture({
      holdPrompt: true,
    })
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

    await service.start(session.id, { text: 'hi' })
    await vi.waitUntil(() =>
      server.requests.some((request) => request.method === 'session/prompt'),
    )
    server.resolveHeldPrompt({ stopReason: 'end_turn' })
    await vi.waitUntil(
      () => service.getById(session.id)?.status === 'completed',
    )

    getDatabase().exec(`CREATE TEMP TRIGGER refuse_task_note_notification
      BEFORE INSERT ON session_conversation_items
      WHEN NEW.kind = 'note'
           AND NEW.provider_event_type = 'cursor/task'
      BEGIN SELECT RAISE(ABORT, 'fixture task note refused'); END`)

    // Notification — no id (the request-side door at :361 uses id: 88).
    server.send({
      jsonrpc: '2.0',
      method: 'cursor/task',
      params: {
        toolCallId: 'call-task-notify-1',
        description: 'Background task finished',
        agentId: 'agent-1',
        durationMs: 12,
      },
    })

    await vi.waitUntil(() =>
      errors.mock.calls.some((call) =>
        String(call[0]).includes('Could not record the passive update note'),
      ),
    )
    expect(
      errors.mock.calls.some((call) =>
        String(call[0]).includes('[cursor-acp] recording lost on notification'),
      ),
    ).toBe(false)
    expect(child.kill).not.toHaveBeenCalled()

    getDatabase().exec('DROP TRIGGER refuse_task_note_notification')

    // Next prompt still answers on the resident process.
    const promptsBefore = server.requests.filter(
      (request) => request.method === 'session/prompt',
    ).length
    await service.sendMessage(session.id, { text: 'again' })
    await vi.waitUntil(
      () =>
        server.requests.filter((request) => request.method === 'session/prompt')
          .length > promptsBefore,
    )
    server.resolveHeldPrompt({ stopReason: 'end_turn' })
    await vi.waitUntil(
      () => service.getById(session.id)?.status === 'completed',
    )
    expect(spawnMock).toHaveBeenCalledTimes(1)

    errors.mockRestore()
  })

  it('door: a refused passive notification note mid-turn is announced once (MAR-3152 R2)', async () => {
    const { service, session, server } = await fixture({ holdPrompt: true })
    const failures: AcceptedRecordingFailureEvent[] = []
    service.onAcceptedRecordingFailure((event) => failures.push(event))
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

    await service.start(session.id, { text: 'hi' })
    await vi.waitUntil(() =>
      server.requests.some((request) => request.method === 'session/prompt'),
    )

    getDatabase().exec(`CREATE TEMP TRIGGER refuse_task_note_mid_turn
      BEFORE INSERT ON session_conversation_items
      WHEN NEW.kind = 'note'
           AND NEW.provider_event_type = 'cursor/task'
      BEGIN SELECT RAISE(ABORT, 'fixture task note refused'); END`)

    server.send({
      jsonrpc: '2.0',
      method: 'cursor/task',
      params: {
        toolCallId: 'call-task-mid-1',
        description: 'Background task finished',
        agentId: 'agent-1',
        durationMs: 12,
      },
    })

    await vi.waitUntil(() => failures.length >= 1)
    expect(failures).toHaveLength(1)
    expect(recordingFailedNotes(service, session.id)).toHaveLength(1)

    getDatabase().exec('DROP TRIGGER refuse_task_note_mid_turn')
    server.resolveHeldPrompt({ stopReason: 'end_turn' })
    await vi.waitUntil(
      () => service.getById(session.id)?.status === 'completed',
    )
    expect(failures).toHaveLength(1)
    expect(recordingFailedNotes(service, session.id)).toHaveLength(1)

    errors.mockRestore()
  })

  it('door: a refused flush on the notification path is logged and the note still lands (MAR-3152 R3)', async () => {
    const { service, session, server } = await fixture({ holdPrompt: true })
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

    await service.start(session.id, { text: 'hi' })
    await vi.waitUntil(() =>
      server.requests.some((request) => request.method === 'session/prompt'),
    )
    server.resolveHeldPrompt({ stopReason: 'end_turn' })
    await vi.waitUntil(
      () => service.getById(session.id)?.status === 'completed',
    )

    // Late chunk after end_turn leaves a streaming assistant item to flush
    // outside acceptance (the path where recordTurnWrite logs, not announces).
    server.send({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'cursor-session-1',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'will not flush on notify' },
        },
      },
    })

    await vi.waitUntil(() =>
      service
        .getConversation(session.id)
        .some(
          (item) =>
            item.kind === 'message' &&
            item.actor === 'assistant' &&
            item.text.includes('will not flush on notify'),
        ),
    )

    getDatabase().exec(`CREATE TEMP TRIGGER refuse_assistant_complete_notify
      BEFORE UPDATE ON session_conversation_items
      WHEN NEW.kind = 'message'
           AND NEW.state = 'complete'
           AND json_extract(NEW.payload_json, '$.actor') = 'assistant'
      BEGIN SELECT RAISE(ABORT, 'fixture assistant flush refused'); END`)

    server.send({
      jsonrpc: '2.0',
      method: 'cursor/task',
      params: {
        toolCallId: 'call-task-flush-1',
        description: 'Background task finished',
        agentId: 'agent-1',
        durationMs: 12,
      },
    })

    await vi.waitUntil(() =>
      errors.mock.calls.some((call) =>
        String(call[0]).includes(
          'Could not record the flushed assistant buffer',
        ),
      ),
    )
    await vi.waitUntil(() =>
      service
        .getConversation(session.id)
        .some(
          (item) =>
            item.kind === 'note' &&
            item.providerMeta.providerEventType === 'cursor/task',
        ),
    )

    getDatabase().exec('DROP TRIGGER refuse_assistant_complete_notify')
    errors.mockRestore()
  })

  /**
   * MAR-3241 R4, the refused-note half: a `cursor/update_todos` note the
   * database refuses still leaves Cursor answered with today's
   * acknowledgement — never a -32603, never an unanswered id. Lives here
   * because this file owns the real SessionService + database + TEMP TRIGGER
   * apparatus a refused write needs.
   *
   * Mutation: delete `activeRpc.respond` from the `cursor/update_todos`
   * request branch → red.
   *
   * This test cannot witness R4's ORDER, and no refused write can: inside an
   * accepted turn `emitDelta` swallows the `RecordingError` and `announce()`
   * is itself all-catching (MAR-3023 R5), so the note write never throws back
   * and BOTH orders answer Cursor. The order is pinned on the artifacts in
   * `cursor-provider.todos.test.ts`.
   */
  it('MAR-3241 R4: a refused todo note still answers cursor/update_todos with today acknowledgement', async () => {
    const { service, session, server } = await fixture({ holdPrompt: true })
    const failures: AcceptedRecordingFailureEvent[] = []
    service.onAcceptedRecordingFailure((event) => failures.push(event))
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

    await service.start(session.id, { text: 'hi' })
    await vi.waitUntil(() =>
      server.requests.some((request) => request.method === 'session/prompt'),
    )

    getDatabase().exec(`CREATE TEMP TRIGGER refuse_todo_note
      BEFORE INSERT ON session_conversation_items
      WHEN NEW.kind = 'note'
           AND NEW.provider_event_type = 'cursor/update_todos'
      BEGIN SELECT RAISE(ABORT, 'fixture todo note refused'); END`)

    server.send({
      jsonrpc: '2.0',
      id: 91,
      method: 'cursor/update_todos',
      params: CURSOR_ACP_RECORDED_UPDATE_TODOS_FULL_REQUEST,
    })

    await vi.waitUntil(() =>
      server.responses.some((response) => response.id === 91),
    )
    const response = server.responses.find((response) => response.id === 91)
    expect(response).not.toMatchObject({ error: expect.anything() })
    // Byte-for-byte today's acknowledgement, written out rather than rebuilt
    // from the builder the production path uses.
    expect(response?.result).toEqual({
      outcome: {
        outcome: 'accepted',
        todos: CURSOR_ACP_RECORDED_UPDATE_TODOS_FULL_REQUEST.todos,
      },
    })
    // The note really was refused, so the acknowledgement above is the
    // answer of a turn whose local write failed.
    expect(
      failures.length + recordingFailedNotes(service, session.id).length,
    ).toBeGreaterThanOrEqual(1)

    server.resolveHeldPrompt({ stopReason: 'end_turn' })
    await vi.waitUntil(() => service.getById(session.id)?.status !== 'running')
    getDatabase().exec('DROP TRIGGER refuse_todo_note')
    errors.mockRestore()
  })
})
