import {
  useRef,
  type FC,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react'
import {
  MenuButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
} from '@convergence/ui'
import type { HeaderMenuFocus } from './conversation-header.container'
import { interactionKeepsFocusWhereItIs } from './conversation-header.pure'

/** The attribute a Details section carries, so it can be opened at. */
export const DETAILS_SECTION = 'data-details-section'

interface ConversationDetailsMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * The section the menu opens at (the harness, from its alert chip); null
   * opens it at the top.
   */
  openAt: string | null
  /**
   * What opened the menu when it was not its own trigger (the harness alert
   * chip): focus goes back there when it closes.
   */
  invoker: RefObject<HTMLElement | null>
  triggerRef?: Ref<HTMLButtonElement>
  /** From the header, which may have moved this menu into More. */
  contentFocus?: HeaderMenuFocus
  /** The sections, each marked with `DETAILS_SECTION`. */
  children: ReactNode
}

/**
 * The header's Details group (MAR-3429 CH4 R3): one place for what the
 * conversation is -- its session rows, the harness history, the agent's CPU
 * and memory -- none of which holds a place in the row any more. A panel of
 * readings and a few buttons, so a Popover, not a menu: a menu reaches only
 * its items by keyboard (MAR-3616, DLG-23).
 */
export const ConversationDetailsMenu: FC<ConversationDetailsMenuProps> = ({
  open,
  onOpenChange,
  openAt,
  invoker,
  triggerRef,
  contentFocus,
  children,
}) => {
  const panelRef = useRef<HTMLDivElement>(null)
  // A right-click outside leaves focus where it is, whoever opened the panel:
  // the chip's way back obeys the same rule as the trigger's (lap 2 C).
  const keptOutside = useRef(false)
  return (
    <Popover
      open={open}
      onOpenChange={(next, details) => {
        contentFocus?.onOpenChange(next, details)
        if (!next && interactionKeepsFocusWhereItIs(details))
          keptOutside.current = true
        onOpenChange(next)
      }}
    >
      <Tooltip label="Session details, harness history, CPU and memory">
        <PopoverTrigger render={<MenuButton ref={triggerRef} type="button" />}>
          Details
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent
        ref={panelRef}
        aria-label="Details"
        align="end"
        className="max-h-(--available-height) w-96 max-w-(--available-width) overflow-auto p-2 text-xs"
        // The panel takes the focus, so it reads as one place; opened at a
        // section (the harness, from its alert chip), that section does.
        initialFocus={() => {
          const target = openAt
            ? panelRef.current?.querySelector<HTMLElement>(
                `[${DETAILS_SECTION}="${openAt}"]`,
              )
            : null
          target?.scrollIntoView?.({ block: 'start' })
          return target ?? panelRef.current ?? true
        }}
        finalFocus={(closeType) => {
          const headerFocus = contentFocus
            ? contentFocus.finalFocus(closeType)
            : true
          const outside = keptOutside.current
          keptOutside.current = false
          const target = invoker.current
          if (!target?.isConnected) return headerFocus
          return outside ? false : target
        }}
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}
