import { describe, expect, it } from 'vitest'
import { hasTokens, maskTokens, scrubStateJson } from './perf-seed.pure'

const fakeTokens = [
  `lin_api_${'L'.repeat(50)}`,
  `sk-${'S'.repeat(24)}`,
  `ghp_${'G'.repeat(30)}`,
  ...['a', 'b', 'p'].map((kind) => `xox${kind}-${'SLACK-'.repeat(5)}`),
  `cvg_${'C'.repeat(20)}`,
  `AKIA${'A'.repeat(16)}`,
  '-----BEGIN RSA PRIVATE KEY-----\nFAKEKEYMATERIAL\n-----END RSA PRIVATE KEY-----',
  `Authorization: Bearer ${'B'.repeat(20)}`,
  `github_pat_${'GH_'.repeat(12)}`,
  `glpat-${'GL-'.repeat(10)}`,
  ...['ant', 'or', 'proj'].map((kind) => `sk-${kind}-${'TEST_'.repeat(10)}`),
]

describe('perf seed pure helpers', () => {
  it('preserves SQLite text length for non-ASCII content inside a PEM block', () => {
    const input = '-----BEGIN PRIVATE KEY-----🙂-----END PRIVATE KEY-----'
    expect(maskTokens(input).value).toBe('x'.repeat([...input].length))
  })
  it.each(fakeTokens.map((token, index) => [index, token] as const))(
    'masks complete pattern %s at equal length',
    (_index, token) => {
      expect(maskTokens(token)).toEqual({
        value: 'x'.repeat(token.length),
        count: 1,
      })
      expect(hasTokens(token)).toBe(true)
      expect(hasTokens(maskTokens(token).value)).toBe(false)
    },
  )
  it('walks nested objects and arrays, including secret objects and prototype-shaped keys', () => {
    const input =
      '{"nested":[{"apiKey":{"value":"fake"},"PASSWORD":"fake","authorization":"fake","credential":"fake","secret":"fake","token":"fake","api-key":"fake","api_key":"fake"}],"__proto__":{"token":"fake"},"ordinary":42}'
    const output = scrubStateJson(input)
    expect(output).not.toContain('fake')
    expect(JSON.parse(output).ordinary).toBe(42)
    expect(JSON.parse(output).__proto__.token).toBe('<scrubbed>')
  })
  it('preserves non-JSON and untouched JSON formatting', () => {
    for (const value of ['not json', '{ "ordinary": 42 }', 'null', '12'])
      expect(scrubStateJson(value)).toBe(value)
  })
})
