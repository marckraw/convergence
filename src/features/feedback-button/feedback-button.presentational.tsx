import type { FormEvent } from 'react'
import type { FeedbackKind } from '@/entities/feedback'
import {
  Bug,
  Lightbulb,
  Loader2,
  MessageSquarePlus,
  Palette,
  Send,
} from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'

interface FeedbackButtonProps {
  open: boolean
  kind: FeedbackKind
  message: string
  contact: string
  error: string | null
  submitting: boolean
  onOpenChange: (open: boolean) => void
  onKindChange: (kind: FeedbackKind) => void
  onMessageChange: (message: string) => void
  onContactChange: (contact: string) => void
  onSubmit: () => void
}

const kinds: Array<{
  value: FeedbackKind
  label: string
  icon: typeof Palette
}> = [
  { value: 'ui', label: 'UI', icon: Palette },
  { value: 'bug', label: 'Bug', icon: Bug },
  { value: 'idea', label: 'Idea', icon: Lightbulb },
  { value: 'other', label: 'Other', icon: MessageSquarePlus },
]

export function FeedbackButton({
  open,
  kind,
  message,
  contact,
  error,
  submitting,
  onOpenChange,
  onKindChange,
  onMessageChange,
  onContactChange,
  onSubmit,
}: FeedbackButtonProps) {
  const canSubmit = message.trim().length >= 5 && !submitting

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (canSubmit) onSubmit()
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            aria-label="Send feedback"
            onClick={() => onOpenChange(true)}
            className="fixed right-4 bottom-10 z-40 h-10 w-10 rounded-full border border-border/70 bg-background/90 shadow-xl shadow-black/15 backdrop-blur-xl hover:bg-accent"
          >
            <MessageSquarePlus className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Send feedback</TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[min(520px,calc(100vw-2rem))]">
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
            <DialogHeader className="border-b border-border/60 px-5 py-4">
              <DialogTitle>Send feedback</DialogTitle>
              <DialogDescription>
                Share what should change in Convergence.
              </DialogDescription>
            </DialogHeader>

            <div className="flex min-h-0 flex-col gap-4 px-5 py-4">
              <div className="grid grid-cols-4 gap-2">
                {kinds.map((item) => {
                  const Icon = item.icon
                  const selected = item.value === kind
                  return (
                    <Button
                      key={item.value}
                      type="button"
                      variant={selected ? 'default' : 'outline'}
                      size="sm"
                      aria-pressed={selected}
                      onClick={() => onKindChange(item.value)}
                      className={cn(
                        'h-9 min-w-0 px-2',
                        !selected && 'bg-background/40',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="truncate">{item.label}</span>
                    </Button>
                  )
                })}
              </div>

              <label className="flex flex-col gap-2 text-sm font-medium">
                Feedback
                <Textarea
                  value={message}
                  onChange={(event) => onMessageChange(event.target.value)}
                  placeholder="What should change?"
                  required
                  minLength={5}
                  rows={7}
                  className="max-h-[34vh] min-h-36 resize-none"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium">
                Contact
                <Input
                  value={contact}
                  onChange={(event) => onContactChange(event.target.value)}
                  placeholder="Optional"
                  autoComplete="email"
                />
              </label>

              {error ? (
                <p className="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </div>

            <DialogFooter className="border-t border-border/60 px-5 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
