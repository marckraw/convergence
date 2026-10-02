import type { FC, ReactNode } from 'react'
import { MessageSquare, TerminalSquare } from 'lucide-react'
import {
  Card,
  CardAction,
  Dialog,
  DialogBody,
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

/**
 * One way to run the session, as a door: picking it is the dialog's ending
 * (R6), so it is a Card whose CardAction covers it, not a radio that would
 * act as the arrow keys move.
 */
const renderIntentCard = ({
  testId,
  icon,
  title,
  description,
  onSelect,
}: {
  testId: string
  icon: ReactNode
  title: string
  description: string
  onSelect: () => void
}) => (
  <Card surface="raised" interactive padding="md">
    <CardAction
      onClick={onSelect}
      data-testid={testId}
      className="flex w-full min-w-0 flex-col items-start gap-2"
    >
      <span className="flex items-center gap-2 text-sm font-medium text-ink">
        {icon}
        {title}
      </span>
      <span className="w-full whitespace-normal break-words text-xs leading-snug text-ink-muted">
        {description}
      </span>
    </CardAction>
  </Card>
)

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
      {/* Pick and go: the choice is the ending, so there is no footer (R6). */}
      <DialogBody
        className="grid gap-3 sm:grid-cols-2"
        data-testid="session-intent-options"
      >
        {renderIntentCard({
          testId: 'session-intent-conversation',
          icon: <MessageSquare className="size-4" />,
          title: 'Conversation',
          description: 'Talk to an AI agent in this workspace.',
          onSelect: onSelectConversation,
        })}
        {renderIntentCard({
          testId: 'session-intent-terminal',
          icon: <TerminalSquare className="size-4" />,
          title: 'Terminal',
          description: 'Open a shell-only session with no agent attached.',
          onSelect: onSelectTerminal,
        })}
      </DialogBody>
    </DialogContent>
  </Dialog>
)
