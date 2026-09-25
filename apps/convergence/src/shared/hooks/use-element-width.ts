import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'

interface Tracked<T> {
  element: HTMLElement | null
  observer: ResizeObserver | null
  width: number | null
  value: T
}

/**
 * Observer over one element's width, publishing only what the caller derives
 * from it (MAR-3426 CH2).
 *
 * The width itself never enters React state: `select` maps it to the value the
 * caller renders by (a mode, a bucket), and the component re-renders only when
 * that value changes. A resize that stays on one side of a bound costs no
 * render at all, which is what keeps a parent's subtree still while a window
 * is dragged.
 *
 * `select` receives `null` until the element has been measured. It is read
 * fresh after every render, so a change in what it closes over (another panel
 * opening beside the element) is re-derived from the last measured width
 * without waiting for a resize.
 *
 * The ref may name an ancestor whose ref attaches after this component's
 * layout effects on first mount; the passive pass picks it up then.
 */
export function useElementWidth<T>(
  ref: RefObject<HTMLElement | null>,
  select: (width: number | null) => T,
): T {
  const [selected, setSelected] = useState(() => select(null))
  const selectRef = useRef(select)
  const tracked = useRef<Tracked<T>>({
    element: null,
    observer: null,
    width: null,
    value: selected,
  })

  const sync = () => {
    const box = tracked.current
    const publish = () => {
      const next = selectRef.current(box.width)
      if (Object.is(next, box.value)) return
      box.value = next
      setSelected(() => next)
    }
    const element = ref.current
    if (element !== box.element) {
      box.observer?.disconnect()
      box.element = element
      box.width = element ? element.getBoundingClientRect().width : null
      box.observer =
        element && typeof ResizeObserver === 'function'
          ? new ResizeObserver(() => {
              box.width = element.getBoundingClientRect().width
              publish()
            })
          : null
      if (element) box.observer?.observe(element)
    }
    publish()
  }

  // No dependency list on purpose: both passes are an identity check and one
  // `select` call, and running them after every render is what lets `select`
  // and the ref change without the caller naming them.
  useLayoutEffect(() => {
    selectRef.current = select
    sync()
  })
  useEffect(() => {
    sync()
  })
  useEffect(
    () => () => {
      const box = tracked.current
      box.observer?.disconnect()
      box.observer = null
      box.element = null
    },
    [],
  )

  return selected
}
