import type { FC, KeyboardEvent } from 'react'
import { WAVE_RESIZE_HANDLE_CLASS } from './wave-panel.styles'

interface WaveResizeHandleProps {
  /** The width on screen, for `aria-valuenow`. */
  width: number
  min: number
  max: number
  onMouseDown: () => void
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  onDoubleClick: () => void
}

/**
 * The column's right edge as a control (MAR-3155 R4).
 *
 * A `separator` with a value, not a decorative strip: the arrow keys move it,
 * so it has to be reachable and to say where it is. It wears the kit's
 * ResizeHandle look (MC-32) but keeps Loom's own gesture: the kit's handle
 * reports every move, and Loom's hook commits a width only when the drag or
 * the step ends, weighed against the column on screen then.
 */
export const WaveResizeHandle: FC<WaveResizeHandleProps> = ({
  width,
  min,
  max,
  onMouseDown,
  onKeyDown,
  onDoubleClick,
}) => (
  <div
    role="separator"
    aria-orientation="vertical"
    aria-label="Resize the wave column"
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={width}
    tabIndex={0}
    data-wave-resize-handle
    className={WAVE_RESIZE_HANDLE_CLASS}
    onMouseDown={onMouseDown}
    onKeyDown={onKeyDown}
    onDoubleClick={onDoubleClick}
  />
)
