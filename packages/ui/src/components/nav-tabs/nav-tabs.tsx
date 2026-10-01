import { useRender } from '@base-ui/react/use-render'
import { createContext, useContext, type ComponentProps } from 'react'
import { cn } from '#lib/cn.pure'
import {
  segmentedItem,
  segmentedItemSize,
  segmentedTrack,
  type SegmentedSize,
} from '../segmented-control/segmented-control.styles'

const NavTabsSizeContext = createContext<SegmentedSize>('md')

export type NavTabsProps = Omit<
  ComponentProps<'nav'>,
  'className' | 'aria-label'
> & {
  className?: string
  /** What the tabs are, for screen readers: "Surfaces". */
  'aria-label': string
  /** R3: each tab's height, 24, 28 or 32 px. `md` unless said. */
  size?: SegmentedSize
}

/**
 * Tabs that are navigation (MAR-3616 DS3c): each is a link to its own place,
 * like the surface switcher if it routes. They look like SegmentedControl,
 * whose classes they share (the one on screen is the raised chip, R7), but
 * they're a <nav> of links: Tab moves through them and Enter follows one.
 * For a choice that only changes what's shown here, use SegmentedControl.
 */
export function NavTabs({ className, size = 'md', ...props }: NavTabsProps) {
  return (
    <NavTabsSizeContext.Provider value={size}>
      <nav
        data-slot="nav-tabs"
        data-size={size}
        className={cn(segmentedTrack, className)}
        {...props}
      />
    </NavTabsSizeContext.Provider>
  )
}

export type NavTabProps = Omit<useRender.ComponentProps<'a'>, 'className'> & {
  className?: string
  /**
   * This tab's place is the one on screen: it says aria-current="page" and
   * is raised. A router's link that sets aria-current itself needs nothing.
   */
  current?: boolean
}

/**
 * One tab: a link, whose text is its name. Pass `render` for a router's link
 * or a button, or an `href` for a plain one.
 */
export function NavTab({
  render,
  current,
  className,
  ref,
  ...props
}: NavTabProps) {
  const size = useContext(NavTabsSizeContext)
  return useRender({
    defaultTagName: 'a',
    render,
    ref,
    props: {
      'data-slot': 'nav-tab',
      'data-size': size,
      className: cn(segmentedItem, segmentedItemSize[size], className),
      // Left out rather than undefined, so a router's link keeps its own.
      ...(current ? { 'aria-current': 'page' as const } : {}),
      ...props,
    },
  })
}
