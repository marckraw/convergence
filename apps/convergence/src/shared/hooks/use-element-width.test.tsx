import { useRef, type RefObject } from 'react'
import { act, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useElementWidth } from './use-element-width'

afterEach(() => vi.unstubAllGlobals())

/** An element of a given width and the ResizeObservers watching it. */
function measured(width: number) {
  let current = width
  const element = document.createElement('div')
  element.getBoundingClientRect = () => ({ width: current }) as DOMRect
  const observers = new Set<() => void>()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private readonly callback: () => void) {}
      observe() {
        observers.add(this.callback)
      }
      unobserve() {}
      disconnect() {
        observers.delete(this.callback)
      }
    },
  )
  return {
    element,
    observers,
    resize: (next: number) => {
      current = next
      for (const observer of [...observers]) observer()
    },
  }
}

const bucket = (bound: number) => (width: number | null) =>
  width === null ? 'unknown' : width >= bound ? 'wide' : 'narrow'

function Probe({
  target,
  bound,
  seen,
}: {
  target: RefObject<HTMLElement | null>
  bound: number
  seen: string[]
}) {
  seen.push(useElementWidth(target, bucket(bound)))
  return null
}

it('publishes the derived value, renders only when it changes, and disconnects on unmount — mutation keep the width in state turns red', () => {
  const box = measured(1000)
  const seen: string[] = []
  const { unmount } = render(
    <Probe target={{ current: box.element }} bound={800} seen={seen} />,
  )
  const mounted = [...seen]
  for (let width = 990; width >= 810; width -= 10) act(() => box.resize(width))
  const sameSide = seen.length - mounted.length
  act(() => box.resize(700))
  const last = seen.at(-1)
  unmount()
  expect({
    mounted,
    sameSide,
    last,
    observersAfterUnmount: box.observers.size,
  }).toEqual({
    mounted: ['unknown', 'wide'],
    sameSide: 0,
    last: 'narrow',
    observersAfterUnmount: 0,
  })
})

it('re-derives from the last width when select changes, without a resize — mutation read select only at mount turns red', () => {
  const box = measured(1000)
  const seen: string[] = []
  const target = { current: box.element }
  const { rerender } = render(<Probe target={target} bound={800} seen={seen} />)
  rerender(<Probe target={target} bound={1200} seen={seen} />)
  expect(seen.at(-1)).toBe('narrow')
})

it('measures an ancestor whose ref attaches after the child mounts — mutation layout pass only turns red', () => {
  const seen: string[] = []
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  )
  function Row() {
    const row = useRef<HTMLDivElement>(null)
    return (
      <div
        ref={(element) => {
          row.current = element
          if (element)
            element.getBoundingClientRect = () => ({ width: 1000 }) as DOMRect
        }}
      >
        <Probe target={row} bound={800} seen={seen} />
      </div>
    )
  }
  render(<Row />)
  expect(seen.at(-1)).toBe('wide')
})
