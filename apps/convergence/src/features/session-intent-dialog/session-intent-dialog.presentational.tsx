import type { FC } from 'react'
import { MessageSquare, TerminalSquare } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@convergence/ui'

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
  <Dialog open={open} onOpenChange={(open) => onOpenChange(open)}>
    <DialogContent size="md">
      <DialogHeader>
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
          variant="secondary"
          onClick={onSelectConversation}
          data-testid="session-intent-conversation"
          size="lg"
          className="flex h-auto w-full min-w-0 flex-col items-start whitespace-normal rounded-xl p-5 text-left"
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
          variant="secondary"
          onClick={onSelectTerminal}
          data-testid="session-intent-terminal"
          size="lg"
          className="flex h-auto w-full min-w-0 flex-col items-start whitespace-normal rounded-xl p-5 text-left"
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
