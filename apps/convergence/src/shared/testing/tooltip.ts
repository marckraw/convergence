import { act, fireEvent, screen } from '@testing-library/react'

/**
 * A pointer comes to rest on `element`, and the app's tooltip appears
 * (MAR-3616). The tooltip host listens for `pointerover` from a non-touch
 * pointer; `findByRole` waits out its delay rather than a test naming the
 * number. The bubble is portalled to `document.body`, so it is read off
 * `screen`. Needs a `TooltipProvider` (or the app's `UiProvider`) above.
 */
export async function hoverForTooltip(element: Element): Promise<HTMLElement> {
  await act(async () => {
    fireEvent.pointerOver(element, { pointerType: 'mouse' })
  })
  return screen.findByRole('tooltip')
}

/**
 * The keyboard reaches `element`, and its tooltip appears at once. jsdom
 * counts any focus as `:focus-visible`, so a plain `focus()` stands in for a
 * Tab here.
 */
export async function focusForTooltip(
  element: HTMLElement,
): Promise<HTMLElement> {
  await act(async () => {
    element.focus()
  })
  return screen.findByRole('tooltip')
}

/** The focus leaves `element`, and its tooltip goes with it. */
export async function blurTooltip(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.blur()
  })
}
