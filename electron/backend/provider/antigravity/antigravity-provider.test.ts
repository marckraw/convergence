import { EventEmitter } from 'events'
import { writeFile } from 'fs/promises'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionDelta } from '../../session/conversation-item.types'
import { AntigravityProvider } from './antigravity-provider'
import type { AntigravityTrajectoryToolEvent } from './antigravity-trajectory.pure'
import type { AntigravityTrajectoryTelemetry } from './antigravity-trajectory.service'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))

vi.mock('child_process', () => ({
  spawn: spawnMock,
}))

class MockChildProcess extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  killed = false

  kill = vi.fn((_signal?: NodeJS.Signals) => {
    this.killed = true
    return true
  })
}

class MockSettingsService {
  patches: Array<{
    modelLabel?: string | null
    statusLineCommand?: string | null
  }> = []

  async withTemporarySettings<T>(
    patch: {
      modelLabel?: string | null
      statusLineCommand?: string | null
    },
    operation: () => Promise<T>,
  ): Promise<T> {
    this.patches.push(patch)
    return operation()
  }
}

class MockTrajectoryTelemetry implements AntigravityTrajectoryTelemetry {
  maxStepIndex: number | null = null
  fallbackConversationId: string | null = null
  events: AntigravityTrajectoryToolEvent[] = []
  getMaxStepIndex = vi.fn(async () => this.maxStepIndex)
  findLatestConversationIdUpdatedAfter = vi.fn(
    async () => this.fallbackConversationId,
  )
  readToolEvents = vi.fn(async () => this.events)
}

function captureStatusPath(command: string | null | undefined): string {
  if (!command) throw new Error('missing status command')
  const prefix = 'CONVERGENCE_ANTIGRAVITY_STATUS_FILE='
  const index = command.indexOf(prefix)
  if (index < 0) throw new Error(`bad command: ${command}`)
  const rest = command.slice(index + prefix.length)
  if (!rest.startsWith("'")) throw new Error(`unquoted command: ${command}`)
  const end = rest.indexOf("' ", 1)
  if (end < 0) throw new Error(`unterminated command: ${command}`)
  return rest.slice(1, end)
}

function collectDeltas(provider: AntigravityProvider) {
  const handle = provider.start({
    sessionId: 'session-1',
    workingDirectory: '/tmp',
    initialMessage: 'hello',
    model: 'gemini-3.1-pro',
    effort: 'high',
    continuationToken: null,
    previousAssistantTexts: ['old answer'],
  })
  const deltas: SessionDelta[] = []
  handle.onDelta((delta) => deltas.push(delta))
  return { handle, deltas }
}

async function waitFor(assertion: () => void): Promise<void> {
  let lastError: unknown
  for (let index = 0; index < 100; index += 1) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

afterEach(() => {
  spawnMock.mockReset()
  vi.restoreAllMocks()
})

describe('AntigravityProvider', () => {
  it('exposes the expected identity and descriptor', async () => {
    const provider = new AntigravityProvider('/usr/local/bin/agy')

    expect(provider.id).toBe('antigravity')
    expect(provider.name).toBe('Antigravity CLI')
    expect(provider.supportsContinuation).toBe(true)

    const descriptor = await provider.describe()
    expect(descriptor.id).toBe('antigravity')
    expect(descriptor.vendorLabel).toBe('Google')
    expect(descriptor.defaultModelId).toBe('gemini-3.5-flash')
    expect(descriptor.modelOptions.map((option) => option.id)).toContain(
      'gemini-3.1-pro',
    )
  })

  it('runs oneShot through temporary model settings and print mode', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)
    const settings = new MockSettingsService()
    const provider = new AntigravityProvider(
      '/usr/local/bin/agy',
      null,
      undefined,
      settings,
    )

    const promise = provider.oneShot({
      prompt: 'summarize',
      modelId: 'gemini-3.1-pro',
      effort: 'low',
      workingDirectory: '/tmp/project',
      timeoutMs: 1000,
      permissionConfig: { preset: 'yolo' },
    })

    child.stdout.write('done')
    child.stdout.end()
    child.emit('exit', 0)

    await expect(promise).resolves.toEqual({ text: 'done' })
    expect(settings.patches[0]?.modelLabel).toBe('Gemini 3.1 Pro (low)')
    expect(spawnMock).toHaveBeenCalledWith(
      '/usr/local/bin/agy',
      ['--print', '--print-timeout', '1s', '--dangerously-skip-permissions'],
      expect.objectContaining({ cwd: '/tmp/project' }),
    )
  })

  it('emits only the resumed print delta as the assistant response', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)
    const settings = new MockSettingsService()
    const provider = new AntigravityProvider(
      '/usr/local/bin/agy',
      null,
      undefined,
      settings,
    )
    const { deltas } = collectDeltas(provider)

    await waitFor(() =>
      expect(settings.patches[0]?.statusLineCommand).toContain(
        'CONVERGENCE_ANTIGRAVITY_STATUS_FILE=',
      ),
    )
    child.stdout.write('old answer\n\nnew answer')
    child.stdout.end()
    child.emit('exit', 0)

    await waitFor(() => {
      const assistant = deltas.find(
        (delta) =>
          delta.kind === 'conversation.item.add' &&
          delta.item.kind === 'message' &&
          delta.item.actor === 'assistant',
      )
      expect(
        assistant?.kind === 'conversation.item.add' &&
          assistant.item.kind === 'message'
          ? assistant.item.text
          : null,
      ).toBe('new answer')
    })
    expect(settings.patches[0]?.modelLabel).toBe('Gemini 3.1 Pro (high)')
  })

  it('captures continuation and context from the status-line file', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)
    const settings = new MockSettingsService()
    const provider = new AntigravityProvider(
      '/usr/local/bin/agy',
      null,
      undefined,
      settings,
    )
    const { deltas } = collectDeltas(provider)

    await waitFor(() =>
      expect(settings.patches[0]?.statusLineCommand).toBeTruthy(),
    )
    const capturePath = captureStatusPath(
      settings.patches[0]?.statusLineCommand,
    )
    await writeFile(
      capturePath,
      `${JSON.stringify({
        conversation_id: 'conv-123',
        context_window: {
          total_input_tokens: 100,
          total_output_tokens: 50,
          context_window_size: 1000,
          used_percentage: 15,
          remaining_percentage: 85,
          current_usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
      })}\n`,
      'utf8',
    )
    child.stdout.write('ok')
    child.stdout.end()
    child.emit('exit', 0)

    await waitFor(() =>
      expect(
        deltas.some(
          (delta) =>
            delta.kind === 'session.patch' &&
            delta.patch.continuationToken === 'conv-123',
        ),
      ).toBe(true),
    )
    expect(
      deltas.some(
        (delta) =>
          delta.kind === 'session.patch' &&
          delta.patch.contextWindow?.availability === 'available' &&
          delta.patch.contextWindow.usedTokens === 150,
      ),
    ).toBe(true)
  })

  it('imports post-run trajectory tool telemetry when Antigravity writes a conversation db', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)
    const settings = new MockSettingsService()
    const telemetry = new MockTrajectoryTelemetry()
    telemetry.events = [
      {
        kind: 'tool-call',
        stepIndex: 2,
        toolCallId: 'call-1',
        toolName: 'list_dir',
        inputText: '{"DirectoryPath":"."}',
        providerItemId: 'antigravity:2:tool-call:call-1',
      },
      {
        kind: 'tool-result',
        stepIndex: 3,
        toolCallId: 'call-1',
        toolName: 'list_dir',
        outputText: 'README.md',
        providerItemId: 'antigravity:3:tool-result:call-1',
      },
    ]
    const provider = new AntigravityProvider(
      '/usr/local/bin/agy',
      null,
      undefined,
      settings,
      telemetry,
    )
    const { deltas } = collectDeltas(provider)

    await waitFor(() =>
      expect(settings.patches[0]?.statusLineCommand).toBeTruthy(),
    )
    const capturePath = captureStatusPath(
      settings.patches[0]?.statusLineCommand,
    )
    await writeFile(
      capturePath,
      `${JSON.stringify({ conversation_id: 'conv-123' })}\n`,
      'utf8',
    )
    child.stdout.write('done')
    child.stdout.end()
    child.emit('exit', 0)

    await waitFor(() => {
      const toolCall = deltas.find(
        (delta) =>
          delta.kind === 'conversation.item.add' &&
          delta.item.kind === 'tool-call',
      )
      const toolResult = deltas.find(
        (delta) =>
          delta.kind === 'conversation.item.add' &&
          delta.item.kind === 'tool-result',
      )
      expect(
        toolCall?.kind === 'conversation.item.add' &&
          toolCall.item.kind === 'tool-call'
          ? toolCall.item.toolName
          : null,
      ).toBe('list_dir')
      expect(
        toolResult?.kind === 'conversation.item.add' &&
          toolResult.item.kind === 'tool-result'
          ? toolResult.item.relatedItemId
          : null,
      ).toBe(
        toolCall?.kind === 'conversation.item.add'
          ? toolCall.item.id
          : undefined,
      )
    })

    expect(telemetry.readToolEvents).toHaveBeenCalledWith('conv-123', null)
  })

  it('falls back to the newest Antigravity conversation db when status-line is silent', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)
    const settings = new MockSettingsService()
    const telemetry = new MockTrajectoryTelemetry()
    telemetry.fallbackConversationId = '11111111-1111-4111-8111-111111111111'
    telemetry.events = [
      {
        kind: 'tool-call',
        stepIndex: 2,
        toolCallId: 'call-1',
        toolName: 'view_file',
        inputText: '{"AbsolutePath":"README.md"}',
        providerItemId: 'antigravity:2:tool-call:call-1',
      },
      {
        kind: 'tool-result',
        stepIndex: 3,
        toolCallId: 'call-1',
        toolName: 'view_file',
        outputText: '# Project',
        providerItemId: 'antigravity:3:tool-result:call-1',
      },
    ]
    const provider = new AntigravityProvider(
      '/usr/local/bin/agy',
      null,
      undefined,
      settings,
      telemetry,
    )
    const { deltas } = collectDeltas(provider)

    await waitFor(() =>
      expect(settings.patches[0]?.statusLineCommand).toBeTruthy(),
    )
    child.stdout.write('done')
    child.stdout.end()
    child.emit('exit', 0)

    await waitFor(() => {
      expect(
        deltas.some(
          (delta) =>
            delta.kind === 'session.patch' &&
            delta.patch.continuationToken ===
              '11111111-1111-4111-8111-111111111111',
        ),
      ).toBe(true)
      expect(
        deltas.some(
          (delta) =>
            delta.kind === 'conversation.item.add' &&
            delta.item.kind === 'tool-call' &&
            delta.item.toolName === 'view_file',
        ),
      ).toBe(true)
    })

    expect(telemetry.findLatestConversationIdUpdatedAfter).toHaveBeenCalled()
    expect(telemetry.readToolEvents).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      null,
    )
  })
})
