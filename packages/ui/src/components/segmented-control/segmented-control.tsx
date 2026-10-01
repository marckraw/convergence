import { Radio as RadioPrimitive } from '@base-ui/react/radio'
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group'
import { createContext, useContext } from 'react'
import { truncateWords } from './truncate-words'
import { cn } from '#lib/cn.pure'
import {
  segmentedItem,
  segmentedItemSize,
  segmentedTrack,
  type SegmentedSize,
} from './segmented-control.styles'

const SegmentedSizeContext = createContext<SegmentedSize>('md')

export type SegmentedControlProps<Value> = Omit<
  RadioGroupPrimitive.Props<Value>,
  'className'
> & {
  className?: string
  /** R3, each item's height: 24, 28 or 32 px. `md` unless said. */
  size?: SegmentedSize
}

/**
 * One choice of two to four short ones, side by side in one control, like a
 * view (Board, List) or a range (7 days, 30 days) (MAR-3616 DS3c). R9: five
 * or more go in a Select; options that need a sentence each are ChoiceCards.
 * It is a radio group on Base UI's: name it with aria-label or
 * aria-labelledby; the arrow keys move the choice, and Tab leaves it from
 * the chosen one. R7: the chosen item is a raised chip on the muted track.
 */
export function SegmentedControl<Value>({
  className,
  size = 'md',
  ...props
}: SegmentedControlProps<Value>) {
  return (
    <SegmentedSizeContext.Provider value={size}>
      <RadioGroupPrimitive
        data-slot="segmented-control"
        data-size={size}
        className={cn(
          segmentedTrack,
          'aria-invalid:border-danger-solid',
          className,
        )}
        {...props}
      />
    </SegmentedSizeContext.Provider>
  )
}

export type SegmentedControlItemProps<Value> = Omit<
  RadioPrimitive.Root.Props<Value>,
  'className'
> & {
  className?: string
}

/**
 * One segment: a word, with an icon before it if you like; its text is its
 * name, on one line, cut short with an ellipsis when the room runs out.
 */
export function SegmentedControlItem<Value>({
  className,
  children,
  ...props
}: SegmentedControlItemProps<Value>) {
  const size = useContext(SegmentedSizeContext)
  return (
    <RadioPrimitive.Root
      data-slot="segmented-control-item"
      data-size={size}
      className={cn(segmentedItem, segmentedItemSize[size], className)}
      {...props}
    >
      {truncateWords(children)}
    </RadioPrimitive.Root>
  )
}
