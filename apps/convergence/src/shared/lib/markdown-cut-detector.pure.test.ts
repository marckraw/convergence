import { describe, it, expect } from 'vitest'
import {
  detectMarkdownCut,
  stripMarkdownSyntax,
} from './markdown-cut-detector.pure'

describe('stripMarkdownSyntax', () => {
  it('keeps plain prose intact', () => {
    expect(stripMarkdownSyntax('hello world')).toBe('hello world')
  })

  it('strips bold and italic markers', () => {
    expect(stripMarkdownSyntax('**bold** and _italic_')).toBe('bold and italic')
  })

  it('keeps link text, drops url', () => {
    expect(
      stripMarkdownSyntax('see [docs](https://example.com/long/url)'),
    ).toBe('see docs')
  })

  it('drops code fence language tag', () => {
    expect(stripMarkdownSyntax('```ts\nconst x = 1\n```')).toBe('const x = 1')
  })

  it('strips list bullets and headings', () => {
    expect(stripMarkdownSyntax('## Title\n- a\n- b\n1. c')).toBe('Title a b c')
  })
})

describe('detectMarkdownCut', () => {
  const longInput = 'lorem ipsum dolor sit amet '.repeat(20)

  it('reports no cut when rendered matches input', () => {
    const result = detectMarkdownCut({ input: longInput, rendered: longInput })
    expect(result.cut).toBe(false)
    expect(result.reason).toBeNull()
  })

  it('skips short inputs to avoid noise', () => {
    const result = detectMarkdownCut({ input: 'short text', rendered: '' })
    expect(result.cut).toBe(false)
  })

  it('flags tail-missing when rendered ends before input tail', () => {
    const input = `${'filler prose words go here. '.repeat(20)}SENTINEL_TAIL_PHRASE_NOT_IN_RENDERED`
    const rendered = 'filler prose words go here. '.repeat(20)
    const result = detectMarkdownCut({ input, rendered })
    expect(result.cut).toBe(true)
    expect(result.reason).toBe('tail-missing')
  })

  it('flags length-ratio when rendered is far shorter but tail aligns by coincidence', () => {
    const input = `${'filler '.repeat(100)}end`
    const rendered = 'end'
    const result = detectMarkdownCut({ input, rendered })
    expect(result.cut).toBe(true)
  })

  it('tolerates link-heavy content where urls dropped from textContent', () => {
    const links = Array.from(
      { length: 10 },
      (_, i) => `[link${i}](https://example.com/very/long/path/${i})`,
    ).join(' ')
    const input = `Here are some links: ${links}. ${'prose '.repeat(30)}`
    const rendered = stripMarkdownSyntax(input)
    const result = detectMarkdownCut({ input, rendered })
    expect(result.cut).toBe(false)
  })
})
