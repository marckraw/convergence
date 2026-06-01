import { describe, expect, it, vi } from 'vitest'
import { ProviderRegistry } from '../provider/provider-registry'
import { NO_MID_RUN_INPUT_CAPABILITY } from '../provider/provider-descriptor.pure'
import type {
  OneShotInput,
  OneShotResult,
  Provider,
} from '../provider/provider.types'
import type { ConversationItem } from '../session/conversation-item.types'
import type { SessionSummary } from '../session/session.types'
import { SessionHtmlGenerationService } from './session-html-generation.service'

const session: SessionSummary = {
  id: 'session-1',
  contextKind: 'project',
  projectId: 'project-1',
  workspaceId: null,
  providerId: 'codex',
  model: 'gpt-5',
  effort: 'medium',
  name: 'HTML mode',
  status: 'completed',
  attention: 'finished',
  activity: null,
  contextWindow: null,
  workingDirectory: '/repo',
  archivedAt: null,
  parentSessionId: null,
  forkStrategy: null,
  primarySurface: 'conversation',
  continuationToken: null,
  lastSequence: 2,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:01.000Z',
}

const assistantItem: ConversationItem = {
  id: 'item-2',
  sessionId: session.id,
  sequence: 2,
  turnId: 'turn-1',
  kind: 'message',
  state: 'complete',
  actor: 'assistant',
  text: 'Create an HTML companion page.',
  createdAt: '2026-06-01T00:00:01.000Z',
  updatedAt: '2026-06-01T00:00:01.000Z',
  providerMeta: {
    providerId: 'codex',
    providerItemId: null,
    providerEventType: 'assistant',
  },
}

function makeProvider(
  overrides: Partial<Provider> & {
    oneShot?: (input: OneShotInput) => Promise<OneShotResult>
  } = {},
): Provider {
  return {
    id: 'codex',
    name: 'Codex',
    supportsContinuation: true,
    describe: async () => ({
      id: 'codex',
      name: 'Codex',
      vendorLabel: 'OpenAI',
      kind: 'conversation',
      supportsContinuation: true,
      defaultModelId: 'gpt-5-mini',
      modelOptions: [],
      attachments: {
        supportsImage: true,
        supportsPdf: true,
        supportsText: true,
        maxImageBytes: 1,
        maxPdfBytes: 1,
        maxTextBytes: 1,
        maxTotalBytes: 1,
      },
      midRunInput: NO_MID_RUN_INPUT_CAPABILITY,
    }),
    start: () => {
      throw new Error('not used')
    },
    ...overrides,
  }
}

function setup(provider?: Provider) {
  const providers = new ProviderRegistry()
  if (provider) providers.register(provider)
  const outputsById = new Map<string, Awaited<ReturnType<FakeSaveHtml>>>()
  const saveHtml = vi.fn(async (input: Parameters<FakeSaveHtml>[0]) => {
    const existing = Array.from(outputsById.values()).find((output) => {
      if (input.kind === 'living') {
        return output.sessionId === input.sessionId && output.kind === 'living'
      }
      return (
        output.sessionId === input.sessionId &&
        output.kind === 'snapshot' &&
        output.sourceItemId === (input.sourceItemId ?? null)
      )
    })
    const output = {
      id: existing?.id ?? `${input.kind}-output-${outputsById.size + 1}`,
      sessionId: input.sessionId,
      sourceItemId: input.sourceItemId ?? null,
      kind: input.kind,
      status: 'ready' as const,
      relativePath: input.relativePath ?? null,
      sizeBytes: input.html.length,
      error: null,
      createdAt: existing?.createdAt ?? '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    }
    outputsById.set(output.id, output)
    return output
  })
  const recordFailure = vi.fn((input: Parameters<FakeRecordFailure>[0]) => {
    const existing = Array.from(outputsById.values()).find((output) => {
      if (input.kind === 'living') {
        return output.sessionId === input.sessionId && output.kind === 'living'
      }
      return (
        output.sessionId === input.sessionId &&
        output.kind === 'snapshot' &&
        output.sourceItemId === (input.sourceItemId ?? null)
      )
    })
    const output = {
      id: existing?.id ?? `failed-${input.kind}-output-${outputsById.size + 1}`,
      sessionId: input.sessionId,
      sourceItemId: input.sourceItemId ?? null,
      kind: input.kind,
      status: 'failed' as const,
      relativePath: null,
      sizeBytes: 0,
      error: input.error,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    }
    outputsById.set(output.id, output)
    return output
  })
  const recordPending = vi.fn((input: Parameters<FakeRecordPending>[0]) => {
    const output = {
      id: `pending-${input.kind}-output-${outputsById.size + 1}`,
      sessionId: input.sessionId,
      sourceItemId: input.sourceItemId ?? null,
      kind: input.kind,
      status: 'pending' as const,
      relativePath: input.relativePath ?? null,
      sizeBytes: 0,
      error: null,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    }
    outputsById.set(output.id, output)
    return output
  })
  const listForSession = vi.fn((sessionId: string) =>
    Array.from(outputsById.values()).filter(
      (output) => output.sessionId === sessionId,
    ),
  )
  const readHtml = vi.fn(async (id: string) => {
    if (id === 'living-output') {
      return '<!doctype html><html><body>Previous page</body></html>'
    }
    throw new Error(`No fake HTML for ${id}`)
  })
  const seedLivingOutput = () => {
    outputsById.set('living-output', {
      id: 'living-output',
      sessionId: session.id,
      sourceItemId: 'item-1',
      kind: 'living',
      status: 'ready',
      relativePath: 'index.html',
      sizeBytes: 52,
      error: null,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    })
  }

  const service = new SessionHtmlGenerationService({
    providers,
    outputs: {
      saveHtml,
      recordPending,
      recordFailure,
      listForSession,
      readHtml,
    },
  })

  return {
    service,
    saveHtml,
    recordPending,
    recordFailure,
    listForSession,
    readHtml,
    seedLivingOutput,
  }
}

type FakeSaveHtml = NonNullable<
  ConstructorParameters<typeof SessionHtmlGenerationService>[0]['outputs']
>['saveHtml']
type FakeRecordFailure = NonNullable<
  ConstructorParameters<typeof SessionHtmlGenerationService>[0]['outputs']
>['recordFailure']
type FakeRecordPending = NonNullable<
  ConstructorParameters<typeof SessionHtmlGenerationService>[0]['outputs']
>['recordPending']

describe('SessionHtmlGenerationService', () => {
  it('runs provider oneShot and stores normalized snapshot and living HTML', async () => {
    const oneShot = vi.fn(async () => ({
      text: '```html\n<!doctype html><html><body>ok</body></html>\n```',
    }))
    const { service, saveHtml, recordPending } = setup(
      makeProvider({ oneShot }),
    )

    const result = await service.generateForAssistantItem({
      session,
      conversation: [assistantItem],
      sourceItem: assistantItem,
    })

    expect(result.snapshot.status).toBe('ready')
    expect(result.living?.status).toBe('ready')
    expect(oneShot).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'gpt-5',
        workingDirectory: '/repo',
      }),
    )
    expect(recordPending).toHaveBeenCalledWith({
      sessionId: session.id,
      sourceItemId: assistantItem.id,
      kind: 'snapshot',
      relativePath: 'snapshots/turn-2.html',
    })
    expect(saveHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: session.id,
        sourceItemId: assistantItem.id,
        kind: 'snapshot',
        relativePath: 'snapshots/turn-2.html',
        html: '<!doctype html><html><body>ok</body></html>',
      }),
    )
    expect(saveHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: session.id,
        sourceItemId: assistantItem.id,
        kind: 'living',
        relativePath: 'index.html',
        html: '<!doctype html><html><body>ok</body></html>',
      }),
    )
  })

  it('passes the existing living page into the next generation prompt', async () => {
    const oneShot = vi.fn(async () => ({
      text: '<!doctype html><html><body>Updated page</body></html>',
    }))
    const { service, seedLivingOutput, readHtml } = setup(
      makeProvider({ oneShot }),
    )
    seedLivingOutput()

    await service.generateForAssistantItem({
      session,
      conversation: [assistantItem],
      sourceItem: assistantItem,
    })

    expect(readHtml).toHaveBeenCalledWith('living-output')
    expect(oneShot).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Previous page'),
      }),
    )
  })

  it('falls back to provider default model when the session has no model', async () => {
    const oneShot = vi.fn(async () => ({
      text: '<!doctype html><html><body>ok</body></html>',
    }))
    const { service } = setup(makeProvider({ oneShot }))

    await service.generateForAssistantItem({
      session: { ...session, model: null },
      conversation: [assistantItem],
      sourceItem: assistantItem,
    })

    expect(oneShot).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: 'gpt-5-mini' }),
    )
  })

  it('records failure when provider does not support oneShot', async () => {
    const { service, recordFailure } = setup(makeProvider())

    const result = await service.generateForAssistantItem({
      session,
      conversation: [assistantItem],
      sourceItem: assistantItem,
    })

    expect(result.snapshot.status).toBe('failed')
    expect(result.living).toBeNull()
    expect(recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: session.id,
        sourceItemId: assistantItem.id,
        kind: 'snapshot',
      }),
    )
  })

  it('records provider errors as failed outputs', async () => {
    const { service, recordFailure, seedLivingOutput } = setup(
      makeProvider({
        oneShot: async () => {
          throw new Error('provider exploded')
        },
      }),
    )
    seedLivingOutput()

    const result = await service.generateForAssistantItem({
      session,
      conversation: [assistantItem],
      sourceItem: assistantItem,
    })

    expect(result.snapshot.status).toBe('failed')
    expect(result.living).toMatchObject({
      id: 'living-output',
      status: 'ready',
    })
    expect(recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'provider exploded' }),
    )
    expect(recordFailure).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'living' }),
    )
  })
})
