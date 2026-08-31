import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EXECUTION_HOST_DAEMON_KEYCHAIN_SERVICE,
  EXECUTION_HOST_DAEMON_TOKEN_ENV_KEY,
  ExecutionHostDaemonCredentialsService,
} from './execution-host-daemon-credentials.service'
import { parseSecurityCommands } from './execution-host-daemon-credentials.fixture'

interface SecurityCall {
  args: string[]
  /** What was written to the process's stdin, if anything. */
  stdin: string | null
}

/**
 * A stand-in for the `security` binary, stdin included.
 *
 * The real one asks the login keychain, which is the user's own machine — a
 * suite that reached it would pass or fail on what is stored there, and would
 * be writing to it.
 *
 * It records stdin as well as `argv` because that distinction is now
 * load-bearing: a token reaches `security` only through stdin (MAR-2642), and
 * a fake that saw `argv` alone could not tell a command line carrying a secret
 * from one that does not.
 */
const security = vi.hoisted(() => {
  let handler: (call: {
    args: string[]
    stdin: string | null
  }) => Promise<{ stdout?: string }> = async () => ({})
  return {
    calls: [] as Array<{ args: string[]; stdin: string | null }>,
    run(call: { args: string[]; stdin: string | null }) {
      this.calls.push(call)
      return handler(call)
    },
    respondWith(
      next: (call: {
        args: string[]
        stdin: string | null
      }) => Promise<{ stdout?: string }>,
    ) {
      handler = next
    },
    reset() {
      this.calls = []
      handler = async () => ({})
    },
  }
})

vi.mock('child_process', () => ({
  execFile: (
    _file: string,
    args: string[],
    _options: unknown,
    callback: (error: Error | null, stdout: string, stderr: string) => void,
  ) => {
    let stdin: string | null = null
    // The real `execFile` spawns immediately and the caller writes to stdin
    // afterwards. Deferring by a tick is what lets the fake observe the whole
    // invocation — command line and stdin — as the one thing it is.
    queueMicrotask(() => {
      void security
        .run({ args, stdin })
        .then((result) => callback(null, result.stdout ?? '', ''))
        .catch((error: Error & { stderr?: string }) =>
          callback(error, '', error.stderr ?? ''),
        )
    })
    return {
      stdin: {
        on: () => undefined,
        end: (chunk: string) => {
          stdin = chunk
        },
      },
    }
  },
}))

/** `security` exits with an OSStatus; 44 is `errSecItemNotFound`. */
const ITEM_NOT_FOUND = 44
/** What a locked keychain answers when it will not open a prompt. */
const USER_INTERACTION_NOT_ALLOWED = 51

function securityExit(
  code: number,
  message: string,
  stderr?: string,
): Error & { stderr?: string } {
  return Object.assign(new Error(message), { code, stderr })
}

/**
 * The command line an invocation actually ran.
 *
 * `security -i` reads its command from stdin, which is how the one command
 * that carries a secret keeps it out of `argv`. Reading both transports the
 * same way keeps every assertion below about what `security` was asked to do,
 * rather than about how it was asked.
 *
 * The stdin side is read through a model of `security`'s own tokenizer rather
 * than by splitting on whitespace (MAR-2642). Values on that line are quoted
 * now, so whitespace-splitting would report `"kuba"` as the account and would
 * see an account carrying a space as two tokens — reading the transport rather
 * than the command, which is exactly the confusion the quoting exists to end.
 */
function commandLineOf(call: SecurityCall): string[] {
  if (call.args[0] !== '-i') return call.args
  return parseSecurityCommands(call.stdin ?? '')[0] ?? []
}

/** The command a recorded invocation ran, e.g. `delete-generic-password`. */
function commandOf(call: SecurityCall): string {
  return commandLineOf(call)[0]
}

/** The Keychain account a recorded invocation named — the Endpoint's id. */
function accountOf(call: SecurityCall): string {
  const line = commandLineOf(call)
  return line[line.indexOf('-a') + 1]
}

function serviceOf(call: SecurityCall): string {
  const line = commandLineOf(call)
  return line[line.indexOf('-s') + 1]
}

/** Everything this invocation could be read from by another process. */
function argvOf(call: SecurityCall): string {
  return ['security', ...call.args].join(' ')
}

/**
 * A `security dump-keychain` listing holding one generic-password item per
 * account, in the shape the real one prints.
 */
function keychainDump(
  entries: ReadonlyArray<{ account: string; service: string }>,
): string {
  return entries
    .map(
      ({ account, service }) =>
        `keychain: "/Users/someone/Library/Keychains/login.keychain-db"\n` +
        `version: 512\n` +
        `class: "genp"\n` +
        `attributes:\n` +
        `    "acct"<blob>="${account}"\n` +
        `    "desc"<blob>=<NULL>\n` +
        `    "svce"<blob>="${service}"\n`,
    )
    .join('')
}

async function settleEverythingRunnable(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('ExecutionHostDaemonCredentialsService', () => {
  const previousToken = process.env[EXECUTION_HOST_DAEMON_TOKEN_ENV_KEY]
  const realPlatform = process.platform
  let service: ExecutionHostDaemonCredentialsService

  beforeEach(() => {
    security.reset()
    // The Keychain path exists only on macOS, and what it does there is what
    // these tests are about. Pinning the platform keeps them answering the same
    // question wherever they run.
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      configurable: true,
    })
    delete process.env[EXECUTION_HOST_DAEMON_TOKEN_ENV_KEY]
    service = new ExecutionHostDaemonCredentialsService()
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: realPlatform,
      configurable: true,
    })
    if (previousToken === undefined) {
      delete process.env[EXECUTION_HOST_DAEMON_TOKEN_ENV_KEY]
    } else {
      process.env[EXECUTION_HOST_DAEMON_TOKEN_ENV_KEY] = previousToken
    }
  })

  describe('the environment override', () => {
    // MAR-2620/MAR-2642: the override predates Endpoints and names no machine,
    // so it names the one machine there was. If it answered for every Endpoint,
    // a daemon added minutes ago would authenticate with a token it was never
    // given — the token reaching machines it was never meant for, with nothing
    // downstream able to notice.
    it('serves only the endpoint the single-host era became', async () => {
      process.env[EXECUTION_HOST_DAEMON_TOKEN_ENV_KEY] = 'env-override'
      security.respondWith(async (call) => ({
        stdout: `keychain-of-${accountOf(call)}`,
      }))

      expect(await service.resolveToken('default')).toBe('env-override')
      // Answered without asking the Keychain at all: unchanged, deliberately.
      expect(security.calls).toEqual([])

      expect(await service.resolveToken('kuba')).toBe('keychain-of-kuba')
      expect(commandOf(security.calls[0])).toBe('find-generic-password')
      expect(accountOf(security.calls[0])).toBe('kuba')
      expect(serviceOf(security.calls[0])).toBe(
        EXECUTION_HOST_DAEMON_KEYCHAIN_SERVICE,
      )
    })

    it('reports each endpoint the source that actually answered for it', async () => {
      process.env[EXECUTION_HOST_DAEMON_TOKEN_ENV_KEY] = 'env-override'
      security.respondWith(async (call) => ({
        stdout: `keychain-of-${accountOf(call)}`,
      }))

      expect(await service.getStatus('default')).toMatchObject({
        configured: true,
        source: 'environment',
        account: null,
      })
      expect(await service.getStatus('kuba')).toMatchObject({
        configured: true,
        source: 'keychain',
        account: 'kuba',
        service: EXECUTION_HOST_DAEMON_KEYCHAIN_SERVICE,
      })
    })

    /**
     * The override is not a Keychain entry, so no sweep can collect it, and it
     * is filed under no Endpoint, so no row records it. Settings has to be able
     * to ask about it directly or a set-but-dead override stays invisible —
     * which is what makes it worth saying out loud (MAR-2642).
     */
    it('says whether it is set and which endpoint it serves, without the token', () => {
      expect(service.describeEnvironmentOverride()).toEqual({
        configured: false,
        envKey: EXECUTION_HOST_DAEMON_TOKEN_ENV_KEY,
        endpointId: 'default',
      })

      process.env[EXECUTION_HOST_DAEMON_TOKEN_ENV_KEY] = 'env-override'
      const described = service.describeEnvironmentOverride()
      expect(described.configured).toBe(true)
      expect(described.endpointId).toBe('default')
      expect(JSON.stringify(described)).not.toContain('env-override')
    })
  })

  describe('storing a token', () => {
    /**
     * A secret in `argv` is readable from the process table by everything else
     * running on the machine — `ps` shows it to any local user, and it is
     * captured by anything that samples running processes. It is also what
     * makes the error path dangerous: Node puts the whole command line into
     * `execFile`'s `error.message`, so a failure with empty stderr hands the
     * command back to its caller verbatim.
     *
     * Fixed at the source rather than at the symptom: the token travels on
     * stdin, so there is no command line for anything to leak.
     */
    it('never puts the token on the command line', async () => {
      const SENTINEL = 'sk-sentinel-do-not-log-9f3a'

      await service.setToken({ token: SENTINEL }, 'kuba')

      expect(security.calls.length).toBeGreaterThan(0)
      for (const call of security.calls) {
        expect(argvOf(call)).not.toContain(SENTINEL)
      }
    })

    it('hands the token to `security` on stdin, byte for byte', async () => {
      // Deliberately awkward: every character a tokenizer could act on, in the
      // one value this app does not get to constrain. Sent as hex, so there is
      // nothing on the line to act on at all.
      const TOKEN = 'sk "quoted" \\ and spaced'

      await service.setToken({ token: TOKEN }, 'kuba')

      const write = security.calls.find(
        (call) => commandOf(call) === 'add-generic-password',
      )
      expect(write).toBeDefined()
      expect(write?.args).toEqual(['-i'])
      expect(accountOf(write as SecurityCall)).toBe('kuba')
      expect(serviceOf(write as SecurityCall)).toBe(
        EXECUTION_HOST_DAEMON_KEYCHAIN_SERVICE,
      )

      const line = commandLineOf(write as SecurityCall)
      const hex = line[line.indexOf('-X') + 1]
      expect(Buffer.from(hex, 'hex').toString('utf8')).toBe(TOKEN)
      // `-U`, or a second Save for the same endpoint fails as a duplicate
      // instead of replacing the token the user just retyped.
      expect(line).toContain('-U')
    })

    /**
     * The canary for the property above, taken at the place it would actually
     * be lost. Every failure `security` can have goes through one error path,
     * and that path is the one that used to read `error.message` — which is
     * the command line.
     */
    it('describes a failure without carrying the token or its hex', async () => {
      const SENTINEL = 'sk-sentinel-do-not-log-9f3a'
      const SENTINEL_HEX = Buffer.from(SENTINEL, 'utf8').toString('hex')

      security.respondWith(async (call) => {
        if (commandOf(call) !== 'add-generic-password') return {}
        // The shape that used to leak: no stderr at all, so the message is
        // whatever Node made of the invocation.
        throw securityExit(
          USER_INTERACTION_NOT_ALLOWED,
          `Command failed: security -i\n${SENTINEL}\n${SENTINEL_HEX}`,
        )
      })

      const failure = await service
        .setToken({ token: SENTINEL }, 'kuba')
        .then(() => null)
        .catch((error: Error) => error)

      expect(failure).toBeInstanceOf(Error)
      expect(failure?.message).not.toContain(SENTINEL)
      expect(failure?.message).not.toContain(SENTINEL_HEX)
      // Still says something a user can act on: which status it failed with.
      expect(failure?.message).toContain(String(USER_INTERACTION_NOT_ALLOWED))
    })

    /**
     * The reason the password is hex and the account is quoted rather than both
     * being one or the other: a token is a value this app does not get to
     * constrain, and `security -i` reads one command per line, so a token with
     * a newline in it could not be sent as text at all (MAR-2642).
     */
    it('stores a token that no quoting could have carried', async () => {
      const TOKEN = 'sk-line-one\nsecond line'

      await service.setToken({ token: TOKEN }, 'kuba')

      const write = security.calls.find(
        (call) => commandOf(call) === 'add-generic-password',
      ) as SecurityCall
      expect(write).toBeDefined()
      // One command, still: the newline never reached the line.
      expect(parseSecurityCommands(write.stdin ?? '')).toHaveLength(1)
      const line = commandLineOf(write)
      expect(Buffer.from(line[line.indexOf('-X') + 1], 'hex').toString()).toBe(
        TOKEN,
      )
    })

    /**
     * The account cannot be hex — it is the Endpoint id and has to read back as
     * itself — so it is quoted instead. Ids are refused at every boundary they
     * enter through, and this is what happens if one ever gets past them: it
     * names one account and starts no second command.
     */
    it('files a hostile account under exactly one account, and one command', async () => {
      const ACCOUNT = 'evil" -s convergence.other -a hijacked "x'

      await service.setToken({ token: 'sk-live' }, ACCOUNT)

      const write = security.calls.find(
        (call) => commandOf(call) === 'add-generic-password',
      ) as SecurityCall
      expect(parseSecurityCommands(write.stdin ?? '')).toHaveLength(1)
      expect(accountOf(write)).toBe(ACCOUNT)
      expect(serviceOf(write)).toBe(EXECUTION_HOST_DAEMON_KEYCHAIN_SERVICE)
    })

    it('refuses an empty token rather than storing one', async () => {
      await expect(service.setToken({ token: '   ' }, 'kuba')).rejects.toThrow(
        'cannot be empty',
      )
      expect(security.calls).toEqual([])
    })
  })

  describe('destroying a token', () => {
    /**
     * A delete that swallowed every failure would report a destruction that did
     * not happen. The caller goes on to delete the Endpoint that named the
     * account, and the token is then filed under a machine no surface can name
     * again — invisible in Settings, unremovable through the UI, and still
     * readable by anything that asks for that account.
     */
    it('accepts “no such item”, because that is the state the caller asked for', async () => {
      security.respondWith(async () => {
        throw securityExit(
          ITEM_NOT_FOUND,
          'security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.',
        )
      })

      await expect(service.forgetEndpoint('kuba')).resolves.toBeUndefined()
      expect(commandOf(security.calls[0])).toBe('delete-generic-password')
      expect(accountOf(security.calls[0])).toBe('kuba')
    })

    it('rejects when the keychain refused, rather than reporting success', async () => {
      security.respondWith(async () => {
        throw securityExit(
          USER_INTERACTION_NOT_ALLOWED,
          'security: SecKeychainItemDelete: User interaction is not allowed.',
        )
      })

      await expect(service.forgetEndpoint('kuba')).rejects.toThrow(
        'User interaction is not allowed.',
      )
      await expect(service.deleteToken('kuba')).rejects.toThrow(
        'User interaction is not allowed.',
      )
    })

    it('rejects when `security` could not run at all', async () => {
      // No exit status, so no status can mean "already gone". A failure with a
      // string `code` must never be read as one that happens to equal 44.
      security.respondWith(async () => {
        throw Object.assign(new Error('spawn security ENOENT'), {
          code: 'ENOENT',
        })
      })

      await expect(service.forgetEndpoint('kuba')).rejects.toThrow(
        'spawn security ENOENT',
      )
    })
  })

  describe('sweeping credentials whose endpoint is gone', () => {
    /**
     * The residue handler for the order a save now uses: settings commit
     * first, credential cleanup after (MAR-2642). A Keychain that refuses that
     * cleanup — or a quit between the two — leaves an entry filed under an id
     * no Endpoint will ever bear again. Every account under this service
     * belongs to an Endpoint, so one that is not a stored id is garbage
     * whatever left it there.
     */
    it('destroys the accounts no endpoint holds and keeps the ones that exist', async () => {
      security.respondWith(async (call) => {
        if (commandOf(call) === 'dump-keychain') {
          return {
            stdout: keychainDump([
              {
                account: 'kuba',
                service: EXECUTION_HOST_DAEMON_KEYCHAIN_SERVICE,
              },
              {
                account: 'vanished',
                service: EXECUTION_HOST_DAEMON_KEYCHAIN_SERVICE,
              },
              // Somebody else's item under somebody else's service. Sweeping it
              // would be this feature destroying a credential it never wrote.
              { account: 'kuba', service: 'com.apple.something-else' },
            ]),
          }
        }
        return {}
      })

      const live = new Set(['kuba'])
      expect(await service.sweepEndpoints((id) => live.has(id))).toEqual([
        'vanished',
      ])

      const deletes = security.calls.filter(
        (call) => commandOf(call) === 'delete-generic-password',
      )
      expect(deletes.map(accountOf)).toEqual(['vanished'])
      expect(deletes.map(serviceOf)).toEqual([
        EXECUTION_HOST_DAEMON_KEYCHAIN_SERVICE,
      ])
    })

    /**
     * The listing is read before the first delete is reached, and each delete
     * then waits for its own Endpoint's queue. An answer from before that wait
     * is an answer about a different moment — which is why liveness is a
     * question the store asks again inside the slot rather than a list it was
     * handed.
     */
    it('does not sweep an endpoint that came back while it waited for the queue', async () => {
      let releaseSave!: () => void
      const saveGate = new Promise<void>((resolve) => {
        releaseSave = resolve
      })
      security.respondWith(async (call) => {
        if (commandOf(call) === 'dump-keychain') {
          return {
            stdout: keychainDump([
              {
                account: 'kuba',
                service: EXECUTION_HOST_DAEMON_KEYCHAIN_SERVICE,
              },
            ]),
          }
        }
        if (commandOf(call) === 'add-generic-password') await saveGate
        return {}
      })

      const live = new Set<string>()
      // Somebody is already pasting a token for `kuba`, so the sweep's delete
      // has to queue behind it.
      const save = service.setToken({ token: 'pasted-token' }, 'kuba')
      const sweep = service.sweepEndpoints((id) => live.has(id))
      await settleEverythingRunnable()

      // And by the time the sweep reaches the front of that queue, the Endpoint
      // exists again.
      live.add('kuba')
      releaseSave()

      expect(await sweep).toEqual([])
      await save
      expect(security.calls.map(commandOf)).not.toContain(
        'delete-generic-password',
      )
    })

    it('keeps sweeping past an account the keychain would not release', async () => {
      security.respondWith(async (call) => {
        if (commandOf(call) === 'dump-keychain') {
          return {
            stdout: keychainDump([
              {
                account: 'locked',
                service: EXECUTION_HOST_DAEMON_KEYCHAIN_SERVICE,
              },
              {
                account: 'vanished',
                service: EXECUTION_HOST_DAEMON_KEYCHAIN_SERVICE,
              },
            ]),
          }
        }
        if (
          commandOf(call) === 'delete-generic-password' &&
          accountOf(call) === 'locked'
        ) {
          throw securityExit(
            USER_INTERACTION_NOT_ALLOWED,
            'security: SecKeychainItemDelete: User interaction is not allowed.',
          )
        }
        return {}
      })

      // The one it could not release is still garbage tomorrow; the ones after
      // it are still garbage today, so one refusal does not end the sweep.
      expect(await service.sweepEndpoints(() => false)).toEqual(['vanished'])
      const attempted = security.calls
        .filter((call) => commandOf(call) === 'delete-generic-password')
        .map(accountOf)
      expect(attempted).toEqual(['locked', 'vanished'])
    })

    /**
     * Serialized within one Endpoint, concurrent across Endpoints (MAR-2642).
     *
     * The queue exists because two `security` processes against one account
     * finish in whatever order the OS picks. It says nothing about different
     * machines — so a Keychain that blocks on one orphan (an authorization
     * prompt nobody is there to answer, a `security` running to its timeout)
     * must not hold the next orphan's cleanup hostage to it.
     *
     * The canary is time, not order: `blocked`'s delete is left in flight and
     * the other two must have completed anyway. Sequence them again and this
     * fails, because nothing after `blocked` would ever have started.
     */
    it('does not let one blocked account hold up another’s cleanup', async () => {
      let releaseBlocked!: () => void
      const blockedGate = new Promise<void>((resolve) => {
        releaseBlocked = resolve
      })
      security.respondWith(async (call) => {
        if (commandOf(call) === 'dump-keychain') {
          return {
            stdout: keychainDump(
              ['blocked', 'vanished', 'also-vanished'].map((account) => ({
                account,
                service: EXECUTION_HOST_DAEMON_KEYCHAIN_SERVICE,
              })),
            ),
          }
        }
        if (
          commandOf(call) === 'delete-generic-password' &&
          accountOf(call) === 'blocked'
        ) {
          await blockedGate
        }
        return {}
      })

      const sweep = service.sweepEndpoints(() => false)
      await settleEverythingRunnable()

      const deleted = security.calls
        .filter((call) => commandOf(call) === 'delete-generic-password')
        .map(accountOf)
      expect(deleted).toContain('vanished')
      expect(deleted).toContain('also-vanished')

      releaseBlocked()
      // And the answer still reads in the order the keychain listed them,
      // however the concurrent deletes happened to finish.
      expect(await sweep).toEqual(['blocked', 'vanished', 'also-vanished'])
    })

    it('asks the keychain nothing off macOS, where there is no keychain', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      })

      expect(await service.sweepEndpoints(() => false)).toEqual([])
      expect(security.calls).toEqual([])
    })
  })

  describe('two pieces of credential work for one endpoint', () => {
    /**
     * The Keychain is a shared mutable store and `security` is a process: two
     * of them started against one account finish in whatever order the OS
     * chooses. A token Save dispatched before a removal must not land after it
     * and recreate the credential of a machine that is already gone.
     */
    it('does not let a slow save land after the removal that followed it', async () => {
      let releaseSave!: () => void
      const saveGate = new Promise<void>((resolve) => {
        releaseSave = resolve
      })
      security.respondWith(async (call) => {
        if (commandOf(call) === 'add-generic-password') await saveGate
        return commandOf(call) === 'find-generic-password'
          ? { stdout: 'stored' }
          : {}
      })

      const save = service.setToken({ token: 'pasted-token' }, 'kuba')
      const forget = service.forgetEndpoint('kuba')
      await settleEverythingRunnable()

      // The removal has not run at all while the save is still in flight. This
      // is the assertion the interleaving breaks: unserialized, the delete
      // finds nothing to delete here and the save recreates the token after it.
      expect(security.calls.map(commandOf)).toEqual(['add-generic-password'])

      releaseSave()
      await Promise.all([save, forget])

      expect(security.calls.map(commandOf)).toEqual([
        'add-generic-password',
        'find-generic-password',
        'delete-generic-password',
      ])
      expect(security.calls.every((call) => accountOf(call) === 'kuba')).toBe(
        true,
      )
    })

    it('makes one endpoint’s slow save wait for nothing on another endpoint', async () => {
      let releaseSave!: () => void
      const saveGate = new Promise<void>((resolve) => {
        releaseSave = resolve
      })
      security.respondWith(async (call) => {
        if (commandOf(call) === 'add-generic-password') await saveGate
        return {}
      })

      const save = service.setToken({ token: 'pasted-token' }, 'kuba')
      // A different machine shares nothing with that one, so nothing it does is
      // ordered against it — a session starting on `backpack` must not wait
      // behind a token being pasted for `kuba`.
      await expect(service.forgetEndpoint('backpack')).resolves.toBeUndefined()

      releaseSave()
      await save
    })
  })
})
