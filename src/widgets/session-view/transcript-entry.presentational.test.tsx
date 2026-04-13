import { render, screen } from '@testing-library/react'
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
})
