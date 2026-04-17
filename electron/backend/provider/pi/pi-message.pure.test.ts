import { describe, expect, it } from 'vitest'
import { buildPiPromptPayload } from './pi-message.pure'
import type { PiMessagePart } from './pi-message.pure'

const IMG_PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

const IMG_PNG: PiMessagePart = {
  kind: 'image',
  mimeType: 'image/png',
  filename: 'photo.png',
  storagePath: '/data/attachments/s1/a1.png',
  bytes: IMG_PNG_BYTES,
}

const IMG_JPEG: PiMessagePart = {
  kind: 'image',
  mimeType: 'image/jpeg',
  filename: 'sel.jpg',
  storagePath: '/data/attachments/s1/a2.jpg',
  bytes: new Uint8Array([0xff, 0xd8, 0xff]),
}

const TEXT_TS: PiMessagePart = {
  kind: 'text',
  mimeType: 'text/x-typescript',
  filename: 'foo.ts',
  storagePath: '/data/attachments/s1/a3.ts',
  bytes: new TextEncoder().encode('export const x = 1'),
}

const PDF_DOC: PiMessagePart = {
  kind: 'pdf',
  mimeType: 'application/pdf',
  filename: 'report.pdf',
  storagePath: '/data/attachments/s1/a4.pdf',
}

describe('buildPiPromptPayload', () => {
  it('text-only returns message with no images field', () => {
    expect(buildPiPromptPayload({ text: 'hello' })).toEqual({
      message: 'hello',
    })
  })

  it('empty text and no parts yields empty message', () => {
    expect(buildPiPromptPayload({ text: '' })).toEqual({ message: '' })
  })

  it('image becomes base64 entry in images[] with mimeType', () => {
    const out = buildPiPromptPayload({
      text: 'describe',
      parts: [IMG_PNG],
    })
    expect(out.message).toBe('describe')
    expect(out.images).toEqual([
      {
        type: 'image',
        data: Buffer.from(IMG_PNG_BYTES).toString('base64'),
        mimeType: 'image/png',
      },
    ])
  })

  it('multiple images preserve order', () => {
    const out = buildPiPromptPayload({
      text: 'compare',
      parts: [IMG_PNG, IMG_JPEG],
    })
    expect(out.images?.map((i) => i.mimeType)).toEqual([
      'image/png',
      'image/jpeg',
    ])
  })

  it('inlines text attachments into message before user text', () => {
    const out = buildPiPromptPayload({
      text: 'please review',
      parts: [TEXT_TS],
    })
    expect(out.message).toBe(
      '<file path="foo.ts">\nexport const x = 1\n</file>\n\nplease review',
    )
    expect(out.images).toBeUndefined()
  })

  it('mixed: text files inline in message, images in images[]', () => {
    const out = buildPiPromptPayload({
      text: 'summarize',
      parts: [IMG_PNG, TEXT_TS],
    })
    expect(out.message).toContain('<file path="foo.ts">')
    expect(out.message.endsWith('summarize')).toBe(true)
    expect(out.images).toHaveLength(1)
    expect(out.images?.[0].mimeType).toBe('image/png')
  })

  it('image-only with empty text yields empty message and images', () => {
    const out = buildPiPromptPayload({ text: '', parts: [IMG_PNG] })
    expect(out.message).toBe('')
    expect(out.images).toHaveLength(1)
  })

  it('omits images field when there are no image parts', () => {
    const out = buildPiPromptPayload({ text: 'hi', parts: [TEXT_TS] })
    expect('images' in out).toBe(false)
  })

  it('throws on PDF', () => {
    expect(() =>
      buildPiPromptPayload({ text: 'read', parts: [PDF_DOC] }),
    ).toThrow(/Pi does not support PDF/)
  })

  it('throws if an image part arrives without bytes', () => {
    expect(() =>
      buildPiPromptPayload({
        text: 'x',
        parts: [{ ...IMG_PNG, bytes: undefined }],
      }),
    ).toThrow(/missing bytes/)
  })
})
