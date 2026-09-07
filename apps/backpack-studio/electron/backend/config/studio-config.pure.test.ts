import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STUDIO_PROVIDER_ID,
  describeMissing,
  mergeEnv,
  parseDotEnv,
  readStudioConfig,
  STUDIO_ENV_KEYS,
} from './studio-config.pure'

const FULL = {
  BACKPACK_STUDIO_DAEMON_URL: 'https://daemon.example',
  BACKPACK_STUDIO_DAEMON_TOKEN: 'tok-abc',
  BACKPACK_STUDIO_DAEMON_PROJECT: '/srv/projects/studio',
}

describe('readStudioConfig', () => {
  it('reads the four variables, defaulting only the provider', () => {
    const reading = readStudioConfig(FULL)
    expect(reading).toEqual({
      ok: true,
      config: {
        daemonBaseUrl: 'https://daemon.example',
        daemonToken: 'tok-abc',
        daemonProject: '/srv/projects/studio',
        providerId: DEFAULT_STUDIO_PROVIDER_ID,
      },
    })
  })

  /**
   * The default is the daemon's own id namespace, not a product name. The
   * `/health` body captured from the machine Studio is aimed at advertises
   * `claude`; a start naming `claude-code` is refused by it.
   *
   * Mutation: `DEFAULT_STUDIO_PROVIDER_ID = 'claude-code'` -> red.
   */
  it('defaults to a provider id the target daemon advertises', () => {
    expect(DEFAULT_STUDIO_PROVIDER_ID).toBe('claude')
  })

  it('lets the environment name a different provider', () => {
    const reading = readStudioConfig({
      ...FULL,
      BACKPACK_STUDIO_PROVIDER: 'codex',
    })
    expect(reading.ok && reading.config.providerId).toBe('codex')
  })

  /**
   * Mutation: drop the `text === '' ? null` arm from `trimmed` and a blank
   * token reads as configured -> red here, because `missing` comes back empty.
   */
  it.each([
    ['absent', undefined],
    ['blank', ''],
    ['whitespace', '   '],
  ])('treats a %s token as missing, by name', (_label, token) => {
    const reading = readStudioConfig({
      ...FULL,
      BACKPACK_STUDIO_DAEMON_TOKEN: token,
    })
    expect(reading).toEqual({
      ok: false,
      missing: [STUDIO_ENV_KEYS.daemonToken],
    })
  })

  it('names every missing variable, in a stable order', () => {
    expect(readStudioConfig({})).toEqual({
      ok: false,
      missing: [
        'BACKPACK_STUDIO_DAEMON_URL',
        'BACKPACK_STUDIO_DAEMON_TOKEN',
        'BACKPACK_STUDIO_DAEMON_PROJECT',
      ],
    })
  })

  /**
   * The provider has a default, so it is never a reason to refuse to start.
   *
   * Mutation: add `STUDIO_ENV_KEYS.provider` to the `missing` list and this
   * goes red while the honest screen starts demanding a variable nobody needs.
   */
  it('never asks for the provider variable', () => {
    const reading = readStudioConfig({})
    expect(reading.ok ? [] : reading.missing).not.toContain(
      STUDIO_ENV_KEYS.provider,
    )
  })
})

describe('describeMissing', () => {
  /**
   * The sentence is built from names. Mutation: interpolate a value anywhere in
   * `describeMissing` and it cannot compile against this signature — the
   * function is handed names and never the environment.
   */
  it('names the variables and never their values', () => {
    const said = describeMissing([STUDIO_ENV_KEYS.daemonToken])
    expect(said).toContain('BACKPACK_STUDIO_DAEMON_TOKEN')
    expect(said).not.toContain('tok-abc')
  })

  it('reads as a list when more than one is missing', () => {
    expect(describeMissing(['A', 'B'])).toBe(
      'Backpack Studio needs these before it can reach the daemon: A, B.',
    )
  })

  it('says so when nothing is missing', () => {
    expect(describeMissing([])).toBe('Backpack Studio is configured.')
  })
})

describe('parseDotEnv', () => {
  it('reads the forms a hand-written .env actually uses', () => {
    expect(
      parseDotEnv(
        [
          '# a comment',
          '',
          'BACKPACK_STUDIO_DAEMON_URL=https://daemon.example',
          'export BACKPACK_STUDIO_DAEMON_TOKEN="tok abc"',
          "BACKPACK_STUDIO_DAEMON_PROJECT='/srv/with space'",
          '   BACKPACK_STUDIO_PROVIDER = codex   ',
        ].join('\n'),
      ),
    ).toEqual({
      BACKPACK_STUDIO_DAEMON_URL: 'https://daemon.example',
      BACKPACK_STUDIO_DAEMON_TOKEN: 'tok abc',
      BACKPACK_STUDIO_DAEMON_PROJECT: '/srv/with space',
      BACKPACK_STUDIO_PROVIDER: 'codex',
    })
  })

  /**
   * Anything unrecognised is ignored rather than guessed at.
   *
   * Mutation: drop the key-shape test and `not a line` becomes a variable
   * named `not a line` -> red.
   */
  it('ignores lines that are not assignments', () => {
    expect(
      parseDotEnv(['not a line', '=novalue', 'BAD KEY=1'].join('\n')),
    ).toEqual({})
  })
})

describe('mergeEnv', () => {
  /**
   * The shell is the more deliberate of the two, so it wins — including when it
   * says a variable is deliberately empty.
   *
   * Mutation: spread `processEnv` first and the file wins -> red.
   */
  it('lets the process environment override the file', () => {
    const merged = mergeEnv(
      { BACKPACK_STUDIO_PROVIDER: 'codex', BACKPACK_STUDIO_DAEMON_URL: '' },
      {
        BACKPACK_STUDIO_PROVIDER: 'claude',
        BACKPACK_STUDIO_DAEMON_URL: 'https://stale',
      },
    )
    expect(merged.BACKPACK_STUDIO_PROVIDER).toBe('codex')
    expect(merged.BACKPACK_STUDIO_DAEMON_URL).toBe('')
  })

  it('falls back to the file where the process says nothing', () => {
    expect(mergeEnv({}, FULL).BACKPACK_STUDIO_DAEMON_TOKEN).toBe('tok-abc')
  })
})
