import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'
import { XIcon } from 'lucide-react'
import { createContext, useContext } from 'react'
import { cn } from '#lib/cn.pure'
import { focusRingInset } from '#lib/focus-ring.styles'
import {
  segmentedItem,
  segmentedItemSize,
  segmentedTrack,
  type SegmentedSize,
} from '../segmented-control/segmented-control.styles'
import { truncateWords } from '../segmented-control/truncate-words'
import { IconButton } from '../icon-button/icon-button'

/**
 * `segmented`: SegmentedControl's look, a raised chip on a muted track (R7),
 * for a few views of one thing. `strip`: a row of document tabs, each with a
 * close slot. `terminal`: the strip on the terminal's own `--terminal-tab*`
 * tokens, dark in both themes (R12), so the pairs the contrast test reads are
 * the ones it draws.
 */
export type TabsVariant = 'segmented' | 'strip' | 'terminal'

type TabsLook = { variant: TabsVariant; size: SegmentedSize }

const TabsLookContext = createContext<TabsLook>({
  variant: 'segmented',
  size: 'md',
})

export type TabsProps = Omit<TabsPrimitive.Root.Props, 'className'> & {
  className?: string
  variant?: TabsVariant
  /** `segmented` only, R3: each tab's height, 24, 28 or 32 px. */
  size?: SegmentedSize
}

/**
 * Tabs (MAR-3616 DS3c), on Base UI's: a list of tabs, each showing its panel.
 * Arrow keys move along the list, Enter or Space opens a tab, and Tab leaves
 * the list from the open one. The open tab says `aria-selected`. For tabs
 * that are pages with their own address, use NavTabs; for a choice that
 * changes no panel, SegmentedControl. In the terminal the `strip` sits in a
 * dark ThemeScope, so it stays dark in both themes (R12).
 */
export function Tabs({
  className,
  variant = 'segmented',
  size = 'md',
  ...props
}: TabsProps) {
  return (
    <TabsLookContext.Provider value={{ variant, size }}>
      <TabsPrimitive.Root
        data-slot="tabs"
        data-variant={variant}
        className={cn('flex flex-col gap-2', className)}
        {...props}
      />
    </TabsLookContext.Provider>
  )
}

export type TabsListProps = Omit<TabsPrimitive.List.Props, 'className'> & {
  className?: string
}

/** The row of tabs. Name it with an aria-label. */
export function TabsList({ className, ...props }: TabsListProps) {
  const { variant } = useContext(TabsLookContext)
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        variant === 'segmented'
          ? segmentedTrack
          : 'flex min-w-0 items-center gap-0.5',
        className,
      )}
      {...props}
    />
  )
}

export type TabsTabProps = Omit<TabsPrimitive.Tab.Props, 'className'> & {
  className?: string
  /**
   * `strip` only: closes this tab. A ✕ beside its words shows while the
   * pointer is over the tab or the tab has the focus (faintly on the open
   * one), and Delete or Backspace on the focused tab closes it too: a tab
   * list holds only tabs, so the ✕ is the pointer's, and the keyboard's
   * close is the key (WAI-ARIA's deletable tabs).
   */
  onClose?: () => void
  /** The ✕'s name: "Close zsh". */
  closeLabel?: string
}

const stripChip =
  'group/tab relative flex min-w-0 items-center gap-1 rounded px-2 py-1 text-2xs transition-colors'

/** A tab in a strip: today's chip, the canvas over the strip when it is open. */
const stripTab = {
  strip: `${stripChip} text-ink-muted hover:bg-canvas/60 has-data-active:bg-canvas has-data-active:text-ink`,
  // The same chip on the terminal's tokens (R12), the dark canvas's values.
  terminal: `${stripChip} text-terminal-tab-ink-muted hover:bg-terminal-tab-hover has-data-active:bg-terminal-tab has-data-active:text-terminal-tab-ink`,
} as const

const CLOSE_KEYS = new Set(['Delete', 'Backspace'])

/**
 * One tab: its words are its name. In a `strip`, pass `onClose` to make it
 * closable.
 */
export function TabsTab({
  className,
  children,
  onClose,
  closeLabel = 'Close tab',
  onKeyDown,
  ...props
}: TabsTabProps) {
  const { variant, size } = useContext(TabsLookContext)
  if (variant === 'segmented') {
    return (
      <TabsPrimitive.Tab
        data-slot="tabs-tab"
        data-size={size}
        className={cn(segmentedItem, segmentedItemSize[size], className)}
        onKeyDown={onKeyDown}
        {...props}
      >
        {truncateWords(children)}
      </TabsPrimitive.Tab>
    )
  }
  return (
    <div data-slot="tabs-strip-tab" className={stripTab[variant]}>
      <TabsPrimitive.Tab
        data-slot="tabs-tab"
        aria-keyshortcuts={onClose ? 'Delete' : undefined}
        onKeyDown={(event) => {
          onKeyDown?.(event)
          if (onClose && CLOSE_KEYS.has(event.key)) {
            event.preventDefault()
            onClose()
          }
        }}
        className={cn(
          // Reaches into the chip's padding without moving it, so the ring
          // drawn inside its edge clears the words.
          '-mx-1 -my-0.5 flex min-w-0 items-center gap-1 rounded-sm px-1 py-0.5',
          focusRingInset,
          'data-disabled:opacity-50',
          'app-no-drag',
          className,
        )}
        {...props}
      >
        {truncateWords(children)}
      </TabsPrimitive.Tab>
      {onClose ? (
        <span
          data-slot="tabs-close"
          aria-hidden
          className={cn(
            'flex shrink-0 opacity-0 transition-opacity group-has-data-active/tab:opacity-70',
            // Shown whole under the pointer or the keyboard, the open tab's too.
            'group-hover/tab:opacity-100! group-focus-within/tab:opacity-100!',
          )}
        >
          {/* The pointer's close: out of the tab order (Delete is the keyboard's). */}
          <IconButton
            label={closeLabel}
            size="xs"
            tabIndex={-1}
            onClick={(event) => {
              event.stopPropagation()
              onClose()
            }}
            // 24 px to aim at, 16 px in the row: the chip keeps its height.
            className="-my-1"
          >
            <XIcon aria-hidden className="size-3" />
          </IconButton>
        </span>
      ) : null}
    </div>
  )
}

export type TabsPanelProps = Omit<TabsPrimitive.Panel.Props, 'className'> & {
  className?: string
}

/** What one tab shows. */
export function TabsPanel({ className, ...props }: TabsPanelProps) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-panel"
      className={cn('min-w-0', focusRingInset, className)}
      {...props}
    />
  )
}
