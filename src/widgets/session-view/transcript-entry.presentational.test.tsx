import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Attachment } from '@/entities/attachment'
import type { ConversationItem } from '@/entities/session'
import { buildTranscriptEntryViewModel } from './transcript-entry.pure'
import { ConversationItemView } from './transcript-entry.presentational'

interface RenderConversationItemViewInput {
  entry: ConversationItem
  turnStartedAt?: string | null
  attachments?: Attachment[]
  missingAttachmentIds?: string[]
  onAttachmentOpen?: (attachment: Attachment) => void
  injectedContextText?: string | null
}

function renderConversationItemView({
  entry,
  turnStartedAt = null,
  attachments = [],
  missingAttachmentIds = [],
  onAttachmentOpen,
  injectedContextText = null,
}: RenderConversationItemViewInput) {
  const attachmentIds = [
    ...attachments.map((attachment) => attachment.id),
    ...missingAttachmentIds,
  ]
  const item =
    attachmentIds.length > 0 &&
    entry.kind === 'message' &&
    entry.actor === 'user'
      ? { ...entry, attachmentIds }
      : entry

  return render(
    <ConversationItemView
      viewModel={buildTranscriptEntryViewModel({
        item,
        turnStartedAt,
        resolvedAttachmentsById: Object.fromEntries(
          attachments.map((attachment) => [attachment.id, attachment]),
        ),
        injectedContextText,
      })}
      onAttachmentOpen={onAttachmentOpen}
    />,
  )
}

describe('ConversationItemView', () => {
  it('renders selected skills on user messages', () => {
    renderConversationItemView({
      entry: {
        id: 'message-1',
        sessionId: 'session-1',
        sequence: 1,
        turnId: null,
        kind: 'message',
        state: 'complete',
        actor: 'user',
        text: 'Use this skill for the plan.',
        skillSelections: [
          {
            id: 'codex:global:planning',
            providerId: 'codex',
            providerName: 'Codex',
            scope: 'global',
            sourceLabel: 'Global',
            name: 'planning',
            displayName: 'Planning',
            path: '/skills/planning/SKILL.md',
            rawScope: null,
            status: 'selected',
          },
        ],
        createdAt: '2026-04-13T10:00:00.000Z',
        updatedAt: '2026-04-13T10:00:00.000Z',
        providerMeta: {
          providerId: 'codex',
          providerItemId: null,
          providerEventType: 'user',
        },
      },
    })

    expect(screen.getByText('Planning')).toBeInTheDocument()
    expect(screen.getByText('selected')).toBeInTheDocument()
    expect(screen.getByTestId('message-skill-selections')).toBeInTheDocument()
  })

  it('keeps injected boot context collapsed instead of rendering it as message text', () => {
    const injectedContextText =
      '<convergence:context>\nchaperone path\n</convergence:context>'

    renderConversationItemView({
      injectedContextText,
      entry: {
        id: 'message-1',
        sessionId: 'session-1',
        sequence: 1,
        turnId: null,
        kind: 'message',
        state: 'complete',
        actor: 'user',
        text: `${injectedContextText}\n\nwhere is chaperone?`,
        createdAt: '2026-04-13T10:00:00.000Z',
        updatedAt: '2026-04-13T10:00:00.000Z',
        providerMeta: {
          providerId: 'claude-code',
          providerItemId: null,
          providerEventType: 'user',
        },
      },
    })

    const details = screen.getByTestId('injected-context-details')

    expect(details).not.toHaveAttribute('open')
    expect(screen.getByText('where is chaperone?')).toBeInTheDocument()
    for (const node of screen.getAllByText(/^<convergence:context>/)) {
      expect(node).not.toBeVisible()
    }
  })

  it('renders assistant markdown with headings, lists, links, and code', () => {
    renderConversationItemView({
      entry: {
        id: 'message-1',
        sessionId: 'session-1',
        sequence: 1,
        turnId: null,
        kind: 'message',
        state: 'complete',
        actor: 'assistant',
        text: [
          '# Summary',
          '',
          '- first item',
          '- second item',
          '',
          'See [docs](https://example.com/docs).',
          '',
          '```ts',
          'const value = 1',
          '```',
        ].join('\n'),
        createdAt: '2026-04-13T10:00:00.000Z',
        updatedAt: '2026-04-13T10:00:00.000Z',
        providerMeta: {
          providerId: 'claude-code',
          providerItemId: null,
          providerEventType: 'assistant',
        },
      },
    })

    expect(
      screen.getByRole('heading', { name: 'Summary', level: 1 }),
    ).toBeInTheDocument()
    expect(screen.getByText('first item')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute(
      'href',
      'https://example.com/docs',
    )
    expect(screen.getByText('ts')).toBeInTheDocument()
    expect(screen.getByText('const value = 1')).toBeInTheDocument()
    expect(
      screen.getByTestId('conversation-item-timestamp'),
    ).toBeInTheDocument()
  })

  it('renders cleaned assistant markdown when a UI response artifact is present', () => {
    renderConversationItemView({
      entry: {
        id: 'message-1',
        sessionId: 'session-1',
        sequence: 1,
        turnId: null,
        kind: 'message',
        state: 'complete',
        actor: 'assistant',
        text: [
          'This is the Markdown answer.',
          '',
          '```convergence-ui-html',
          '---',
          'title: Preview panel',
          '---',
          '<main>Generated UI</main>',
          '```',
        ].join('\n'),
        createdAt: '2026-04-13T10:00:00.000Z',
        updatedAt: '2026-04-13T10:00:00.000Z',
        providerMeta: {
          providerId: 'codex',
          providerItemId: null,
          providerEventType: 'assistant',
        },
      },
    })

    expect(screen.getByText('This is the Markdown answer.')).toBeInTheDocument()
    expect(screen.queryByText('<main>Generated UI</main>')).toBeNull()
    expect(
      screen.getByTestId('ui-response-artifact-indicator'),
    ).toHaveAttribute('title', 'Preview panel')
  })

  it('renders elapsed timing metadata for assistant work', () => {
    renderConversationItemView({
      turnStartedAt: '2026-04-13T10:00:00.000Z',
      entry: {
        id: 'message-1',
        sessionId: 'session-1',
        sequence: 2,
        turnId: 'turn-1',
        kind: 'message',
        state: 'complete',
        actor: 'assistant',
        text: 'Done.',
        createdAt: '2026-04-13T10:00:03.000Z',
        updatedAt: '2026-04-13T10:00:08.000Z',
        providerMeta: {
          providerId: 'claude-code',
          providerItemId: null,
          providerEventType: 'assistant',
        },
      },
    })

    expect(
      screen.getByTestId('conversation-item-turn-elapsed'),
    ).toHaveTextContent('+3s')
    expect(
      screen.getByTestId('conversation-item-active-duration'),
    ).toHaveTextContent('5s')
  })

  it('keeps long approval descriptions within the approval frame', () => {
    const { container } = renderConversationItemView({
      entry: {
        id: 'approval-1',
        sessionId: 'session-1',
        sequence: 1,
        turnId: null,
        kind: 'approval-request',
        state: 'complete',
        description: `Command: /bin/zsh -lc "${'node-e-very-long-unbroken-command'.repeat(80)}"`,
        createdAt: '2026-04-13T10:00:00.000Z',
        updatedAt: '2026-04-13T10:00:00.000Z',
        providerMeta: {
          providerId: 'codex',
          providerItemId: null,
          providerEventType: 'approval-request',
        },
      },
    })

    const approvalFrame = screen
      .getByText('Approval needed')
      .closest('[class*="border-warning"]')
    const approvalBody =
      screen.getByText('Approval needed').parentElement?.parentElement
    const wrappingMarkdown = container.querySelector(
      '[class*="overflow-wrap:anywhere"]',
    )

    expect(approvalFrame).toHaveClass('max-w-full', 'overflow-hidden')
    expect(approvalBody).toHaveClass('min-w-0')
    expect(wrappingMarkdown).toHaveClass('max-w-full')
  })

  it('collapses tool results by default and expands inline on demand', () => {
    const result = [
      '/bin/zsh -lc "sed -n 1,20p app.tsx"',
      'line 1',
      'line 2',
    ].join('\n')

    renderConversationItemView({
      entry: {
        id: 'tool-result-1',
        sessionId: 'session-1',
        sequence: 1,
        turnId: null,
        kind: 'tool-result',
        state: 'complete',
        toolName: null,
        relatedItemId: null,
        outputText: result,
        createdAt: '2026-04-13T10:00:00.000Z',
        updatedAt: '2026-04-13T10:00:00.000Z',
        providerMeta: {
          providerId: 'codex',
          providerItemId: null,
          providerEventType: 'tool-result',
        },
      },
    })

    const details = document.querySelector('details')
    const summary = document.querySelector('summary')
    expect(details).not.toBeNull()
    expect(summary).not.toBeNull()
    expect(details).not.toHaveAttribute('open')
    expect(summary).toHaveTextContent('/bin/zsh -lc "sed -n 1,20p app.tsx"')
    expect(screen.queryByText('line 1')).toBeNull()

    fireEvent.click(summary as Element)

    expect(details).toHaveAttribute('open')
    const pre = document.querySelector('pre')
    expect(pre).not.toBeNull()
    expect(pre).toHaveTextContent('line 1')
    expect(pre).toHaveTextContent('line 2')

    fireEvent.click(summary as Element)

    expect(details).not.toHaveAttribute('open')
  })

  it('marks Antigravity trajectory tool cards as post-run telemetry', () => {
    renderConversationItemView({
      entry: {
        id: 'tool-call-1',
        sessionId: 'session-1',
        sequence: 1,
        turnId: null,
        kind: 'tool-call',
        state: 'complete',
        toolName: 'list_dir',
        inputText: '{"DirectoryPath":"."}',
        createdAt: '2026-04-13T10:00:00.000Z',
        updatedAt: '2026-04-13T10:00:00.000Z',
        providerMeta: {
          providerId: 'antigravity',
          providerItemId: 'antigravity:2:tool-call:call-1',
          providerEventType: 'trajectory-tool-call',
        },
      },
    })

    expect(screen.getByTestId('tool-visibility-badge')).toHaveTextContent(
      'Post-run',
    )
    expect(screen.getByTestId('tool-visibility-badge')).toHaveAttribute(
      'title',
      'Recovered from the Antigravity conversation database after the turn completed.',
    )
  })

  it('does not mark live provider tool cards as post-run telemetry', () => {
    renderConversationItemView({
      entry: {
        id: 'tool-call-1',
        sessionId: 'session-1',
        sequence: 1,
        turnId: null,
        kind: 'tool-call',
        state: 'complete',
        toolName: 'Bash',
        inputText: '{"command":"ls"}',
        createdAt: '2026-04-13T10:00:00.000Z',
        updatedAt: '2026-04-13T10:00:00.000Z',
        providerMeta: {
          providerId: 'codex',
          providerItemId: 'tool-1',
          providerEventType: 'tool-use',
        },
      },
    })

    expect(screen.queryByTestId('tool-visibility-badge')).toBeNull()
  })

  describe('copy button', () => {
    const writeText = vi.fn<(value: string) => Promise<void>>()

    beforeEach(() => {
      writeText.mockReset()
      writeText.mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      })
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('copies the raw markdown text for assistant messages', async () => {
      const markdown = '# Title\n\n- item'
      renderConversationItemView({
        entry: {
          id: 'message-1',
          sessionId: 'session-1',
          sequence: 1,
          turnId: null,
          kind: 'message',
          state: 'complete',
          actor: 'assistant',
          text: markdown,
          createdAt: '2026-04-22T10:00:00.000Z',
          updatedAt: '2026-04-22T10:00:00.000Z',
          providerMeta: {
            providerId: 'claude-code',
            providerItemId: null,
            providerEventType: 'assistant',
          },
        },
      })

      fireEvent.click(screen.getByRole('button', { name: 'Copy' }))

      await waitFor(() => expect(writeText).toHaveBeenCalledWith(markdown))
    })

    it('copies the raw outputText for tool-result items', async () => {
      const output = 'line 1\nline 2'
      renderConversationItemView({
        entry: {
          id: 'tool-result-1',
          sessionId: 'session-1',
          sequence: 1,
          turnId: null,
          kind: 'tool-result',
          state: 'complete',
          toolName: null,
          relatedItemId: null,
          outputText: output,
          createdAt: '2026-04-22T10:00:00.000Z',
          updatedAt: '2026-04-22T10:00:00.000Z',
          providerMeta: {
            providerId: 'codex',
            providerItemId: null,
            providerEventType: 'tool-result',
          },
        },
      })

      fireEvent.click(screen.getByRole('button', { name: 'Copy' }))

      await waitFor(() => expect(writeText).toHaveBeenCalledWith(output))
    })
  })

  describe('user message attachments', () => {
    function userEntry(text = 'review these') {
      return {
        id: 'msg-user',
        sessionId: 'session-1',
        sequence: 1,
        turnId: null,
        kind: 'message' as const,
        state: 'complete' as const,
        actor: 'user' as const,
        text,
        createdAt: '2026-04-13T10:00:00.000Z',
        updatedAt: '2026-04-13T10:00:00.000Z',
        providerMeta: {
          providerId: 'claude-code',
          providerItemId: null,
          providerEventType: 'user',
        },
      }
    }

    function makeAttachment(
      id: string,
      filename: string,
      overrides: Partial<Attachment> = {},
    ): Attachment {
      return {
        id,
        sessionId: 'session-1',
        kind: 'image' as const,
        mimeType: 'image/png',
        filename,
        sizeBytes: 1,
        storagePath: `/tmp/${id}.png`,
        thumbnailPath: null,
        textPreview: null,
        createdAt: '2026-04-13T10:00:00.000Z',
        ...overrides,
      }
    }

    it('renders inline previews for image attachments below the user message text', () => {
      const onOpen = vi.fn()
      const firstAttachment = makeAttachment('att-1', 'one.png')
      renderConversationItemView({
        entry: userEntry(),
        attachments: [firstAttachment, makeAttachment('att-2', 'two.png')],
        onAttachmentOpen: onOpen,
      })

      const previews = screen.getAllByTestId('attachment-inline-preview')
      expect(previews).toHaveLength(2)
      expect(screen.getByText('one.png')).toBeInTheDocument()
      expect(screen.getByText('two.png')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /Preview one\.png/ }))
      expect(onOpen).toHaveBeenCalledWith(firstAttachment)
    })

    it('renders chips for non-image resolved attachments below the user message text', () => {
      renderConversationItemView({
        entry: userEntry(),
        attachments: [
          makeAttachment('att-1', 'brief.pdf', {
            kind: 'pdf',
            mimeType: 'application/pdf',
            storagePath: '/tmp/att-1.pdf',
          }),
          makeAttachment('att-2', 'notes.txt', {
            kind: 'text',
            mimeType: 'text/plain',
            storagePath: '/tmp/att-2.txt',
            textPreview: 'notes',
          }),
        ],
        onAttachmentOpen: vi.fn(),
      })

      const chips = screen.getAllByTestId('attachment-chip')
      expect(chips).toHaveLength(2)
      expect(screen.getByText('brief.pdf')).toBeInTheDocument()
      expect(screen.getByText('notes.txt')).toBeInTheDocument()
    })

    it('renders broken-icon chips for missing attachment ids', () => {
      renderConversationItemView({
        entry: userEntry(),
        missingAttachmentIds: ['gone-1', 'gone-2'],
      })

      const missingChips = screen.getAllByTestId('missing-attachment-chip')
      expect(missingChips).toHaveLength(2)
      expect(missingChips[0]).toHaveAttribute('data-attachment-id', 'gone-1')
      expect(missingChips[1]).toHaveAttribute('data-attachment-id', 'gone-2')
    })

    it('renders both resolved and missing chips together', () => {
      renderConversationItemView({
        entry: userEntry(),
        attachments: [
          makeAttachment('att-1', 'kept.pdf', {
            kind: 'pdf',
            mimeType: 'application/pdf',
            storagePath: '/tmp/att-1.pdf',
          }),
        ],
        missingAttachmentIds: ['gone-1'],
        onAttachmentOpen: vi.fn(),
      })

      expect(screen.getAllByTestId('attachment-chip')).toHaveLength(1)
      expect(screen.getAllByTestId('missing-attachment-chip')).toHaveLength(1)
    })

    it('renders no chip row when there are no attachments and no missing ids', () => {
      renderConversationItemView({ entry: userEntry('hello') })
      expect(screen.queryByTestId('history-attachments')).toBeNull()
      expect(screen.queryByTestId('attachment-chip')).toBeNull()
      expect(screen.queryByTestId('missing-attachment-chip')).toBeNull()
    })

    it('does not render an X (remove) button on history chips', () => {
      renderConversationItemView({
        entry: userEntry(),
        attachments: [
          makeAttachment('att-1', 'kept.pdf', {
            kind: 'pdf',
            mimeType: 'application/pdf',
            storagePath: '/tmp/att-1.pdf',
          }),
        ],
        onAttachmentOpen: vi.fn(),
      })

      expect(
        screen.queryByRole('button', { name: /Remove kept\.pdf/ }),
      ).toBeNull()
    })
  })
})
