import { describe, expect, it } from 'vitest'
import {
  addGenericPasswordCommand,
  describeSecurityFailure,
  keychainAccountsForService,
  keychainPasswordHex,
  securityCommandToken,
} from './execution-host-daemon-credentials.pure'
import { parseSecurityCommands } from './execution-host-daemon-credentials.fixture'

const SERVICE = 'convergence.execution-host-daemon'

function genericPasswordItem(account: string, service: string): string {
  return (
    `keychain: "/Users/someone/Library/Keychains/login.keychain-db"\n` +
    `version: 512\n` +
    `class: "genp"\n` +
    `attributes:\n` +
    `    0x00000007 <blob>="${service}"\n` +
    `    "acct"<blob>="${account}"\n` +
    `    "cdat"<timedate>=0x3230323630383236\n` +
    `    "desc"<blob>=<NULL>\n` +
    `    "svce"<blob>="${service}"\n`
  )
}

/**
 * Ids that must never become a second command (MAR-2642).
 *
 * The boundary refuses all of these before they can be stored, and this file
 * is about what the builder does if one ever reaches it anyway — which is the
 * only reason to quote a value that has already been validated.
 */
const HOSTILE_ACCOUNTS = [
  'kuba vps',
  'kuba"vps',
  'kuba\\vps',
  "kuba'vps",
  'evil" -s convergence.other -a hijacked "x',
  '" ; delete-generic-password -a default "',
  'a$b`c;d|e&f',
  'ümläut',
]

describe('keychainPasswordHex', () => {
  /**
   * `security -i` reads one command per line, and no quoting or escape carries
   * a newline through that. A token is a value this app does not get to
   * constrain — a daemon may issue whatever bytes it likes — so it is sent as
   * hex, which has no character a tokenizer can act on and none the builder
   * would ever have to refuse.
   */
  it('round-trips every byte a token is allowed to hold', () => {
    for (const token of [
      'sk-plain-token',
      'has"a quote',
      'has\\a backslash',
      'has a space',
      'has\na newline',
      'ümläut',
      'a'.repeat(500),
    ]) {
      const hex = keychainPasswordHex(token)
      expect(hex).toMatch(/^[0-9a-f]*$/)
      expect(Buffer.from(hex, 'hex').toString('utf8')).toBe(token)
    }
  })
})

describe('securityCommandToken', () => {
  /**
   * A newline ends the command wherever it falls — inside a quoted value as
   * readily as outside one, measured against the binary. There is no form that
   * carries it, so the honest answer is to refuse rather than to send
   * something that means a different thing.
   */
  it('refuses a value no quoting could carry through a line-based parse', () => {
    for (const value of ['kuba\nrm', 'kuba\rrm', 'kuba\u0000rm']) {
      expect(() => securityCommandToken(value)).toThrow(/cannot carry/)
    }
  })

  /**
   * A tab does survive the quoting — measured — and is refused anyway. Nothing
   * this app sends holds one: an id is letters, digits, hyphens and
   * underscores, and a password travels as hex. A rule with no exceptions has
   * none to get wrong later.
   */
  it('refuses the rest of the control range with them', () => {
    for (const value of ['kuba\tvps', 'kuba\u001bvps', 'kuba\u007fvps']) {
      expect(() => securityCommandToken(value)).toThrow(/cannot carry/)
    }
  })

  it('carries everything else back as itself', () => {
    for (const value of HOSTILE_ACCOUNTS) {
      const [command] = parseSecurityCommands(securityCommandToken(value))
      expect(command).toEqual([value])
    }
  })
})

describe('addGenericPasswordCommand', () => {
  const command = (account: string): string[][] =>
    parseSecurityCommands(
      addGenericPasswordCommand({
        account,
        service: SERVICE,
        passwordHex: '736b2d31',
      }),
    )

  it('names the account and service, updates in place, and sends hex', () => {
    expect(command('kuba')).toEqual([
      [
        'add-generic-password',
        '-a',
        'kuba',
        '-s',
        SERVICE,
        '-U',
        // `-U`, or a second Save for the same endpoint fails as a duplicate
        // instead of replacing the token the user just retyped.
        '-X',
        '736b2d31',
      ],
    ])
  })

  /**
   * The defect this replaced: the account was interpolated into the line, so an
   * id carrying a quote closed the token early and an id carrying a space
   * became an account plus a stray argument — `-a evil" -s convergence.other`
   * files the token under a service this app does not own.
   *
   * Asserted through a model of `security`'s own tokenizer rather than by
   * splitting on whitespace, because "what `security` makes of this line" is
   * the entire question and whitespace-splitting answers a different one.
   */
  it('makes a hostile account exactly one command, naming exactly it', () => {
    for (const account of HOSTILE_ACCOUNTS) {
      const commands = command(account)

      expect(commands).toHaveLength(1)
      expect(commands[0][0]).toBe('add-generic-password')
      expect(commands[0][commands[0].indexOf('-a') + 1]).toBe(account)
      expect(commands[0][commands[0].indexOf('-s') + 1]).toBe(SERVICE)
      // Nothing extra came along: an escaped account cannot add arguments.
      expect(commands[0]).toHaveLength(8)
    }
  })

  it('refuses an account carrying a whole second command', () => {
    expect(() =>
      addGenericPasswordCommand({
        account: 'kuba\ndelete-generic-password -a default',
        service: SERVICE,
        passwordHex: '736b2d31',
      }),
    ).toThrow(/cannot carry/)
  })
})

describe('describeSecurityFailure', () => {
  it('prefers what `security` said', () => {
    expect(
      describeSecurityFailure({
        stderr: '  security: SecKeychainItemDelete: User interaction...  ',
        message: 'Command failed: security delete-generic-password',
        exitCode: 51,
      }),
    ).toBe('security: SecKeychainItemDelete: User interaction...')
  })

  it('falls back to the error message when `security` said nothing', () => {
    // `ENOENT` and timeouts produce no stderr at all, and the message is the
    // only thing left that says what happened.
    expect(
      describeSecurityFailure({
        stderr: '',
        message: 'spawn security ENOENT',
        exitCode: null,
      }),
    ).toBe('spawn security ENOENT')
  })

  /**
   * Node puts the whole command line into `execFile`'s `error.message`. The
   * token does not travel there any more — it goes on stdin — but "does not"
   * is a property a future edit can remove, and `security` echoing its own
   * stdin is a property of a binary this repository does not own. Both are
   * refused here rather than assumed.
   */
  it('drops any text that carries a redacted value', () => {
    const SENTINEL = 'sk-sentinel-9f3a'

    const fromStderr = describeSecurityFailure({
      stderr: `security: refused while storing ${SENTINEL}`,
      message: 'Command failed: security -i',
      exitCode: 51,
      redact: [SENTINEL],
    })
    expect(fromStderr).not.toContain(SENTINEL)

    const fromMessage = describeSecurityFailure({
      stderr: '',
      message: `Command failed: security add-generic-password -w ${SENTINEL}`,
      exitCode: 51,
      redact: [SENTINEL],
    })
    expect(fromMessage).not.toContain(SENTINEL)
    expect(fromMessage).toContain('51')

    // With no status either, it still refuses to guess rather than leaking.
    expect(
      describeSecurityFailure({
        stderr: '',
        message: SENTINEL,
        exitCode: null,
        redact: [SENTINEL],
      }),
    ).not.toContain(SENTINEL)
  })

  it('ignores an empty redaction, which every text contains', () => {
    expect(
      describeSecurityFailure({
        stderr: 'security: something went wrong',
        message: 'Command failed',
        exitCode: 1,
        redact: [''],
      }),
    ).toBe('security: something went wrong')
  })
})

describe('keychainAccountsForService', () => {
  it('lists only the accounts filed under the service asked about', () => {
    const dump =
      genericPasswordItem('kuba', SERVICE) +
      genericPasswordItem('someone-elses', 'com.apple.continuity.encryption') +
      genericPasswordItem('backpack', SERVICE)

    expect(keychainAccountsForService(dump, SERVICE)).toEqual([
      'kuba',
      'backpack',
    ])
  })

  /**
   * A sweep destroys what it lists, so a listing that over-reaches destroys
   * someone else's credential. The service name must match the whole quoted
   * value, not merely occur inside it.
   */
  it('does not claim an item whose service merely starts the same way', () => {
    const dump = genericPasswordItem('kuba', `${SERVICE}.staging`)

    expect(keychainAccountsForService(dump, SERVICE)).toEqual([])
  })

  it('skips an item whose account is not readable as text', () => {
    // `security` prints non-representable blobs as hex rather than quoted, and
    // an Endpoint id is always a UUID or the migrated `default` — so an entry
    // that is not quoted was never written by this service.
    const dump =
      `keychain: "/Users/someone/Library/Keychains/login.keychain-db"\n` +
      `class: "genp"\n` +
      `attributes:\n` +
      `    "acct"<blob>=0x6B756261  "kuba"\n` +
      `    "svce"<blob>="${SERVICE}"\n`

    expect(keychainAccountsForService(dump, SERVICE)).toEqual([])
  })

  it('answers nothing for a keychain holding nothing of ours', () => {
    expect(keychainAccountsForService('', SERVICE)).toEqual([])
    expect(
      keychainAccountsForService(
        genericPasswordItem('kuba', 'com.apple.something'),
        SERVICE,
      ),
    ).toEqual([])
  })
})
