import type { FC } from 'react'
import { MessageSquare, TerminalSquare } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Button } from '@/shared/ui/button'

export interface SessionIntentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectConversation: () => void
  onSelectTerminal: () => void
}

export const SessionIntentDialog: FC<SessionIntentDialogProps> = ({
  open,
  onOpenChange,
  onSelectConversation,
  onSelectTerminal,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="p-0 sm:max-w-[560px]">
      <DialogHeader className="border-b border-border/70 px-6 py-5">
        <DialogTitle>New session</DialogTitle>
        <DialogDescription>
          Pick how you want this session to run.
        </DialogDescription>
      </DialogHeader>
      <div
        className="grid gap-3 px-6 py-5 sm:grid-cols-2"
        data-testid="session-intent-options"
      >
        <Button
          type="button"
          variant="outline"
          className="flex h-auto w-full min-w-0 flex-col items-start gap-2 whitespace-normal rounded-xl p-5 text-left"
          onClick={onSelectConversation}
          data-testid="session-intent-conversation"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <MessageSquare className="h-4 w-4" />
            Conversation
          </span>
          <span className="w-full whitespace-normal break-words text-xs leading-snug text-muted-foreground">
            Talk to an AI agent in this workspace.
          </span>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex h-auto w-full min-w-0 flex-col items-start gap-2 whitespace-normal rounded-xl p-5 text-left"
          onClick={onSelectTerminal}
          data-testid="session-intent-terminal"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <TerminalSquare className="h-4 w-4" />
            Terminal
          </span>
          <span className="w-full whitespace-normal break-words text-xs leading-snug text-muted-foreground">
            Open a shell-only session with no agent attached.
          </span>
        </Button>
      </div>
    </DialogContent>
  </Dialog>
)
