import { describe, expect, it } from 'vitest'
import {
  normalizeProjectContextBody,
  normalizeProjectContextLabel,
} from './project-context.pure'

describe('normalizeProjectContextBody', () => {
  it('trims non-empty bodies', () => {
    expect(normalizeProjectContextBody('  Use this project context  ')).toBe(
      'Use this project context',
    )
  })

  it('rejects empty bodies', () => {
    expect(() => normalizeProjectContextBody('   ')).toThrow(
      'Project context item body cannot be empty',
    )
  })
})

describe('normalizeProjectContextLabel', () => {
  it('normalizes blank labels to null', () => {
    expect(normalizeProjectContextLabel(undefined)).toBeNull()
    expect(normalizeProjectContextLabel(null)).toBeNull()
    expect(normalizeProjectContextLabel('   ')).toBeNull()
  })

  it('trims labels', () => {
    expect(normalizeProjectContextLabel('  Architecture  ')).toBe(
      'Architecture',
    )
  })
})
