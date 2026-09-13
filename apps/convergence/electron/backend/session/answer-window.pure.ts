import { readEmittedBaton } from '../relay/relay.pure'

/** The last payload and declaration are independent facts of one answer window. */
export function answerWindowResult(messages: readonly string[]): {
  message: string | null
  baton: string | null
} {
  let baton: string | null = null
  for (const message of messages)
    for (const line of message.split(/\r?\n/)) {
      const declared = readEmittedBaton(line)
      if (declared !== null) baton = declared
    }
  return { message: messages.at(-1) ?? null, baton }
}
