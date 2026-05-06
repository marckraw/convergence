import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MarkdownPresentational } from './markdown.presentational'

describe('MarkdownPresentational', () => {
  it('renders paragraphs with the compact spacing class for size="sm"', () => {
    const { container } = render(
      <MarkdownPresentational content="Hello world." size="sm" />,
    )
    const paragraph = container.querySelector('p')
    expect(paragraph).not.toBeNull()
    expect(paragraph?.className).toMatch(/my-2/)
    expect(paragraph?.className).toMatch(/text-xs/)
  })

  it('renders paragraphs with the standard spacing class for size="md"', () => {
    const { container } = render(
      <MarkdownPresentational content="Hello world." size="md" />,
    )
    const paragraph = container.querySelector('p')
    expect(paragraph).not.toBeNull()
    expect(paragraph?.className).toMatch(/my-3/)
    expect(paragraph?.className).toMatch(/text-sm/)
  })

  it('renders inline code with the pill chrome', () => {
    const { container } = render(
      <MarkdownPresentational content="Use the `npm install` command." />,
    )
    const code = container.querySelector('code')
    expect(code?.textContent).toBe('npm install')
    expect(code?.className).toMatch(/rounded-md/)
    expect(code?.className).toMatch(/border/)
  })

  it('renders fenced code blocks via Streamdown defaults so plugins can fire', () => {
    const content = ['```ts', 'const x = 1', '```'].join('\n')
    const { container } = render(<MarkdownPresentational content={content} />)
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    expect(pre?.textContent).toContain('const x = 1')
  })

  it('renders GFM tables inside the scroll wrapper', () => {
    const content = ['| col |', '| --- |', '| one |', '| two |'].join('\n')
    render(<MarkdownPresentational content={content} />)
    const table = screen.getByRole('table')
    expect(table).toBeInTheDocument()
    expect(table.parentElement?.className).toMatch(/overflow-x-auto/)
  })

  it('renders GFM strikethrough', () => {
    const { container } = render(
      <MarkdownPresentational content="This is ~~obsolete~~ now." />,
    )
    expect(container.querySelector('del')?.textContent).toBe('obsolete')
  })

  it('does not crash when given a mermaid fenced block', () => {
    const content = ['```mermaid', 'flowchart TD', '  A --> B', '```'].join(
      '\n',
    )
    expect(() =>
      render(<MarkdownPresentational content={content} />),
    ).not.toThrow()
  })
})
