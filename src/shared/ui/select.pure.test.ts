import { describe, expect, it } from 'vitest'
import {
  SELECT_EMPTY_VALUE,
  fromSelectValue,
  toSelectValue,
} from './select.pure'

describe('select value helpers', () => {
  it('maps empty strings to and from the sentinel value', () => {
    expect(toSelectValue('')).toBe(SELECT_EMPTY_VALUE)
    expect(fromSelectValue(SELECT_EMPTY_VALUE)).toBe('')
    expect(toSelectValue('session-1')).toBe('session-1')
    expect(fromSelectValue('session-1')).toBe('session-1')
  })
})
