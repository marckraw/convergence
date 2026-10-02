import { type KeyboardEvent, type PointerEvent, useEffect, useRef } from 'react'
import { cn } from '#lib/cn.pure'
import { resizeHandleStyles } from './resize-handle.styles'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

/** The keys that move it, by orientation: [smaller, larger]. */
const KEYS = {
  vertical: ['ArrowLeft', 'ArrowRight'],
  horizontal: ['ArrowUp', 'ArrowDown'],
} as const

type ResizeHandleProps = {
  /**
   * `vertical`: a line running down between two panes side by side, which
   * resizes a width (the sidebar's). `horizontal`: a line across, between
   * panes stacked, which resizes a height (the terminal dock's).
   */
  orientation?: 'vertical' | 'horizontal'
  /** The size it controls now, in px. */
  value: number
  min: number
  max: number
  /** A new size, already kept within min and max. */
  onChange: (value: number) => void
  /** Back to the default size: a double-click. */
  onReset?: () => void
  /** How far one arrow key moves it, in px; 16 unless told otherwise. */
  step?: number
  /**
   * The pane it sizes sits after it (a panel docked at the end, a dock at the
   * bottom), so moving the line towards the start makes it larger.
   */
  reverse?: boolean
  /** What it resizes, for a screen reader: "Resize the sidebar". */
  label: string
  className?: string
}

/**
 * The line between two panes that you drag to resize one of them (MAR-3616):
 * a 1 px line in a 13 px hit area, as the sidebar's is today, which shows a
 * hairline under the pointer and the focus colour for the keyboard, in both
 * themes (MC-32). It is a focusable separator with its value, min and max
 * (NAV-16: today's has no keyboard): the arrow keys move it a step, Home and
 * End to its ends, a drag follows the pointer, and a double-click resets it.
 * The caller keeps the size and passes it back.
 */
function ResizeHandle({
  orientation = 'vertical',
  value,
  min,
  max,
  onChange,
  onReset,
  step = 16,
  reverse = false,
  label,
  className,
}: ResizeHandleProps) {
  const direction = reverse ? -1 : 1
  // The latest onChange, so a drag in progress calls the current one.
  const change = useRef(onChange)
  useEffect(() => {
    change.current = onChange
  })
  // Ends a drag in progress: also when the handle goes away mid-drag.
  const stopDrag = useRef<(() => void) | null>(null)
  useEffect(() => () => stopDrag.current?.(), [])

  const onKeyDown = (event: KeyboardEvent) => {
    const [smaller, larger] = KEYS[orientation]
    let next: number | null = null
    if (event.key === smaller) next = value - step * direction
    else if (event.key === larger) next = value + step * direction
    else if (event.key === 'Home') next = min
    else if (event.key === 'End') next = max
    if (next === null) return
    event.preventDefault()
    onChange(clamp(next, min, max))
  }

  /**
   * A drag follows the pointer anywhere in the window, not only over the
   * 13 px handle, until the button is let go.
   */
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    stopDrag.current?.()
    const along = (pointer: { clientX: number; clientY: number }) =>
      orientation === 'vertical' ? pointer.clientX : pointer.clientY
    const from = along(event)
    const start = value
    const move = (pointer: globalThis.PointerEvent) =>
      change.current(
        clamp(start + (along(pointer) - from) * direction, min, max),
      )
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      stopDrag.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    stopDrag.current = stop
  }

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={orientation}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      data-slot="resize-handle"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onDoubleClick={onReset}
      // Its pointer says what it does: a resize, not the hand of a click.
      className={cn(
        resizeHandleStyles.base,
        resizeHandleStyles[orientation],
        className,
      )}
    />
  )
}

export { ResizeHandle, type ResizeHandleProps }
