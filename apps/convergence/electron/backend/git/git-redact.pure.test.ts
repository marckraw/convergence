import { describe, expect, it } from 'vitest'
import { redactUrlCredentials } from './git-redact.pure'

describe('redactUrlCredentials', () => {
  it('strips user:token@ from any URL in the text, keeping the host', () => {
    expect(
      redactUrlCredentials(
        "fatal: unable to access 'https://marcin:ghp_abc123@github.com/x/y.git/': Could not resolve host",
      ),
    ).toBe(
      "fatal: unable to access 'https://github.com/x/y.git/': Could not resolve host",
    )
  })

  it('strips a bare user@ and several URLs at once', () => {
    expect(
      redactUrlCredentials(
        'a https://user@host/a and ssh://git@github.com/b and http://t0k:en@h/c',
      ),
    ).toBe('a https://host/a and ssh://github.com/b and http://h/c')
  })

  it('leaves text without credentials alone', () => {
    const plain = 'fatal: not a git repository at /Users/x/y'
    expect(redactUrlCredentials(plain)).toBe(plain)
    expect(redactUrlCredentials('https://github.com/x/y')).toBe(
      'https://github.com/x/y',
    )
  })
})
