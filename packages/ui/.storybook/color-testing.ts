/*
 * Colors for play functions: a token as the browser draws it, to compare with
 * what an element's computed style says (both as rgb()).
 */

/**
 * A color token (`--ring`) as it resolves here, in this theme, the way
 * computed styles say it.
 */
export const tokenColor = (
  name: `--${string}`,
  within: Element = document.body,
): string => {
  const probe = document.createElement('span')
  probe.style.color = `var(${name})`
  within.append(probe)
  const color = getComputedStyle(probe).color
  probe.remove()
  return color
}
