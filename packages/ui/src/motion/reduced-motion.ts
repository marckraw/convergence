import { useSyncExternalStore } from 'react'

const reducedMotionQuery = '(prefers-reduced-motion: reduce)'

const subscribe = (onChange: () => void): (() => void) => {
  const media = window.matchMedia(reducedMotionQuery)
  media.addEventListener('change', onChange)
  const attribute = new MutationObserver(onChange)
  attribute.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-motion'],
  })
  return () => {
    media.removeEventListener('change', onChange)
    attribute.disconnect()
  }
}

const getSnapshot = (): boolean =>
  document.documentElement.dataset.motion === 'reduced' ||
  window.matchMedia(reducedMotionQuery).matches

const getServerSnapshot = (): boolean => false

/**
 * Whether motion is reduced (MAR-3616): the system setting, or
 * `data-motion="reduced"` on <html> (Storybook's toolbar, an in-app setting
 * later). The attribute can add the reduction, never take it away. The same
 * two switches drive the `motion-safe` and `motion-reduce` variants in
 * theme.css, so CSS and script always agree.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
