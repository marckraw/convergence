/**
 * The deterministic half of talking to `security` about daemon tokens
 * (MAR-2642) — how a secret is put on the wire, how a failure is described
 * without carrying it back, and how the Keychain's own listing is read.
 */

/**
 * A token, in the form `security` is asked to store it.
 *
 * Hex, and not because the Keychain wants hex. The token must not travel in
 * `argv` — anything on the machine can read a process's command line — so it
 * travels through `security -i`, which reads its command from stdin. That
 * moves the secret off the process table and hands it to `security`'s own
 * tokenizer instead, and that tokenizer reads one command per line: no quoting
 * and no escape carries a newline through it.
 *
 * A token is a value this app does not get to constrain — a daemon may hand
 * out whatever bytes it likes — so a token containing a newline must still be
 * storable. `-X` takes the password as hexadecimal, and hex is `[0-9a-f]`:
 * there is no character in it for a tokenizer to act on and none this builder
 * would have to refuse. The form that could be mangled is simply not the form
 * that is sent.
 *
 * `securityCommandToken` quotes the account for the same hazard from the other
 * side, because an account is not free to become hex: it is the Endpoint id,
 * and it must read back as itself.
 */
export function keychainPasswordHex(token: string): string {
  return Buffer.from(token, 'utf8').toString('hex')
}

/**
 * The characters a `security -i` command line does not carry (MAR-2642).
 *
 * The newline is the one that matters: it ends the command wherever it falls,
 * quoted or not — verified against the binary, where `"a<newline>b"` arrives as
 * two commands rather than one token. No escape changes that, so a value
 * holding one cannot be represented at all, and sending it anyway would run a
 * command nobody asked for. A NUL ends the C string it sits in for the same
 * reason.
 *
 * The rest of the control range goes with them. Some of it does survive the
 * quoting — a tab inside a quoted token comes back intact — but nothing this
 * app sends has any business holding one: an Endpoint id is letters, digits,
 * hyphens and underscores, and a password travels as hex. Refusing the class is
 * a rule with no exceptions to get wrong later.
 *
 * Read as code points rather than matched as a character class, because a
 * regular expression holding literal control characters is itself unreadable —
 * and unreviewable, which is the wrong property for the check that decides what
 * reaches `security`.
 */
function isUnsendable(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

/**
 * One value, in the form `security -i` hands back unchanged (MAR-2642).
 *
 * Interpolation was the defect: the account is an Endpoint id, ids are read
 * from a file on disk, and an id carrying a space named a different account
 * while an id carrying a newline started a second keychain command. Ids are
 * validated where they enter — `requireExecutionHostEndpointId` — and this is
 * the second defence, so that a hostile value cannot terminate a token or a
 * line even if that validation is ever bypassed.
 *
 * `security`'s tokenizer, as measured: a quote opens a quoted token, a
 * backslash escapes the next character inside it and outside it, and a
 * whitespace-free `\` and `"` are the only two characters that need escaping.
 * Everything else — spaces, tabs, single quotes, `;`, `$`, backticks — is
 * inert inside a quoted token, because this is a tokenizer and not a shell.
 */
export function securityCommandToken(value: string): string {
  if (isUnsendable(value)) {
    throw new Error(
      `A keychain command cannot carry ${JSON.stringify(value)}: a newline ` +
        'ends the command wherever it falls and no escape changes that, and ' +
        'no other control character belongs in a value this app sends.',
    )
  }
  return `"${value.replace(/(["\\])/g, '\\$1')}"`
}

/**
 * A whole command for `security -i`, every token quoted (MAR-2642).
 *
 * The command name and its flags are quoted too. They are literals here and
 * could not be hostile, but a builder with one rule has no exception for a
 * later edit to put a value into.
 */
function securityCommandLine(tokens: readonly string[]): string {
  return `${tokens.map(securityCommandToken).join(' ')}\n`
}

/**
 * The one `security` command that carries a secret, as a line for `security
 * -i` (MAR-2642).
 *
 * Built here rather than inline so the argv-free form has one definition and
 * one test — and so there is exactly one place where a value becomes part of a
 * command line, with quoting it cannot opt out of.
 */
export function addGenericPasswordCommand(input: {
  account: string
  service: string
  passwordHex: string
}): string {
  return securityCommandLine([
    'add-generic-password',
    '-a',
    input.account,
    '-s',
    input.service,
    '-U',
    '-X',
    input.passwordHex,
  ])
}

/**
 * The text a failed `security` invocation is allowed to carry (MAR-2642).
 *
 * Node's `execFile` puts the whole command line into `error.message`, so a
 * failure with empty stderr — `ENOENT`, a timeout — reports the command back
 * to its caller verbatim. That is harmless only while the command line holds
 * no secret, which is exactly the property `keychainPasswordHex` exists to
 * guarantee and exactly the property a future edit could quietly remove.
 *
 * So the guarantee is enforced here instead of assumed: any candidate text
 * that contains a redacted value is discarded for a fixed sentence, and the
 * exit status carries what is left to say. `security` is not supposed to echo
 * its stdin either, but "not supposed to" is not a fact about a binary this
 * repository does not own.
 */
export function describeSecurityFailure(input: {
  stderr: string
  message: string
  exitCode: number | null
  redact?: readonly string[]
}): string {
  const redact = (input.redact ?? []).filter((value) => value.length > 0)
  const holdsSecret = (text: string): boolean =>
    redact.some((value) => text.includes(value))

  const stderr = input.stderr.trim()
  if (stderr && !holdsSecret(stderr)) return stderr
  if (!holdsSecret(input.message)) return input.message

  return input.exitCode === null
    ? 'The keychain command failed.'
    : `The keychain command failed with status ${input.exitCode}.`
}

/**
 * Every Keychain account filed under one service, read off `security
 * dump-keychain` (MAR-2642).
 *
 * `security` has no "list the items matching this service" command: it can
 * find one item, delete one item, or dump the attributes of all of them. So a
 * sweep for credentials whose Endpoint is gone has to read the dump. It is
 * attributes only — no `-d`, so no password data is asked for or returned, and
 * no authorization prompt is raised.
 *
 * Items whose account is not representable as text are printed as hex and are
 * skipped: an Endpoint id is a UUID or the migrated `'default'`, so an entry
 * that cannot be read as a quoted string was never written by this service.
 */
export function keychainAccountsForService(
  dump: string,
  service: string,
): string[] {
  const serviceLine = `"svce"<blob>=${JSON.stringify(service)}`
  const accounts: string[] = []
  for (const item of dump.split(/^keychain: /m)) {
    if (!item.includes(serviceLine)) continue
    const account = /^\s*"acct"<blob>="([^"\n]*)"\s*$/m.exec(item)
    if (account?.[1]) accounts.push(account[1])
  }
  return accounts
}
