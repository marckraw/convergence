import {
  readEmittedDeclaration,
  type BatonDeclaration,
} from '../relay/relay.pure'

/** The last payload and last declared route are independent facts of one answer window. */
export function answerWindowResult(messages: readonly string[]) {
  let declaration: BatonDeclaration = { kind: 'none' }
  for (const message of messages) {
    const next = readEmittedDeclaration(message)
    if (next.kind !== 'none') declaration = next
  }
  return { message: messages.at(-1) ?? null, declaration }
}
