import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TranscriptEntryView } from './transcript-entry.presentational'

describe('TranscriptEntryView', () => {
  it('renders assistant markdown with headings, lists, links, and code', () => {
    render(
      <TranscriptEntryView
        entry={{
          type: 'assistant',
          timestamp: '2026-04-13T10:00:00.000Z',
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
      <TranscriptEntryView
        entry={{
          type: 'tool-result',
          timestamp: '2026-04-13T10:00:00.000Z',
          result,
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
