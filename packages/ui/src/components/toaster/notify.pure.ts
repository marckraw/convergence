/**
 * A failure's headline in R10's words: "Couldn’t <verb> <thing>." `what` is
 * the verb and the thing, lower case and without a full stop
 * ("update Codex", "open the project"); one stop is written whatever it ends
 * with. The apostrophe is the typographic one, as the app's toasts write it.
 */
export function failureTitle(what: string): string {
  return `Couldn’t ${what.trim().replace(/\.+$/, '')}.`
}

/**
 * Why it failed, the line under the headline: an Error's message, or a
 * string, as it came. Anything else (nothing, an empty message, a value that
 * isn't text) says nothing, so the headline stands alone rather than over a
 * blank line or "[object Object]".
 */
export function reasonOf(reason: unknown): string | undefined {
  const text =
    reason instanceof Error
      ? reason.message
      : typeof reason === 'string'
        ? reason
        : ''
  const trimmed = text.trim()
  return trimmed === '' ? undefined : trimmed
}
