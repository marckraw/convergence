import {
  useCallback,
  useRef,
  type FC,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
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
 * and memory -- none of which holds a place in the row any more.
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
  // Focuses the section the menu opens at. A ref runs at commit, before
  // Radix's focus scope moves focus into the menu -- and the scope leaves a
  // focus that is already inside alone. Keyed on the section, so it runs
  // again only when the section asked for changes.
  const openAtRef = useCallback(
    (marker: HTMLSpanElement | null) => {
      if (!marker || !openAt) return
      const target = marker.parentElement?.querySelector<HTMLElement>(
        `[${DETAILS_SECTION}="${openAt}"]`,
      )
      target?.focus()
      target?.scrollIntoView?.({ block: 'start' })
    },
    [openAt],
  )
  // A right-click outside leaves focus where it is, whoever opened the menu:
  // the chip's way back obeys the same rule as the trigger's (lap 2 C).
  const keptOutside = useRef(false)
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          title="Session details, harness history, CPU and memory"
        >
          Details
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-[70vh] w-96 max-w-[calc(100vw-2rem)] overflow-auto p-2 text-xs"
        onInteractOutside={(event) => {
          contentFocus?.onInteractOutside(event)
          if (interactionKeepsFocusWhereItIs(event)) keptOutside.current = true
        }}
        onCloseAutoFocus={(event) => {
          contentFocus?.onCloseAutoFocus(event)
          const outside = keptOutside.current
          keptOutside.current = false
          const target = invoker.current
          if (!target?.isConnected) return
          event.preventDefault()
          if (!outside) target.focus()
        }}
      >
        <span ref={openAtRef} hidden />
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
