import { describe, expect, it, vi } from 'vitest'
import type { AppSettingsService } from '../../app-settings/app-settings.service'
import type { ProviderRegistry } from '../../provider/provider-registry'
import type {
  OneShotInput,
  OneShotResult,
  Provider,
} from '../../provider/provider.types'
import type { WorkspaceService } from '../../workspace/workspace.service'
import type { SessionService } from '../session.service'
import type { ConversationItem } from '../conversation-item.types'
import type { SessionSummary } from '../session.types'
import {
  SessionForkExtractionError,
  SessionForkService,
} from './session-fork.service'
import type { ForkSummary } from './session-fork.types'

function makeParent(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 'parent-1',
    projectId: 'proj-1',
    workspaceId: 'ws-1',
    providerId: 'claude-code',
    model: 'sonnet',
    effort: 'medium',
    name: 'Parent',
    status: 'idle',
    attention: 'none',
    workingDirectory: '/tmp/parent',
    contextWindow: null,
    activity: null,
    archivedAt: null,
    parentSessionId: null,
    forkStrategy: null,
    primarySurface: 'conversation',
    continuationToken: null,
    lastSequence: 3,
    createdAt: 'now',
    updatedAt: 'now',
    ...overrides,
  }
}

function makeChild(
  id: string,
  overrides: Partial<SessionSummary> = {},
): SessionSummary {
  return {
    ...makeParent({ id, ...overrides }),
  }
}

function makeParentConversation(session: SessionSummary): ConversationItem[] {
  return [
    {
      id: `${session.id}-item-1`,
      sessionId: session.id,
      sequence: 1,
      turnId: `${session.id}:turn:1`,
      kind: 'message',
      state: 'complete',
      actor: 'user',
      text: 'hi',
      createdAt: 't1',
      updatedAt: 't1',
      providerMeta: {
        providerId: session.providerId,
        providerItemId: null,
        providerEventType: 'user',
      },
    },
    {
      id: `${session.id}-item-2`,
      sessionId: session.id,
      sequence: 2,
      turnId: `${session.id}:turn:1`,
      kind: 'message',
      state: 'complete',
      actor: 'assistant',
      text: 'hello',
      createdAt: 't2',
      updatedAt: 't2',
      providerMeta: {
        providerId: session.providerId,
        providerItemId: null,
        providerEventType: 'assistant',
      },
    },
    {
      id: `${session.id}-item-3`,
      sessionId: session.id,
      sequence: 3,
      turnId: `${session.id}:turn:2`,
      kind: 'message',
      state: 'complete',
      actor: 'user',
      text: 'check https://example.com and src/foo.ts',
      createdAt: 't3',
      updatedAt: 't3',
      providerMeta: {
        providerId: session.providerId,
        providerItemId: null,
        providerEventType: 'user',
      },
    },
  ]
}

const validSummary: ForkSummary = {
  topic: 'Fix auth',
  decisions: [{ text: 'use JWT', evidence: 'should use JWT' }],
  open_questions: [],
  key_facts: [{ text: 'auth in middleware', evidence: 'middleware' }],
  artifacts: {
    urls: [],
    file_paths: [],
    repos: [],
    commands: [],
    identifiers: [],
  },
  next_steps: ['ship it'],
}

interface Harness {
  service: SessionForkService
  sessions: SessionService
  providers: ProviderRegistry
  appSettings: AppSettingsService
  workspaces: WorkspaceService
  oneShot: ReturnType<
    typeof vi.fn<(input: OneShotInput) => Promise<OneShotResult>>
  >
  createSession: ReturnType<
    typeof vi.fn<
      (input: Parameters<SessionService['create']>[0]) => SessionSummary
    >
  >
  startSession: ReturnType<
    typeof vi.fn<(id: string, input: unknown) => Promise<void>>
  >
  getById: ReturnType<typeof vi.fn<(id: string) => SessionSummary | null>>
  getSummaryById: ReturnType<
    typeof vi.fn<(id: string) => SessionSummary | null>
  >
  getConversation: ReturnType<typeof vi.fn<(id: string) => ConversationItem[]>>
  workspaceCreate: ReturnType<
    typeof vi.fn<
      (
        input: Parameters<WorkspaceService['create']>[0],
      ) => Promise<Awaited<ReturnType<WorkspaceService['create']>>>
    >
  >
}

function setup(
  overrides: { parent?: SessionSummary; oneShotText?: string[] } = {},
): Harness {
  const parent = overrides.parent ?? makeParent()
  const sessionsById = new Map<string, SessionSummary>([[parent.id, parent]])
  const conversationsById = new Map<string, ConversationItem[]>([
    [parent.id, makeParentConversation(parent)],
  ])
  const getById = vi.fn((id: string) => sessionsById.get(id) ?? null)
  const getSummaryById = vi.fn((id: string) => sessionsById.get(id) ?? null)
  const getConversation = vi.fn((id: string) => conversationsById.get(id) ?? [])
  const createSession = vi.fn(
    (input: Parameters<SessionService['create']>[0]) => {
      const child = makeChild(`child-${sessionsById.size}`, {
        projectId: input.projectId,
        workspaceId: input.workspaceId,
        providerId: input.providerId,
        model: input.model,
        effort: input.effort,
        name: input.name,
        parentSessionId: input.parentSessionId ?? null,
        forkStrategy: input.forkStrategy ?? null,
        primarySurface: 'conversation',
        workingDirectory: '/tmp/child',
        lastSequence: 0,
      })
      sessionsById.set(child.id, child)
      conversationsById.set(child.id, [])
      return child
    },
  )
  const startSession = vi.fn(async () => {})
  const sessions = {
    create: createSession,
    start: startSession,
    getById,
    getSummaryById,
    getConversation,
  } as unknown as SessionService

  const oneShotTexts = overrides.oneShotText ?? [JSON.stringify(validSummary)]
  let call = 0
  const oneShot = vi.fn(
    async (_input: OneShotInput): Promise<OneShotResult> => {
      const text = oneShotTexts[call] ?? oneShotTexts[oneShotTexts.length - 1]
      call += 1
      return { text }
    },
  )
  const provider: Provider = {
    id: parent.providerId,
    name: 'Claude Code',
    supportsContinuation: true,
    describe: async () => ({
      id: parent.providerId,
      name: 'Claude Code',
      vendorLabel: 'Anthropic',
      kind: 'conversation',
      supportsContinuation: true,
      defaultModelId: 'sonnet',
      modelOptions: [
        {
          id: 'sonnet',
          label: 'Sonnet',
          defaultEffort: 'medium',
          effortOptions: [{ id: 'medium', label: 'Medium' }],
        },
      ],
      attachments: {
        supportsImage: false,
        supportsPdf: false,
        supportsText: false,
        maxImageBytes: 0,
        maxPdfBytes: 0,
        maxTextBytes: 0,
        maxTotalBytes: 0,
      },
    }),
    start: () => {
      throw new Error('not used')
    },
    oneShot,
  }
  const providers = {
    register: vi.fn(),
    get: vi.fn((id: string) => (id === provider.id ? provider : undefined)),
    getAll: vi.fn(() => [provider]),
  } as unknown as ProviderRegistry

  const appSettings = {
    resolveExtractionModel: vi.fn(async () => 'sonnet'),
  } as unknown as AppSettingsService

  const workspaceCreate = vi.fn(
    async (input: Parameters<WorkspaceService['create']>[0]) => ({
      id: 'ws-new',
      projectId: input.projectId,
      branchName: input.branchName,
      path: '/tmp/ws-new',
      type: 'worktree' as const,
      createdAt: 'now',
    }),
  )
  const workspaces = {
    create: workspaceCreate,
  } as unknown as WorkspaceService

  const service = new SessionForkService({
    sessions,
    providers,
    appSettings,
    workspaces,
  })

  return {
    service,
    sessions,
    providers,
    appSettings,
    workspaces,
    oneShot,
    createSession,
    startSession,
    getById,
    getSummaryById,
    getConversation,
    workspaceCreate,
  }
}

describe('SessionForkService', () => {
  describe('previewSummary', () => {
    it('returns the parsed summary on the first attempt', async () => {
      const h = setup()
      const summary = await h.service.previewSummary('parent-1')
      expect(summary.topic).toBe('Fix auth')
      expect(h.oneShot).toHaveBeenCalledTimes(1)
    })

    it('merges regex-extracted artifacts with LLM output', async () => {
      const h = setup()
      const summary = await h.service.previewSummary('parent-1')
      expect(summary.artifacts.urls).toContain('https://example.com')
      expect(
        summary.artifacts.file_paths.some((p) => p.includes('src/foo.ts')),
      ).toBe(true)
    })

    it('retries once on invalid JSON and succeeds', async () => {
      const h = setup({
        oneShotText: ['not json {', JSON.stringify(validSummary)],
      })
      const summary = await h.service.previewSummary('parent-1')
      expect(summary.topic).toBe('Fix auth')
      expect(h.oneShot).toHaveBeenCalledTimes(2)
    })

    it('throws SessionForkExtractionError when both attempts are invalid', async () => {
      const h = setup({ oneShotText: ['not json {', 'still not json'] })
      await expect(h.service.previewSummary('parent-1')).rejects.toBeInstanceOf(
        SessionForkExtractionError,
      )
      expect(h.oneShot).toHaveBeenCalledTimes(2)
    })

    it('throws when the parent is not found', async () => {
      const h = setup()
      await expect(h.service.previewSummary('ghost')).rejects.toThrow(
        /Parent session not found/,
      )
    })

    it('invokes oneShot as a method so providers can rely on `this`', async () => {
      const h = setup()
      const provider = h.providers.get('claude-code') as unknown as {
        oneShot: (input: OneShotInput) => Promise<OneShotResult>
        marker: string
      }
      provider.marker = 'ok'
      const seen: { marker?: string }[] = []
      provider.oneShot = vi.fn(async function (
        this: { marker?: string },
        _input: OneShotInput,
      ): Promise<OneShotResult> {
        seen.push(this)
        return { text: JSON.stringify(validSummary) }
      })
      await h.service.previewSummary('parent-1')
      expect(seen[0]?.marker).toBe('ok')
    })

    it('throws when the provider has no oneShot', async () => {
      const h = setup()
      vi.mocked(h.providers.get).mockReturnValue({
        id: 'claude-code',
        describe: () => ({}) as never,
        start: () => ({}) as never,
      } as unknown as Provider)
      await expect(h.service.previewSummary('parent-1')).rejects.toBeInstanceOf(
        SessionForkExtractionError,
      )
    })
  })

  describe('forkFull', () => {
    it('creates a child session with serialized transcript seed and parent bookkeeping', async () => {
      const h = setup()
      const child = await h.service.forkFull({
        strategy: 'full',
        parentSessionId: 'parent-1',
        name: 'Parent (fork)',
        providerId: 'codex',
        modelId: 'gpt-5.4',
        effort: 'high',
        workspaceMode: 'reuse',
        workspaceBranchName: null,
        additionalInstruction: null,
      })
      expect(child.parentSessionId).toBe('parent-1')
      expect(child.forkStrategy).toBe('full')
      expect(h.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          parentSessionId: 'parent-1',
          forkStrategy: 'full',
          primarySurface: 'conversation',
          workspaceId: 'ws-1',
          providerId: 'codex',
          model: 'gpt-5.4',
          effort: 'high',
        }),
      )
      const startCall = h.startSession.mock.calls[0]
      expect(startCall[1]).toEqual(
        expect.objectContaining({
          text: expect.stringContaining(
            'This session is a fork of "Parent"',
          ) as unknown as string,
        }),
      )
      expect(startCall[1]).toEqual(
        expect.objectContaining({
          text: expect.stringContaining('user: hi') as unknown as string,
        }),
      )
    })

    it('does not call the extraction provider', async () => {
      const h = setup()
      await h.service.forkFull({
        strategy: 'full',
        parentSessionId: 'parent-1',
        name: 'fork',
        providerId: 'claude-code',
        modelId: 'sonnet',
        effort: null,
        workspaceMode: 'reuse',
        workspaceBranchName: null,
        additionalInstruction: null,
      })
      expect(h.oneShot).not.toHaveBeenCalled()
    })
  })

  describe('forkSummary', () => {
    it('passes seedMarkdown verbatim to session.start without re-extracting', async () => {
      const h = setup()
      await h.service.forkSummary({
        strategy: 'summary',
        parentSessionId: 'parent-1',
        name: 'fork',
        providerId: 'claude-code',
        modelId: 'sonnet',
        effort: 'medium',
        workspaceMode: 'reuse',
        workspaceBranchName: null,
        additionalInstruction: null,
        seedMarkdown: 'EDITED SEED CONTENT',
      })
      expect(h.oneShot).not.toHaveBeenCalled()
      expect(h.startSession).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ text: 'EDITED SEED CONTENT' }),
      )
      expect(h.createSession).toHaveBeenCalledWith(
        expect.objectContaining({ forkStrategy: 'summary' }),
      )
    })
  })

  describe('workspace handling', () => {
    it('reuse copies the parent workspaceId', async () => {
      const h = setup({ parent: makeParent({ workspaceId: 'ws-parent' }) })
      await h.service.forkFull({
        strategy: 'full',
        parentSessionId: 'parent-1',
        name: 'fork',
        providerId: 'claude-code',
        modelId: 'sonnet',
        effort: null,
        workspaceMode: 'reuse',
        workspaceBranchName: null,
        additionalInstruction: null,
      })
      expect(h.workspaceCreate).not.toHaveBeenCalled()
      expect(h.createSession).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: 'ws-parent' }),
      )
    })

    it('fork creates a new workspace and binds child to it', async () => {
      const h = setup()
      await h.service.forkFull({
        strategy: 'full',
        parentSessionId: 'parent-1',
        name: 'fork',
        providerId: 'claude-code',
        modelId: 'sonnet',
        effort: null,
        workspaceMode: 'fork',
        workspaceBranchName: 'fork/exploration',
        additionalInstruction: null,
      })
      expect(h.workspaceCreate).toHaveBeenCalledWith({
        projectId: 'proj-1',
        branchName: 'fork/exploration',
      })
      expect(h.createSession).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: 'ws-new' }),
      )
    })

    it('rejects fork mode without a branch name', async () => {
      const h = setup()
      await expect(
        h.service.forkFull({
          strategy: 'full',
          parentSessionId: 'parent-1',
          name: 'fork',
          providerId: 'claude-code',
          modelId: 'sonnet',
          effort: null,
          workspaceMode: 'fork',
          workspaceBranchName: null,
          additionalInstruction: null,
        }),
      ).rejects.toThrow(/workspaceBranchName is required/)
    })
  })

  describe('shell parent guard', () => {
    it('previewSummary rejects parents that use the shell provider', async () => {
      const h = setup({
        parent: makeParent({ providerId: 'shell', primarySurface: 'terminal' }),
      })
      await expect(h.service.previewSummary('parent-1')).rejects.toThrow(
        /shell provider/,
      )
    })

    it('forkFull rejects shell-provider parents without touching the session service', async () => {
      const h = setup({
        parent: makeParent({ providerId: 'shell', primarySurface: 'terminal' }),
      })
      await expect(
        h.service.forkFull({
          strategy: 'full',
          parentSessionId: 'parent-1',
          name: 'fork',
          providerId: 'claude-code',
          modelId: 'sonnet',
          effort: null,
          workspaceMode: 'reuse',
          workspaceBranchName: null,
          additionalInstruction: null,
        }),
      ).rejects.toThrow(/shell provider/)
      expect(h.createSession).not.toHaveBeenCalled()
    })

    it('forkSummary rejects shell-provider parents', async () => {
      const h = setup({
        parent: makeParent({ providerId: 'shell', primarySurface: 'terminal' }),
      })
      await expect(
        h.service.forkSummary({
          strategy: 'summary',
          parentSessionId: 'parent-1',
          name: 'fork',
          providerId: 'claude-code',
          modelId: 'sonnet',
          effort: null,
          workspaceMode: 'reuse',
          workspaceBranchName: null,
          additionalInstruction: null,
          seedMarkdown: 'seed',
        }),
      ).rejects.toThrow(/shell provider/)
      expect(h.createSession).not.toHaveBeenCalled()
    })
  })
})
