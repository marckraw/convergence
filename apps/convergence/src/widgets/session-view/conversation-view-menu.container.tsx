import { useRef, type FC, type Ref } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  Button,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Tooltip,
} from '@convergence/ui'
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
    <Menu
      open={open}
      onOpenChange={(next, details) => {
        contentFocus?.onOpenChange(next, details)
        onOpenChange(next)
      }}
    >
      <Tooltip label="How the conversation is drawn, and parallel work">
        <MenuTrigger
          render={
            <Button
              ref={triggerRef}
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1"
            />
          }
        >
          View
          <ChevronDown className="h-3 w-3" />
        </MenuTrigger>
      </Tooltip>
      <MenuContent
        align="end"
        className="min-w-48"
        finalFocus={(closeType) => {
          const focus = contentFocus ? contentFocus.finalFocus(closeType) : true
          if (openParallel.current) {
            openParallel.current = false
            onOpenParallelWork()
          }
          return focus
        }}
      >
        <TranscriptViewMenuItems
          mode={mode}
          onChange={(next) => setMode(sessionId, next)}
        />
        <MenuSeparator />
        <MenuItem
          onClick={() => {
            openParallel.current = true
          }}
        >
          Parallel work history
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
