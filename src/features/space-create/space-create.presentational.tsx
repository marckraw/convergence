import type { FC } from 'react'
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

interface SpaceCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  brief: string
  isSubmitting: boolean
  error: string | null
  onTitleChange: (value: string) => void
  onBriefChange: (value: string) => void
  onSubmit: () => void
}

export const SpaceCreateDialog: FC<SpaceCreateDialogProps> = ({
  open,
  onOpenChange,
  title,
  brief,
  isSubmitting,
  error,
  onTitleChange,
  onBriefChange,
  onSubmit,
}) => {
  const canSubmit = title.trim().length > 0 && !isSubmitting

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader className="border-b border-white/10 px-6 py-5">
          <DialogTitle>New Space</DialogTitle>
          <DialogDescription>
            Create a durable Chat context for related attempts.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (canSubmit) onSubmit()
          }}
        >
          <div className="space-y-5 overflow-y-auto px-6 py-5">
            <section className="space-y-2">
              <label htmlFor="space-title" className="text-sm font-medium">
                Title
              </label>
              <Input
                id="space-title"
                value={title}
                onChange={(event) => onTitleChange(event.target.value)}
                placeholder="Launch plan"
                autoFocus
                disabled={isSubmitting}
              />
            </section>

            <section className="space-y-2">
              <label htmlFor="space-brief" className="text-sm font-medium">
                Initial brief
              </label>
              <Textarea
                id="space-brief"
                value={brief}
                onChange={(event) => onBriefChange(event.target.value)}
                placeholder="Purpose, constraints, and useful background."
                disabled={isSubmitting}
                className="min-h-28"
              />
            </section>

            {error ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter className="border-t border-white/10 px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting ? 'Creating...' : 'Create Space'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
