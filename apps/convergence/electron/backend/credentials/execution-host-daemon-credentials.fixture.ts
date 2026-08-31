import type { ExecutionHostEndpointCredentials } from '../app-settings/app-settings.service'

export interface RecordingExecutionHostCredentials extends ExecutionHostEndpointCredentials {
  /**
   * Endpoint ids this store currently holds a credential for.
   *
   * Seed it to stand for tokens pasted before the test began — a sweep can
   * only find what the Keychain already has, so a store that started empty
   * could never show one being collected.
   */
  readonly stored: Set<string>
  /** Endpoint ids whose token this store destroyed, in order. */
  readonly forgotten: string[]
  /**
   * Endpoint ids whose token this store will refuse to destroy — a locked
   * keychain, a denied authorization prompt, no `security` at all.
   *
   * The refusal is the half worth stubbing: a store that only ever succeeds
   * cannot show what a save does when destroying a credential turns out to be
   * impossible, which is the moment the order of the two systems decides what
   * the user is left with.
   */
  readonly refuses: Set<string>
  /**
   * Endpoint ids whose cleanup this store will not finish until released — a
   * `security` waiting on an authorization prompt nobody is there to answer.
   *
   * The half a throwing stub cannot show: a refusal is instant, and what makes
   * one Endpoint hostage to another is *time*. Blocking one account and
   * watching another's cleanup complete anyway is the only way to tell a
   * concurrent batch from a sequential one.
   */
  block(endpointId: string): () => void
}

/**
 * A credential store for tests that records which Endpoints were told to forget
 * their token (MAR-2642).
 *
 * It holds no tokens and returns none: a token's destruction is asserted on the
 * account that was named, never on a value, so nothing here can leak one into a
 * test log.
 */
export function recordingExecutionHostCredentials(): RecordingExecutionHostCredentials {
  const stored = new Set<string>()
  const forgotten: string[] = []
  const refuses = new Set<string>()
  const gates = new Map<string, Promise<void>>()

  const destroy = async (endpointId: string): Promise<void> => {
    await gates.get(endpointId)
    if (refuses.has(endpointId)) {
      throw new Error(
        `The keychain would not destroy the token for "${endpointId}".`,
      )
    }
    stored.delete(endpointId)
    forgotten.push(endpointId)
  }

  return {
    stored,
    forgotten,
    refuses,
    block: (endpointId: string) => {
      let release!: () => void
      gates.set(
        endpointId,
        new Promise<void>((resolve) => {
          release = resolve
        }),
      )
      return () => {
        gates.delete(endpointId)
        release()
      }
    },
    forgetEndpoint: async (endpointId: string) => {
      await destroy(endpointId)
    },
    sweepEndpoints: async (isLive: (endpointId: string) => boolean) => {
      // A snapshot, because `destroy` mutates the set being walked. The real
      // store re-asks `isLive` per account for the same reason the interface
      // takes a question: the list is read before the first delete lands.
      const orphans = [...stored].filter((endpointId) => !isLive(endpointId))
      // Settled together rather than one after another, because that is what
      // the real store does (MAR-2642): different machines are ordered against
      // nothing, so one blocked account must not hold up the next one's
      // cleanup. A fixture that sequenced them would let a caller's own
      // sequencing pass unnoticed.
      const settled = await Promise.allSettled(
        orphans.map((endpointId) => destroy(endpointId)),
      )
      return orphans.filter(
        (_, index) => settled[index]?.status === 'fulfilled',
      )
    },
  }
}

/**
 * `security -i`'s own tokenizer, as measured against the binary (MAR-2642).
 *
 * A model rather than a mock: the whole question about a command carrying an
 * Endpoint id is what `security` makes of it, and splitting the line on
 * whitespace — which is what these tests used to do — answers a different
 * question. It would read `-a "kuba vps"` as three tokens and never notice that
 * a quoted account had become an account and a stray argument.
 *
 * The rules, each verified by feeding the real `security -i` an unknown command
 * and reading back the name it echoed:
 *
 * - one command per line, always: a newline ends the command wherever it falls,
 *   including inside a quoted value, so `"a\nb"` is two commands and not one
 *   token;
 * - whitespace separates tokens;
 * - `"` or `'` at the start of a token opens a quoted run that ends at the
 *   matching unescaped quote, and whatever follows it up to the next whitespace
 *   is discarded;
 * - a quote anywhere else in a token is a literal character;
 * - `\` escapes the next character, inside a quoted run and outside one.
 */
export function parseSecurityCommands(input: string): string[][] {
  return input
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map(parseSecurityCommandLine)
}

function parseSecurityCommandLine(line: string): string[] {
  const tokens: string[] = []
  let index = 0

  while (index < line.length) {
    if (/\s/.test(line[index])) {
      index += 1
      continue
    }

    let token = ''
    const quote = line[index] === '"' || line[index] === "'" ? line[index] : ''
    if (quote) index += 1

    while (index < line.length) {
      const character = line[index]
      if (character === '\\' && index + 1 < line.length) {
        token += line[index + 1]
        index += 2
        continue
      }
      if (quote) {
        if (character === quote) {
          index += 1
          // Everything between the closing quote and the next whitespace is
          // dropped by `security`, so `"a"b` is the single token `a`.
          while (index < line.length && !/\s/.test(line[index])) index += 1
          break
        }
      } else if (/\s/.test(character)) {
        break
      }
      token += character
      index += 1
    }

    tokens.push(token)
  }

  return tokens
}
