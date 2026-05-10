import { describe, expect, it } from 'vitest'
import {
  artifactFromConversationItem,
  buildUiResponseSrcDoc,
  parseAssistantUiResponse,
  validateUiResponseHtml,
} from './ui-response-artifact.pure'

describe('parseAssistantUiResponse', () => {
  it('returns the original markdown when no artifact is present', () => {
    expect(parseAssistantUiResponse('Regular **Markdown** answer.')).toEqual({
      markdown: 'Regular **Markdown** answer.',
      artifact: null,
    })
  })

  it('extracts one standalone HTML artifact and removes it from markdown', () => {
    const parsed = parseAssistantUiResponse(
      [
        'Here is the answer.',
        '',
        '```convergence-ui-html',
        '<!doctype html>',
        '<html><body><h1>Hello</h1></body></html>',
        '```',
        '',
        'More Markdown.',
      ].join('\n'),
    )

    expect(parsed.markdown).toBe('Here is the answer.\n\nMore Markdown.')
    expect(parsed.artifact).toEqual({
      title: 'UI response',
      html: '<!doctype html>\n<html><body><h1>Hello</h1></body></html>',
    })
  })

  it('reads a title from frontmatter metadata', () => {
    const parsed = parseAssistantUiResponse(
      [
        'Summary.',
        '',
        '```convergence-ui-html',
        '---',
        'title: "Dependency graph"',
        '---',
        '<main>Graph</main>',
        '```',
      ].join('\n'),
    )

    expect(parsed.artifact?.title).toBe('Dependency graph')
    expect(parsed.artifact?.html).toBe('<main>Graph</main>')
  })

  it('leaves malformed unclosed artifact fences in markdown', () => {
    const text = [
      'Summary.',
      '',
      '```convergence-ui-html',
      '<main>Missing close</main>',
    ].join('\n')

    expect(parseAssistantUiResponse(text)).toEqual({
      markdown: text,
      artifact: null,
    })
  })
})

describe('artifactFromConversationItem', () => {
  it('builds a renderer artifact keyed by conversation item id', () => {
    const artifact = artifactFromConversationItem({
      sessionId: 'session-1',
      conversationItemId: 'item-1',
      text: [
        'Answer.',
        '',
        '```convergence-ui-html',
        '<main>Preview</main>',
        '```',
      ].join('\n'),
      createdAt: '2026-05-10T00:00:00.000Z',
    })

    expect(artifact).toEqual({
      id: 'item-1:ui-response',
      sessionId: 'session-1',
      conversationItemId: 'item-1',
      title: 'UI response',
      kind: 'html',
      html: '<main>Preview</main>',
      createdAt: '2026-05-10T00:00:00.000Z',
    })
  })
})

describe('buildUiResponseSrcDoc', () => {
  it('injects a restrictive CSP meta tag into full HTML documents', () => {
    const srcDoc = buildUiResponseSrcDoc(
      '<!doctype html><html><head><title>x</title></head><body></body></html>',
    )

    expect(srcDoc).toContain('Content-Security-Policy')
    expect(srcDoc).toContain("default-src 'none'")
    expect(srcDoc).toContain("connect-src 'none'")
    expect(srcDoc).toContain('<head><meta')
  })

  it('wraps HTML fragments in a document with CSP', () => {
    const srcDoc = buildUiResponseSrcDoc('<main>Preview</main>')

    expect(srcDoc).toContain('<!doctype html>')
    expect(srcDoc).toContain('<body><main>Preview</main></body>')
    expect(srcDoc).toContain('Content-Security-Policy')
  })
})

describe('validateUiResponseHtml', () => {
  it('accepts balanced standalone HTML documents and fragments', () => {
    expect(
      validateUiResponseHtml(
        '<!doctype html><html><head><meta charset="utf-8"></head><body><main>Preview</main></body></html>',
      ),
    ).toEqual({ status: 'valid' })
    expect(validateUiResponseHtml('<main>Preview</main>')).toEqual({
      status: 'valid',
    })
  })

  it('returns an empty state for blank artifacts', () => {
    expect(validateUiResponseHtml('   ')).toEqual({
      status: 'empty',
      message: 'The UI response artifact did not include any HTML.',
    })
  })

  it('returns a malformed state for incomplete tags', () => {
    expect(validateUiResponseHtml('<main><section>Preview</main>')).toEqual({
      status: 'malformed',
      message:
        'The UI response artifact closes </main> before closing <section>.',
    })
    expect(validateUiResponseHtml('<main')).toEqual({
      status: 'malformed',
      message: 'The UI response artifact contains an unterminated HTML tag.',
    })
  })
})
