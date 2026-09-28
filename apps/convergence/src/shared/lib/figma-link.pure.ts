/**
 * Figma links in tracker issues (MAR-3526): an issue carrying one is
 * design-sourced, and Marcin's law makes Figma access a hard STOP for it.
 *
 * Any figma.com host (www., or none) over http(s); a path is required so a
 * bare mention of "figma.com" in prose is not a link.
 */
const FIGMA_URL = /\bhttps?:\/\/(?:[a-z0-9-]+\.)*figma\.com\/\S/i

/** A Figma link anywhere in a text, such as an issue body. */
export function containsFigmaLink(text: string | null | undefined): boolean {
  return typeof text === 'string' && FIGMA_URL.test(text)
}

/** A design-sourced issue: a Figma link attached, or in its body. */
export function issueNeedsFigma(fact: {
  figmaLinked?: boolean
  figmaInBody?: boolean | null
}): boolean {
  return fact.figmaLinked === true || fact.figmaInBody === true
}
