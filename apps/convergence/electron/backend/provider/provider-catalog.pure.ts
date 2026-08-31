/** A rendered value long enough to recognise, short enough to read. */
const MAX_DESCRIBED_ID_LENGTH = 40

/**
 * A value that is not a string, in a form its own refusal can name -- and one
 * the value cannot take part in producing (MAR-2682).
 *
 * Nothing is read off the value except `typeof`, and only the primitives whose
 * text is their own identity are rendered at all. This used to be
 * `JSON.stringify`, which is a serialiser and therefore runs code the caller
 * supplied: a BigInt threw, a circular object threw, and an object with a
 * hostile `toJSON` threw whatever it liked. The sentence that exists to
 * identify a bad value crashed on one, so the door promised an unreachable
 * catalog and delivered an exception instead.
 *
 * An object is named by its type and nothing else. `toString`, `valueOf`,
 * `constructor` and every own key are the value's code or a proxy's trap, and
 * a refusal must not depend on any of it.
 *
 * It lives out here, away from the service, because it is a total function from
 * one value to one sentence and nothing else -- the house rule for deterministic
 * logic. Sitting inside the class it read as part of the door's control flow,
 * which is exactly the thing it must not be: the door's promise is that no
 * input can make it throw, and that promise is only as strong as this function
 * is provable on its own.
 */
export function describeNonStringExecutionHostId(value: unknown): string {
  const type = typeof value
  const article = /^[aeiou]/.test(type) ? 'an' : 'a'
  if (type !== 'number' && type !== 'bigint' && type !== 'boolean') {
    return `${article} ${type}`
  }
  // Only these three: their text is produced by the runtime from the value
  // itself, so it cannot throw and cannot run anything. A bigint's can still be
  // arbitrarily long, hence the bound.
  const rendered = String(value)
  const text =
    rendered.length > MAX_DESCRIBED_ID_LENGTH
      ? `${rendered.slice(0, MAX_DESCRIBED_ID_LENGTH)}…`
      : rendered
  return `${article} ${type} (${text})`
}
