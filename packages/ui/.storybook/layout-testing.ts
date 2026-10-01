import { expect } from 'storybook/test'

/*
 * Layout checks for play functions: what a row does with text too long for
 * it.
 */

/**
 * A line cut short beside what follows it on its row, like a select's value
 * beside its chevron: the line ends in an ellipsis, before the next thing
 * starts, and keeps at least twice that thing's width; the next thing is
 * drawn whole.
 */
export const expectCutShortBeside = async (
  line: HTMLElement,
  beside: Element,
) => {
  await expect(getComputedStyle(line).textOverflow).toBe('ellipsis')
  await expect(line.scrollWidth).toBeGreaterThan(line.clientWidth)
  const lineBox = line.getBoundingClientRect()
  const besideBox = beside.getBoundingClientRect()
  await expect(lineBox.right).toBeLessThanOrEqual(besideBox.left)
  await expect(lineBox.width).toBeGreaterThanOrEqual(besideBox.width * 2)
  await expect(beside.scrollWidth).toBeLessThanOrEqual(
    Math.ceil(besideBox.width),
  )
}
