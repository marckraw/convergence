import { describe, expect, it } from 'vitest'
import {
  serializeBootBlock,
  serializeEveryTurnBlock,
  type SerializableProjectContextItem,
} from './project-context-serializer.pure'

const SLUG = 'my-repo'

const bootItem: SerializableProjectContextItem = {
  label: 'monorepo-api',
  body: 'See ~/work/monorepo-api for the API contract.',
  reinjectMode: 'boot',
}

const everyTurnItem: SerializableProjectContextItem = {
  label: 'lint-reminder',
  body: 'Always run `npm run lint` before claiming done.',
  reinjectMode: 'every-turn',
}

describe('serializeBootBlock', () => {
  it('returns null note and untouched text when no items are attached', () => {
    const result = serializeBootBlock({
      slug: SLUG,
      items: [],
      originalText: 'hello',
    })
    expect(result).toEqual({ note: null, augmentedText: 'hello' })
  })

  it('renders a single labelled section for one boot item', () => {
    const result = serializeBootBlock({
      slug: SLUG,
      items: [bootItem],
      originalText: 'hello',
    })
    expect(result.note).toBe(
      [
        '<my-repo:context>',
        'monorepo-api',
        'See ~/work/monorepo-api for the API contract.',
        '</my-repo:context>',
      ].join('\n'),
    )
    expect(result.augmentedText).toBe(`${result.note}\n\nhello`)
  })

  it('includes both boot and every-turn items in the boot block', () => {
    const result = serializeBootBlock({
      slug: SLUG,
      items: [bootItem, everyTurnItem],
      originalText: 'go',
    })
    expect(result.note).toContain('monorepo-api')
    expect(result.note).toContain('lint-reminder')
  })

  it('falls back to "untitled" for items without a label', () => {
    const result = serializeBootBlock({
      slug: SLUG,
      items: [{ label: null, body: 'note body', reinjectMode: 'boot' }],
      originalText: 'hi',
    })
    expect(result.note).toContain('untitled\nnote body')
  })

  it('treats whitespace-only labels as untitled', () => {
    const result = serializeBootBlock({
      slug: SLUG,
      items: [{ label: '   ', body: 'note body', reinjectMode: 'boot' }],
      originalText: 'hi',
    })
    expect(result.note).toContain('untitled\nnote body')
  })

  it('trims whitespace around bodies and labels', () => {
    const result = serializeBootBlock({
      slug: SLUG,
      items: [
        {
          label: '  spaced  ',
          body: '\n  body has padding  \n',
          reinjectMode: 'boot',
        },
      ],
      originalText: 'msg',
    })
    expect(result.note).toContain('spaced\nbody has padding')
    expect(result.note).not.toMatch(/ {2}spaced/)
  })

  it('uses the supplied slug in the wrapper tag', () => {
    const result = serializeBootBlock({
      slug: 'some-other-slug',
      items: [bootItem],
      originalText: 'msg',
    })
    expect(result.note).toMatch(/^<some-other-slug:context>/)
    expect(result.note).toMatch(/<\/some-other-slug:context>$/)
  })

  it('preserves the original text as the suffix after the block', () => {
    const result = serializeBootBlock({
      slug: SLUG,
      items: [bootItem],
      originalText: 'first user message',
    })
    expect(result.augmentedText.endsWith('first user message')).toBe(true)
  })
})

describe('serializeEveryTurnBlock', () => {
  it('returns the original text unchanged when no every-turn items exist', () => {
    expect(
      serializeEveryTurnBlock({
        slug: SLUG,
        items: [bootItem],
        originalText: 'hi',
      }),
    ).toBe('hi')
  })

  it('returns the original text unchanged when items are empty', () => {
    expect(
      serializeEveryTurnBlock({
        slug: SLUG,
        items: [],
        originalText: 'hi',
      }),
    ).toBe('hi')
  })

  it('prepends a block containing only every-turn items', () => {
    const result = serializeEveryTurnBlock({
      slug: SLUG,
      items: [bootItem, everyTurnItem],
      originalText: 'next message',
    })
    expect(result).toContain('lint-reminder')
    expect(result).not.toContain('monorepo-api')
    expect(result.endsWith('next message')).toBe(true)
  })

  it('uses the supplied slug in the wrapper tag', () => {
    const result = serializeEveryTurnBlock({
      slug: 'p-123',
      items: [everyTurnItem],
      originalText: 'msg',
    })
    expect(result.startsWith('<p-123:context>\n')).toBe(true)
    expect(result).toContain('</p-123:context>\n\nmsg')
  })
})
