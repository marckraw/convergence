import { describe, expect, it } from 'vitest'
import {
  buildClaudeUserMessage,
  buildClaudeUserMessageLine,
} from './claude-code-message.pure'
import type { ClaudeMessagePart } from './claude-code-message.pure'

function bytesOf(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

const IMG_PNG: ClaudeMessagePart = {
  kind: 'image',
  mimeType: 'image/png',
  filename: 'photo.png',
  bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
}

const IMG_JPEG: ClaudeMessagePart = {
  kind: 'image',
  mimeType: 'image/jpeg',
  filename: 'sel.jpg',
  bytes: new Uint8Array([0xff, 0xd8, 0xff]),
}

const PDF_DOC: ClaudeMessagePart = {
  kind: 'pdf',
  mimeType: 'application/pdf',
  filename: 'report.pdf',
  bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
}

const TEXT_TS: ClaudeMessagePart = {
  kind: 'text',
  mimeType: 'text/x-typescript',
  filename: 'foo.ts',
  bytes: bytesOf('export const x = 1'),
}

describe('buildClaudeUserMessage', () => {
  it('text-only produces a single text block', () => {
    const msg = buildClaudeUserMessage({ text: 'hello' })
    expect(msg.type).toBe('user')
    expect(msg.message.role).toBe('user')
    expect(msg.message.content).toEqual([{ type: 'text', text: 'hello' }])
  })

  it('emits a text block even with empty input and no parts', () => {
    const msg = buildClaudeUserMessage({ text: '' })
    expect(msg.message.content).toEqual([{ type: 'text', text: '' }])
  })

  it('single image comes first, followed by text', () => {
    const msg = buildClaudeUserMessage({
      text: 'look at this',
      parts: [IMG_PNG],
    })
    expect(msg.message.content.length).toBe(2)
    expect(msg.message.content[0].type).toBe('image')
    expect(msg.message.content[1]).toEqual({
      type: 'text',
      text: 'look at this',
    })
  })

  it('encodes image bytes as base64', () => {
    const msg = buildClaudeUserMessage({
      text: 'x',
      parts: [IMG_PNG],
    })
    const [first] = msg.message.content
    if (first.type !== 'image') throw new Error('expected image block')
    expect(first.source.type).toBe('base64')
    expect(first.source.media_type).toBe('image/png')
    expect(first.source.data).toBe(
      Buffer.from(IMG_PNG.bytes).toString('base64'),
    )
  })

  it('orders all images, then all documents, then a text block', () => {
    const msg = buildClaudeUserMessage({
      text: 'review',
      parts: [TEXT_TS, PDF_DOC, IMG_PNG, IMG_JPEG],
    })
    const types = msg.message.content.map((b) => b.type)
    expect(types).toEqual(['image', 'image', 'document', 'text'])
  })

  it('inlines text attachments in the text block before the user text', () => {
    const msg = buildClaudeUserMessage({
      text: 'please review',
      parts: [TEXT_TS],
    })
    const [textBlock] = msg.message.content
    if (textBlock.type !== 'text') throw new Error('expected text block')
    expect(textBlock.text).toBe(
      '<file path="foo.ts">\nexport const x = 1\n</file>\n\nplease review',
    )
  })

  it('attachments-only (no user text) still produces an inlined text block from files', () => {
    const msg = buildClaudeUserMessage({
      text: '',
      parts: [TEXT_TS],
    })
    const textBlock = msg.message.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') throw new Error()
    expect(textBlock.text).toBe(
      '<file path="foo.ts">\nexport const x = 1\n</file>',
    )
  })

  it('image-only with empty user text omits the final text block', () => {
    const msg = buildClaudeUserMessage({ text: '', parts: [IMG_PNG] })
    expect(msg.message.content.length).toBe(1)
    expect(msg.message.content[0].type).toBe('image')
  })

  it('pdf+text produces document block + inlined text', () => {
    const msg = buildClaudeUserMessage({
      text: 'summarize',
      parts: [PDF_DOC, TEXT_TS],
    })
    const types = msg.message.content.map((b) => b.type)
    expect(types).toEqual(['document', 'text'])
    const textBlock = msg.message.content[1]
    if (textBlock.type !== 'text') throw new Error()
    expect(textBlock.text).toContain('<file path="foo.ts">')
    expect(textBlock.text).toContain('summarize')
  })
})

describe('buildClaudeUserMessageLine', () => {
  it('returns a single JSON line (no newlines)', () => {
    const line = buildClaudeUserMessageLine({ text: 'hello' })
    expect(line.includes('\n')).toBe(false)
    expect(JSON.parse(line).type).toBe('user')
  })
})
