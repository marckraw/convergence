import { describe, expect, it } from 'vitest'
import {
  createTokenMasker,
  hasTokens,
  maskTokens,
  scrubStateJson,
} from './perf-seed.pure'

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
  `npm_${'N'.repeat(36)}`,
  `xai-${'X'.repeat(24)}`,
  ...['o', 'u', 's', 'r'].map((kind) => `gh${kind}_${'G'.repeat(24)}`),
  `AIza${'A_-'.repeat(11)}AA`,
  `hf_${'H'.repeat(24)}`,
  `gsk_${'G'.repeat(24)}`,
  ...['sk', 'rk'].map((kind) => `${kind}_live_${'L'.repeat(24)}`),
]

describe('perf seed pure helpers', () => {
  it('preserves SQLite text length for non-ASCII content inside a PEM block', () => {
    const input = '-----BEGIN PRIVATE KEY-----🙂-----END PRIVATE KEY-----'
    expect([...maskTokens(input).value]).toHaveLength([...input].length)
  })
  it.each(fakeTokens.map((token, index) => [index, token] as const))(
    'masks complete pattern %s at equal length',
    (_index, token) => {
      const masked = maskTokens(token)
      expect(masked.count).toBe(1)
      expect([...masked.value]).toHaveLength([...token].length)
      for (const char of masked.value) expect(token).not.toContain(char)
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
  it('masks secret JSON strings in arbitrary text, respecting escapes and raw length', () => {
    const input = String.raw`prefix { "apiKey": "plainrandomvalue123", "env": {"MY_SECRET": "quote\"slash\\newline\nunicode\u1234🙂"}, "api\u005fkey": "escaped-key", "max_tokens": 4096, "input_tokens": 12, "secret": false, "token": null, "text": "ordinary" } suffix`
    const masker = createTokenMasker()
    masker.reserve(input)
    const output = masker.maskTokens(input)
    expect(output.count).toBe(3)
    expect([...output.value]).toHaveLength([...input].length)
    const parsed = JSON.parse(output.value.slice(7, -7))
    expect(parsed.apiKey).toHaveLength('plainrandomvalue123'.length)
    expect(parsed.env.MY_SECRET).not.toContain('quote')
    expect(parsed.api_key).toHaveLength(11)
    expect(parsed.max_tokens).toBe(4096)
    expect(parsed.input_tokens).toBe(12)
    expect(parsed.secret).toBe(false)
    expect(parsed.token).toBeNull()
    expect(parsed.text).toBe('ordinary')
    expect(hasTokens(input)).toBe(true)
    expect(masker.hasTokens(output.value)).toBe(false)
    expect(hasTokens(output.value)).toBe(true)
  })
  it('does not treat escaped key-like prose inside a JSON string as an object key', () => {
    const input = JSON.stringify({ text: 'say "apiKey": "ordinary prose"' })
    expect(maskTokens(input)).toEqual({ value: input, count: 0 })
    expect(hasTokens(input)).toBe(false)
  })
  it('leaves numeric, boolean and null secret-keyed app state values untouched', () => {
    const input =
      '{"max_tokens":4096,"input_tokens":12,"secret":false,"token":null}'
    expect(scrubStateJson(input)).toBe(input)
  })
  it('maps equal originals equally across raw and JSON matches, and distinct originals distinctly', () => {
    const masker = createTokenMasker()
    const originals = Array.from(
      { length: 200 },
      (_, index) => `ghp_${String(index).padStart(30, '0')}`,
    )
    for (const original of originals) masker.reserve(original)
    const outputs = originals.map(
      (original) => masker.maskTokens(original).value,
    )
    expect(new Set(outputs).size).toBe(originals.length)
    originals.forEach((original, index) => {
      expect(masker.maskTokens(original).value).toBe(outputs[index])
      const json = masker.maskTokens(JSON.stringify({ token: original })).value
      expect(JSON.parse(json).token).toBe(outputs[index])
      expect(masker.hasTokens(json)).toBe(false)
      expect(masker.hasTokens(JSON.stringify({ token: original }))).toBe(true)
    })
  })
  it('rejects unissued filler-looking values and reserves originals before allocating masks', () => {
    const masker = createTokenMasker()
    const input = JSON.stringify({ token: 'a', secret: '!', password: 'x' })
    masker.reserve(input)
    const output = masker.maskTokens(input).value
    expect(masker.hasTokens(output)).toBe(false)
    for (const original of ['a', '!', 'x']) {
      expect(Object.values(JSON.parse(output))).not.toContain(original)
      expect(masker.hasTokens(JSON.stringify({ token: original }))).toBe(true)
    }
    expect(masker.hasTokens('{"token":"xxxxxxxx"}')).toBe(true)
    expect(createTokenMasker().hasTokens(output)).toBe(true)
  })
  it('keeps many one-character JSON secrets distinct after ASCII filler space runs out', () => {
    const masker = createTokenMasker()
    const inputs = Array.from({ length: 100 }, (_, index) =>
      JSON.stringify({ token: String.fromCodePoint(0x100 + index) }),
    )
    inputs.forEach(masker.reserve)
    const outputs = inputs.map((input) => masker.maskTokens(input).value)
    expect(new Set(outputs).size).toBe(inputs.length)
    for (const output of outputs) {
      expect([...JSON.parse(output).token]).toHaveLength(1)
      expect(masker.hasTokens(output)).toBe(false)
    }
  })
})
