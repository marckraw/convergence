import { describe, expect, it } from 'vitest'
import { buildCodexUserInput } from './codex-message.pure'
import type { CodexMessagePart } from './codex-message.pure'

const IMG_PNG: CodexMessagePart = {
  kind: 'image',
  mimeType: 'image/png',
  filename: 'photo.png',
  storagePath: '/data/attachments/s1/a1.png',
}

const IMG_JPEG: CodexMessagePart = {
  kind: 'image',
  mimeType: 'image/jpeg',
  filename: 'sel.jpg',
  storagePath: '/data/attachments/s1/a2.jpg',
}

const TEXT_TS: CodexMessagePart = {
  kind: 'text',
  mimeType: 'text/x-typescript',
  filename: 'foo.ts',
  storagePath: '/data/attachments/s1/a3.ts',
  bytes: new TextEncoder().encode('export const x = 1'),
}

const PDF_DOC: CodexMessagePart = {
  kind: 'pdf',
  mimeType: 'application/pdf',
  filename: 'report.pdf',
  storagePath: '/data/attachments/s1/a4.pdf',
}

describe('buildCodexUserInput', () => {
  it('text-only produces a single text entry', () => {
    expect(buildCodexUserInput({ text: 'hello' })).toEqual([
      { type: 'text', text: 'hello', text_elements: [] },
    ])
  })

  it('emits an empty text entry even with no text and no parts', () => {
    expect(buildCodexUserInput({ text: '' })).toEqual([
      { type: 'text', text: '', text_elements: [] },
    ])
  })

  it('single image becomes localImage; user text comes after', () => {
    const out = buildCodexUserInput({
      text: 'what do you see',
      parts: [IMG_PNG],
    })
    expect(out).toEqual([
      { type: 'localImage', path: IMG_PNG.storagePath },
      { type: 'text', text: 'what do you see', text_elements: [] },
    ])
  })

  it('multiple images listed before the text entry', () => {
    const out = buildCodexUserInput({
      text: 'compare',
      parts: [IMG_PNG, IMG_JPEG],
    })
    expect(out.map((e) => e.type)).toEqual(['localImage', 'localImage', 'text'])
  })

  it('inlines text attachments into the text entry before user text', () => {
    const [first] = buildCodexUserInput({
      text: 'please review',
      parts: [TEXT_TS],
    })
    expect(first.type).toBe('text')
    if (first.type !== 'text') throw new Error()
    expect(first.text).toBe(
      '<file path="foo.ts">\nexport const x = 1\n</file>\n\nplease review',
    )
  })

  it('mixed image + text: images first, then single text entry with inlined files + user text', () => {
    const out = buildCodexUserInput({
      text: 'summarize',
      parts: [IMG_PNG, TEXT_TS],
    })
    expect(out.length).toBe(2)
    expect(out[0].type).toBe('localImage')
    const second = out[1]
    if (second.type !== 'text') throw new Error()
    expect(second.text).toContain('<file path="foo.ts">')
    expect(second.text.endsWith('summarize')).toBe(true)
  })

  it('appends selected skills as structured input and provider-only text markers', () => {
    const out = buildCodexUserInput({
      text: 'review the plan',
      skills: [
        {
          name: 'planning',
          path: '/skills/planning/SKILL.md',
        },
      ],
    })

    expect(out).toEqual([
      {
        type: 'text',
        text: '$planning\n\nreview the plan',
        text_elements: [],
      },
      {
        type: 'skill',
        name: 'planning',
        path: '/skills/planning/SKILL.md',
      },
    ])
  })

  it('keeps images first, text second, and skills last', () => {
    const out = buildCodexUserInput({
      text: 'summarize',
      parts: [IMG_PNG, TEXT_TS],
      skills: [{ name: 'planning', path: '/skills/planning/SKILL.md' }],
    })

    expect(out.map((entry) => entry.type)).toEqual([
      'localImage',
      'text',
      'skill',
    ])
    const text = out[1]
    if (text.type !== 'text') throw new Error()
    expect(text.text).toContain('<file path="foo.ts">')
    expect(text.text).toContain('$planning')
    expect(text.text.endsWith('summarize')).toBe(true)
  })

  it('image-only with empty user text omits the text entry', () => {
    const out = buildCodexUserInput({ text: '', parts: [IMG_PNG] })
    expect(out).toEqual([{ type: 'localImage', path: IMG_PNG.storagePath }])
  })

  it('throws when a PDF slips through', () => {
    expect(() =>
      buildCodexUserInput({ text: 'read', parts: [PDF_DOC] }),
    ).toThrow(/Codex does not support PDF/)
  })
})
