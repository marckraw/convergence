import { describe, expect, it } from 'vitest'
import {
  filterContextMentions,
  type MentionableItem,
} from './project-context-mention.pure'

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
