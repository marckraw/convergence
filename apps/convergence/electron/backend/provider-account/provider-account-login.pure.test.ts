import { describe, expect, it } from 'vitest'
import {
  classifyProviderLoginFailure,
  isProviderLoginUrl,
  readProviderLoginProgress,
  validateProviderLoginCode,
} from './provider-account-login.pure'

describe('provider login progress', () => {
  it('extracts only the selected vendor authorization URL and a code prompt', () => {
    const url =
      'https://claude.com/cai/oauth/authorize?state=fixture&code_challenge=fixture'
    expect(
      readProviderLoginProgress(
        `Opening browser\n${url}\nPaste the authorization code here: `,
        'claude-code',
      ),
    ).toEqual({ authorizationUrl: url, needsCode: true })
    expect(
      readProviderLoginProgress(
        'https://auth.openai.com/oauth/authorize?state=fixture\n',
        'codex',
      ),
    ).toEqual({
      authorizationUrl: 'https://auth.openai.com/oauth/authorize?state=fixture',
      needsCode: false,
    })
  })
  it('never publishes a partial URL or an incomplete ANSI reset between chunks', () => {
    const url =
      'https://claude.com/cai/oauth/authorize?state=fixture&login_hint=fixture%40example.invalid'
    const output = `\u001b[32m${url}\u001b[39m\r\n`
    for (let end = 1; end < output.indexOf('\r') + 1; end += 1) {
      expect(
        readProviderLoginProgress(output.slice(0, end), 'claude-code')
          .authorizationUrl,
      ).toBeNull()
    }
    expect(
      readProviderLoginProgress(output, 'claude-code').authorizationUrl,
    ).toBe(url)
  })
  it.each([
    'javascript:alert(1)',
    'http://claude.com/cai/oauth/authorize',
    'https://claude.com.evil.test/cai/oauth/authorize',
    'https://user@claude.com/cai/oauth/authorize',
    'https://claude.com:444/cai/oauth/authorize',
    'https://claude.com/download',
    'https://auth.openai.com/oauth/authorize',
  ])('refuses unrelated or unsafe Claude link %s', (url) => {
    expect(isProviderLoginUrl(url, 'claude-code')).toBe(false)
  })
  it('does not turn terminal errors, tokens or URL query text into display prose', () => {
    expect(
      readProviderLoginProgress(
        'token=secret-fixture\nhttps://evil.test/?enter=code\nERROR password=secret-fixture',
        'claude-code',
      ),
    ).toEqual({ authorizationUrl: null, needsCode: false })
    expect(
      classifyProviderLoginFailure(new Error('token=secret-fixture')).message,
    ).not.toContain('secret-fixture')
  })
})

it.each(['', 'a\nb', 'a\rb', 'a\u001bb', 'a b', 'x'.repeat(4097)])(
  'refuses terminal-control or oversized code input',
  (value) => {
    expect(() => validateProviderLoginCode(value)).toThrow()
  },
)
it('accepts one opaque code and never changes its internal bytes', () => {
  expect(validateProviderLoginCode('  fixture#state  ')).toBe('fixture#state')
})
it('keeps cleanup failure actionable without copying sensitive output', () => {
  expect(
    classifyProviderLoginFailure(
      new Error('Claude sign-out failed: secret-fixture'),
    ).message,
  ).toContain('could not be discarded')
  expect(
    classifyProviderLoginFailure(
      new Error('Claude sign-out failed: secret-fixture'),
    ).message,
  ).not.toContain('secret-fixture')
})

it('distinguishes a successful credential discard from a failed cleanup', () => {
  expect(
    classifyProviderLoginFailure(
      new Error(
        'Login did not verify the originally enrolled Claude account. The unverified login was discarded.',
      ),
    ),
  ).toMatchObject({ kind: 'identity' })
  expect(
    classifyProviderLoginFailure(
      new Error(
        'The foreign credential could NOT be removed; retry reconnect or removal.',
      ),
    ),
  ).toMatchObject({ kind: 'cleanup' })
  expect(
    classifyProviderLoginFailure(
      new Error('The previous account config could NOT be restored.'),
    ),
  ).toMatchObject({ kind: 'cleanup' })
})
