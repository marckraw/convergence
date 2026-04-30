import { describe, expect, it } from 'vitest'
import {
  applyMentionExpansion,
  detectMentionTrigger,
  filterContextMentions,
  type MentionableItem,
} from './project-context-mention.pure'

describe('detectMentionTrigger', () => {
  it('opens with empty query when text is just "::"', () => {
    const result = detectMentionTrigger('::', 2)
    expect(result).toEqual({
      open: true,
      query: '',
      range: { start: 0, end: 2 },
    })
  })

  it('opens with a partial query as the user types after "::"', () => {
    const result = detectMentionTrigger('::foo', 5)
    expect(result).toEqual({
      open: true,
      query: 'foo',
      range: { start: 0, end: 5 },
    })
  })

  it('opens after whitespace boundary (e.g. mid-message)', () => {
    const text = 'hi ::bar'
    const result = detectMentionTrigger(text, text.length)
    expect(result).toEqual({
      open: true,
      query: 'bar',
      range: { start: 3, end: 8 },
    })
  })

  it('does NOT open for mid-word "::" (no whitespace before)', () => {
    expect(detectMentionTrigger('foo::bar', 8)).toEqual({ open: false })
  })

  it('does NOT open for triple-colon ":::"', () => {
    expect(detectMentionTrigger(':::', 3)).toEqual({ open: false })
    expect(detectMentionTrigger(':::foo', 6)).toEqual({ open: false })
  })

  it('closes once the cursor moves past whitespace following the query', () => {
    const text = '::foo bar'
    expect(detectMentionTrigger(text, text.length)).toEqual({ open: false })
  })

  it('closes when the cursor is before any "::" has been typed', () => {
    expect(detectMentionTrigger('', 0)).toEqual({ open: false })
    expect(detectMentionTrigger('a', 1)).toEqual({ open: false })
    expect(detectMentionTrigger(':', 1)).toEqual({ open: false })
  })

  it('handles cursor positioned before the trigger end', () => {
    expect(detectMentionTrigger('::foo', 3)).toEqual({
      open: true,
      query: 'f',
      range: { start: 0, end: 3 },
    })
  })

  it('does not open when "::" is preceded by non-whitespace', () => {
    expect(detectMentionTrigger('hi::bar', 7)).toEqual({ open: false })
    expect(detectMentionTrigger('a::', 3)).toEqual({ open: false })
  })
})

describe('applyMentionExpansion', () => {
  it('replaces the trigger range with the body and returns the new cursor', () => {
    const result = applyMentionExpansion('::foo', { start: 0, end: 5 }, 'BODY')
    expect(result.text).toBe('BODY')
    expect(result.cursor).toBe(4)
  })

  it('preserves text before and after the range', () => {
    const result = applyMentionExpansion(
      'hi ::foo bar',
      { start: 3, end: 8 },
      'EXPANDED',
    )
    expect(result.text).toBe('hi EXPANDED bar')
    expect(result.cursor).toBe(3 + 'EXPANDED'.length)
  })

  it('handles empty body insertion', () => {
    const result = applyMentionExpansion(
      'hi ::foo bar',
      { start: 3, end: 8 },
      '',
    )
    expect(result.text).toBe('hi  bar')
    expect(result.cursor).toBe(3)
  })
})

describe('filterContextMentions', () => {
  const items: MentionableItem[] = [
    { id: '1', label: 'Banana repo' },
    { id: '2', label: 'apple repo' },
    { id: '3', label: null },
    { id: '4', label: 'apricot notes' },
  ]

  it('returns all items alphabetically when query is empty', () => {
    const result = filterContextMentions(items, '')
    expect(result.map((i) => i.id)).toEqual(['2', '4', '1', '3'])
  })

  it('filters by case-insensitive label substring', () => {
    const result = filterContextMentions(items, 'REPO')
    expect(result.map((i) => i.id)).toEqual(['2', '1'])
  })

  it('orders prefix matches before non-prefix matches', () => {
    const result = filterContextMentions(items, 'ap')
    expect(result.map((i) => i.id)).toEqual(['2', '4'])
  })

  it('treats null label as "untitled" for matching', () => {
    const result = filterContextMentions(items, 'untitled')
    expect(result.map((i) => i.id)).toEqual(['3'])
  })

  it('excludes items whose label does not match', () => {
    expect(filterContextMentions(items, 'xyz')).toEqual([])
  })
})
