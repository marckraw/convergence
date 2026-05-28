import { describe, expect, it } from 'vitest'
import { stripEnvFileQuotes } from './env-file.pure'

describe('stripEnvFileQuotes', () => {
  it('strips matching single or double quotes', () => {
    expect(stripEnvFileQuotes('"abc"')).toBe('abc')
    expect(stripEnvFileQuotes("'abc'")).toBe('abc')
  })

  it('keeps unquoted or unmatched values unchanged', () => {
    expect(stripEnvFileQuotes('abc')).toBe('abc')
    expect(stripEnvFileQuotes('"abc')).toBe('"abc')
    expect(stripEnvFileQuotes('\'abc"')).toBe('\'abc"')
  })
})
