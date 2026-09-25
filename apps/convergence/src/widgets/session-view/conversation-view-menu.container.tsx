import { useRef, type FC, type Ref } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import type { HeaderMenuFocus } from './conversation-header.container'
import { TranscriptViewMenuItems } from './transcript-view-switch.presentational'
import {
  useTranscriptViewMode,
  useTranscriptViewStore,
} from './transcript-view.model'

interface ConversationViewMenuProps {
  sessionId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Opens the Parallel work panel, its whole history. */
  onOpenParallelWork: () => void
  triggerRef?: Ref<HTMLButtonElement>
  /** From the header, which may have moved this menu into More. */
  contentFocus?: HeaderMenuFocus
}

/**
 * The header's View group (MAR-3429 CH4 R1): how the conversation is drawn
 * (Compact / Full, bound to the one remembered choice of MAR-3391 R5) and
 * the way into Parallel work's history, which no longer holds a place in the
 * row when nothing runs. Every surface that draws a transcript mounts this
 * one, so a surface that folds can never ship without the way back to Full.
 */
export const ConversationViewMenu: FC<ConversationViewMenuProps> = ({
  sessionId,
  open,
  onOpenChange,
  onOpenParallelWork,
  triggerRef,
  contentFocus,
}) => {
  const mode = useTranscriptViewMode(sessionId)
  const setMode = useTranscriptViewStore((state) => state.setMode)
  // The panel opens once the menu has gone. Its focus return is left to run
  // (lap 2 B): View takes focus back, or More when View has yielded. A docked
  // panel never takes focus, so focus stays on View, beside it; the overlay's
  // dialog mounts after this and moves focus inside itself.
  const openParallel = useRef(false)
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          title="How the conversation is drawn, and parallel work"
        >
          View
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-48"
        onInteractOutside={contentFocus?.onInteractOutside}
        onCloseAutoFocus={(event) => {
          contentFocus?.onCloseAutoFocus(event)
          if (!openParallel.current) return
          openParallel.current = false
          onOpenParallelWork()
        }}
      >
        <TranscriptViewMenuItems
          mode={mode}
          onChange={(next) => setMode(sessionId, next)}
        />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            openParallel.current = true
          }}
        >
          Parallel work history
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
