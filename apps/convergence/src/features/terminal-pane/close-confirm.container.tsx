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

export interface CloseConfirmRequest {
  sessionId: string
  leafId: string
  tabId: string
  process: { pid: number; name: string }
}

interface CloseConfirmDialogProps {
  request: CloseConfirmRequest | null
  onConfirm: (req: CloseConfirmRequest) => void
  onCancel: () => void
}

export const CloseConfirmDialog: FC<CloseConfirmDialogProps> = ({
  request,
  onConfirm,
  onCancel,
}) => {
  const open = request !== null
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
    >
      <DialogContent className="w-[min(420px,calc(100vw-2rem))] gap-4 p-5">
        <DialogHeader>
          <DialogTitle>Close running terminal?</DialogTitle>
          <DialogDescription>
            {request ? (
              <>
                A process named <strong>{request.process.name}</strong> (pid{' '}
                {request.process.pid}) is running in this tab. Closing the tab
                will terminate it.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              if (request) onConfirm(request)
            }}
          >
            Close anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
