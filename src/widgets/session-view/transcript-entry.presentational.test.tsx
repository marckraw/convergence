import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConversationItemView } from './transcript-entry.presentational'

describe('ConversationItemView', () => {
  it('renders selected skills on user messages', () => {
    render(
      <ConversationItemView
        entry={{
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
        }}
      />,
    )

    expect(screen.getByText('Planning')).toBeInTheDocument()
    expect(screen.getByText('selected')).toBeInTheDocument()
    expect(screen.getByTestId('message-skill-selections')).toBeInTheDocument()
  })

  it('renders assistant markdown with headings, lists, links, and code', () => {
    render(
      <ConversationItemView
        entry={{
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
        }}
      />,
    )

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
  })

  it('collapses tool results by default and expands inline on demand', () => {
    const result = [
      '/bin/zsh -lc "sed -n 1,20p app.tsx"',
      'line 1',
      'line 2',
    ].join('\n')

    render(
      <ConversationItemView
        entry={{
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
        }}
      />,
    )

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
      render(
        <ConversationItemView
          entry={{
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
          }}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Copy' }))

      await waitFor(() => expect(writeText).toHaveBeenCalledWith(markdown))
    })

    it('copies the raw outputText for tool-result items', async () => {
      const output = 'line 1\nline 2'
      render(
        <ConversationItemView
          entry={{
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
          }}
        />,
      )

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

    function makeAttachment(id: string, filename: string) {
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
      }
    }

    it('renders chips for resolved attachments below the user message text', () => {
      const onOpen = vi.fn()
      render(
        <ConversationItemView
          entry={userEntry()}
          attachments={[
            makeAttachment('att-1', 'one.png'),
            makeAttachment('att-2', 'two.png'),
          ]}
          onAttachmentOpen={onOpen}
        />,
      )

      const chips = screen.getAllByTestId('attachment-chip')
      expect(chips).toHaveLength(2)
      expect(screen.getByText('one.png')).toBeInTheDocument()
      expect(screen.getByText('two.png')).toBeInTheDocument()
    })

    it('renders broken-icon chips for missing attachment ids', () => {
      render(
        <ConversationItemView
          entry={userEntry()}
          missingAttachmentIds={['gone-1', 'gone-2']}
        />,
      )

      const missingChips = screen.getAllByTestId('missing-attachment-chip')
      expect(missingChips).toHaveLength(2)
      expect(missingChips[0]).toHaveAttribute('data-attachment-id', 'gone-1')
      expect(missingChips[1]).toHaveAttribute('data-attachment-id', 'gone-2')
    })

    it('renders both resolved and missing chips together', () => {
      render(
        <ConversationItemView
          entry={userEntry()}
          attachments={[makeAttachment('att-1', 'kept.png')]}
          missingAttachmentIds={['gone-1']}
          onAttachmentOpen={vi.fn()}
        />,
      )

      expect(screen.getAllByTestId('attachment-chip')).toHaveLength(1)
      expect(screen.getAllByTestId('missing-attachment-chip')).toHaveLength(1)
    })

    it('renders no chip row when there are no attachments and no missing ids', () => {
      render(<ConversationItemView entry={userEntry('hello')} />)
      expect(screen.queryByTestId('history-attachments')).toBeNull()
      expect(screen.queryByTestId('attachment-chip')).toBeNull()
      expect(screen.queryByTestId('missing-attachment-chip')).toBeNull()
    })

    it('does not render an X (remove) button on history chips', () => {
      render(
        <ConversationItemView
          entry={userEntry()}
          attachments={[makeAttachment('att-1', 'kept.png')]}
          onAttachmentOpen={vi.fn()}
        />,
      )

      expect(
        screen.queryByRole('button', { name: /Remove kept\.png/ }),
      ).toBeNull()
    })
  })
})
