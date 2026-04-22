import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ConversationItemView } from './transcript-entry.presentational'

describe('ConversationItemView', () => {
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
})
