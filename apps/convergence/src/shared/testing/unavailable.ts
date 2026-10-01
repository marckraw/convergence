/**
 * Whether a control is unavailable, either way it can be (MAR-3616): disabled
 * natively, or disabled with a reason (R2), which keeps it focusable and says
 * so with aria-disabled. `toBeDisabled()` reads only the first.
 */
export const isUnavailable = (element: Element): boolean =>
  element.hasAttribute('disabled') ||
  element.getAttribute('aria-disabled') === 'true'
