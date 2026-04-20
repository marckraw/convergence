import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useSessionStore,
  type ForkFullInput,
  type ForkSummary,
  type ForkSummaryInput,
  type ProviderInfo,
  type Session,
} from '@/entities/session'
import { useAppSettingsStore } from '@/entities/app-settings'
import { useDialogStore } from '@/entities/dialog'
import { SessionForkDialogContainer } from './session-fork.container'

const TEST_ATTACHMENTS = {
  supportsImage: true,
  supportsPdf: true,
  supportsText: true,
  maxImageBytes: 10 * 1024 * 1024,
  maxPdfBytes: 20 * 1024 * 1024,
  maxTextBytes: 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
}

const providers: ProviderInfo[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    vendorLabel: 'Anthropic',
    supportsContinuation: true,
    defaultModelId: 'sonnet',
    modelOptions: [
      {
        id: 'sonnet',
        label: 'Claude Sonnet',
        defaultEffort: 'medium',
        effortOptions: [
          { id: 'low', label: 'Low' },
          { id: 'medium', label: 'Medium' },
          { id: 'high', label: 'High' },
        ],
      },
    ],
    attachments: TEST_ATTACHMENTS,
  },
  {
    id: 'codex',
    name: 'Codex',
    vendorLabel: 'OpenAI',
    supportsContinuation: true,
    defaultModelId: 'gpt-5.4',
    modelOptions: [
      {
        id: 'gpt-5.4',
        label: 'GPT-5.4',
        defaultEffort: 'medium',
        effortOptions: [
          { id: 'low', label: 'Low' },
          { id: 'medium', label: 'Medium' },
          { id: 'high', label: 'High' },
        ],
      },
    ],
    attachments: TEST_ATTACHMENTS,
  },
]

const parentSession: Session = {
  id: 'parent-1',
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  providerId: 'claude-code',
  model: 'sonnet',
  effort: 'medium',
  name: 'Parent Session',
  status: 'idle',
  attention: 'none',
  workingDirectory: '/tmp/parent',
  transcript: [
    { type: 'user', text: 'hi', timestamp: '2026-01-01T00:00:00.000Z' },
    { type: 'assistant', text: 'hello', timestamp: '2026-01-01T00:00:01.000Z' },
    {
      type: 'user',
      text: 'do the thing',
      timestamp: '2026-01-01T00:00:02.000Z',
    },
    { type: 'assistant', text: 'done', timestamp: '2026-01-01T00:00:03.000Z' },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:04.000Z',
}

const sampleSummary: ForkSummary = {
  topic: 'Shipping the fork dialog',
  decisions: [{ text: 'Use typed artifact', evidence: 'typed artifact' }],
  key_facts: [{ text: 'Dialog lives under features/', evidence: 'features/' }],
  open_questions: ['Follow-ups?'],
  artifacts: {
    urls: [],
    file_paths: ['src/features/session-fork/'],
    repos: [],
    commands: [],
    identifiers: [],
  },
  next_steps: ['Write tests'],
}

function primeStores(
  options: {
    previewFork?: ReturnType<typeof vi.fn>
    forkFull?: ReturnType<typeof vi.fn>
    forkSummary?: ReturnType<typeof vi.fn>
  } = {},
) {
  useSessionStore.setState({
    sessions: [],
    globalSessions: [parentSession],
    needsYouDismissals: {},
    recentSessionIds: [],
    currentProjectId: 'project-1',
    activeSessionId: 'parent-1',
    draftWorkspaceId: null,
    providers,
    error: null,
    loadProviders: vi.fn().mockResolvedValue(undefined),
    previewFork:
      options.previewFork ?? vi.fn().mockResolvedValue(sampleSummary),
    forkFull:
      options.forkFull ??
      vi.fn().mockResolvedValue({ ...parentSession, id: 'child-1' }),
    forkSummary:
      options.forkSummary ??
      vi.fn().mockResolvedValue({ ...parentSession, id: 'child-1' }),
  } as unknown as ReturnType<typeof useSessionStore.getState>)

  useAppSettingsStore.setState({
    settings: {
      defaultProviderId: 'claude-code',
      defaultModelId: 'sonnet',
      defaultEffortId: 'medium',
      namingModelByProvider: {},
      extractionModelByProvider: {},
    },
    isLoaded: true,
    isSaving: false,
    error: null,
    unsubscribeBroadcast: null,
  } as unknown as ReturnType<typeof useAppSettingsStore.getState>)

  useDialogStore.setState({
    openDialog: 'session-fork',
    payload: { parentSessionId: 'parent-1' },
  })
}

describe('SessionForkDialogContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      session: {
        getById: vi.fn().mockResolvedValue(parentSession),
      },
    }
  })

  it('renders nothing when dialog is closed', () => {
    useDialogStore.setState({ openDialog: null, payload: null })
    primeStores()
    useDialogStore.setState({ openDialog: null, payload: null })
    const { container } = render(<SessionForkDialogContainer />)
    expect(container).toBeEmptyDOMElement()
  })

  it('full-strategy confirm dispatches forkFull without calling preview', async () => {
    const previewFork = vi.fn().mockResolvedValue(sampleSummary)
    const forkFull = vi
      .fn()
      .mockResolvedValue({ ...parentSession, id: 'child-1' })
    primeStores({ previewFork, forkFull })

    render(<SessionForkDialogContainer />)

    expect(await screen.findByText('Fork session')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Create fork$/i }))

    await waitFor(() => {
      expect(forkFull).toHaveBeenCalledTimes(1)
    })
    const call = forkFull.mock.calls[0]![0] as ForkFullInput
    expect(call.strategy).toBe('full')
    expect(call.parentSessionId).toBe('parent-1')
    expect(call.workspaceMode).toBe('reuse')
    expect(previewFork).not.toHaveBeenCalled()
  })

  it('switching to summary runs preview and populates the seed buffer', async () => {
    const previewFork = vi.fn().mockResolvedValue(sampleSummary)
    primeStores({ previewFork })

    render(<SessionForkDialogContainer />)

    expect(await screen.findByText('Fork session')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Structured summary/i }))

    await waitFor(() => {
      expect(previewFork).toHaveBeenCalledWith('parent-1')
    })

    const textarea = (await screen.findByDisplayValue(
      /Shipping the fork dialog/,
    )) as HTMLTextAreaElement
    expect(textarea.value).toContain('**Topic:** Shipping the fork dialog')
    expect(textarea.value).toContain('Use typed artifact')
  })

  it('switching strategy back to full clears the preview', async () => {
    const previewFork = vi.fn().mockResolvedValue(sampleSummary)
    primeStores({ previewFork })

    render(<SessionForkDialogContainer />)

    fireEvent.click(
      await screen.findByRole('button', { name: /Structured summary/i }),
    )

    await screen.findByDisplayValue(/Shipping the fork dialog/)

    fireEvent.click(screen.getByRole('button', { name: /Full transcript/i }))

    await waitFor(() => {
      expect(
        screen.queryByDisplayValue(/Shipping the fork dialog/),
      ).not.toBeInTheDocument()
    })
  })

  it('surfaces an extraction error with a retry path', async () => {
    const previewFork = vi
      .fn()
      .mockRejectedValueOnce(new Error('LLM offline'))
      .mockResolvedValueOnce(sampleSummary)
    primeStores({ previewFork })

    render(<SessionForkDialogContainer />)

    fireEvent.click(
      await screen.findByRole('button', { name: /Structured summary/i }),
    )

    expect(await screen.findByText('LLM offline')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Retry/i }))

    await screen.findByDisplayValue(/Shipping the fork dialog/)
    expect(previewFork).toHaveBeenCalledTimes(2)
  })

  it('toggling workspace to fork requires a branch and submits it verbatim', async () => {
    const forkFull = vi
      .fn()
      .mockResolvedValue({ ...parentSession, id: 'child-1' })
    primeStores({ forkFull })

    render(<SessionForkDialogContainer />)

    expect(await screen.findByText('Fork session')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /New workspace/i }))

    const confirm = screen.getByRole('button', { name: /^Create fork$/i })
    expect(confirm).toBeDisabled()

    const branchInput = screen.getByPlaceholderText(
      'fork/branch-name',
    ) as HTMLInputElement
    fireEvent.change(branchInput, { target: { value: 'fork/investigate' } })

    fireEvent.click(confirm)

    await waitFor(() => {
      expect(forkFull).toHaveBeenCalledTimes(1)
    })
    const call = forkFull.mock.calls[0]![0] as ForkFullInput
    expect(call.workspaceMode).toBe('fork')
    expect(call.workspaceBranchName).toBe('fork/investigate')
  })

  it('inherits the parent provider/model so forkFull is called with them by default', async () => {
    const codexParent: Session = {
      ...parentSession,
      providerId: 'codex',
      model: 'gpt-5.4',
    }
    useSessionStore.setState({
      globalSessions: [codexParent],
    } as unknown as ReturnType<typeof useSessionStore.getState>)

    const forkFull = vi
      .fn()
      .mockResolvedValue({ ...codexParent, id: 'child-1' })
    primeStores({ forkFull })
    useSessionStore.setState({
      globalSessions: [codexParent],
    } as unknown as ReturnType<typeof useSessionStore.getState>)

    render(<SessionForkDialogContainer />)

    expect(await screen.findByText('Fork session')).toBeInTheDocument()
    expect(screen.getByText('OpenAI')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Create fork$/i }))

    await waitFor(() => {
      expect(forkFull).toHaveBeenCalledTimes(1)
    })
    const call = forkFull.mock.calls[0]![0] as ForkFullInput
    expect(call.providerId).toBe('codex')
    expect(call.modelId).toBe('gpt-5.4')
  })

  it('renders a size warning when the parent context window is near full', async () => {
    const bigTranscript = Array.from({ length: 40 }).map((_, idx) => ({
      type: 'user' as const,
      text: 'x'.repeat(500),
      timestamp: `2026-01-01T00:00:${String(idx).padStart(2, '0')}.000Z`,
    }))
    const heavyParent: Session = {
      ...parentSession,
      transcript: bigTranscript,
      contextWindow: {
        availability: 'available',
        source: 'provider',
        usedTokens: 6000,
        windowTokens: 6000,
        usedPercentage: 100,
        remainingPercentage: 0,
      },
    }
    useSessionStore.setState({
      globalSessions: [heavyParent],
    } as unknown as ReturnType<typeof useSessionStore.getState>)
    primeStores()
    useSessionStore.setState({
      globalSessions: [heavyParent],
    } as unknown as ReturnType<typeof useSessionStore.getState>)

    render(<SessionForkDialogContainer />)

    const warning = await screen.findByTestId('fork-size-warning')
    expect(warning).toHaveTextContent(/context window/i)
    expect(
      screen.getByRole('button', { name: /Switch to summary/i }),
    ).toBeInTheDocument()
  })

  it('summary-strategy confirm sends the edited seed markdown verbatim', async () => {
    const forkSummary = vi
      .fn()
      .mockResolvedValue({ ...parentSession, id: 'child-1' })
    primeStores({ forkSummary })

    render(<SessionForkDialogContainer />)

    fireEvent.click(
      await screen.findByRole('button', { name: /Structured summary/i }),
    )

    const textarea = (await screen.findByDisplayValue(
      /Shipping the fork dialog/,
    )) as HTMLTextAreaElement

    act(() => {
      fireEvent.change(textarea, { target: { value: 'edited seed' } })
    })

    fireEvent.click(screen.getByRole('button', { name: /^Create fork$/i }))

    await waitFor(() => {
      expect(forkSummary).toHaveBeenCalledTimes(1)
    })
    const call = forkSummary.mock.calls[0]![0] as ForkSummaryInput
    expect(call.strategy).toBe('summary')
    expect(call.seedMarkdown).toBe('edited seed')
  })
})
