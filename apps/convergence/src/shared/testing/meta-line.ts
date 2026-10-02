/**
 * Reading a MetaLine in a test as the eye reads it (CONV-23). MetaLine joins
 * its facts with "·" and puts a comma only a screen reader hears before each
 * dot (sr-only), and a wrapping line ties the dot to its fact with a no-break
 * space; so its textContent is "a, · b", while a person reads "a · b".
 */

/** An element's words as the eye reads them: no sr-only text, spaces as spaces. */
export function seen(node: Element | null | undefined): string | undefined {
  if (!node) return undefined
  const copy = node.cloneNode(true) as Element
  copy.querySelectorAll('.sr-only').forEach((hidden) => hidden.remove())
  return copy.textContent?.replace(/\s+/g, ' ').trim()
}

/**
 * A text matcher for Testing Library's `*ByText`: the MetaLine that reads
 * `text` to the eye, `screen.getByText(metaText('Running · 4 m'))`.
 */
export function metaText(text: string | RegExp) {
  return (_content: string, element: Element | null): boolean => {
    if (element?.getAttribute('data-slot') !== 'meta-line') return false
    const words = seen(element) ?? ''
    return typeof text === 'string' ? words === text : text.test(words)
  }
}

/** The MetaLine under `inside` that reads `text` to the eye, if one does. */
export function metaLine(
  text: string | RegExp,
  inside: ParentNode = document,
): HTMLElement | undefined {
  const matches = metaText(text)
  return [
    ...inside.querySelectorAll<HTMLElement>('[data-slot="meta-line"]'),
  ].find((line) => matches('', line))
}

/**
 * The accessible name a MetaLine gives what it names, as a matcher: the
 * facts of `text` ("a · b") joined by the comma a screen reader hears. The
 * comma is an sr-only span, placed absolutely, which a browser sets apart by
 * spaces and jsdom (with no stylesheet) doesn't, so the spaces around it are
 * free: `getByRole('button', { name: metaName('Harness · retry 3') })`.
 */
export function metaName(text: string): RegExp {
  const facts = text
    .split(' · ')
    .map((fact) => fact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`^${facts.join('\\s*,\\s*')}$`)
}
