import type { FC } from 'react'
import { ConfirmDialog } from '@convergence/ui'

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

/**
 * Closing a tab whose process still runs ends that process, so it asks first
 * (R5), in the app's one confirmation: the red button says what it does, and
 * the focus starts on Cancel.
 */
export const CloseConfirmDialog: FC<CloseConfirmDialogProps> = ({
  request,
  onConfirm,
  onCancel,
}) => (
  <ConfirmDialog
    open={request !== null}
    onOpenChange={(next) => {
      if (!next) onCancel()
    }}
    title="Close running terminal?"
    description={
      request ? (
        <>
          A process named <strong>{request.process.name}</strong> (pid{' '}
          {request.process.pid}) is running in this tab. Closing the tab will
          terminate it.
        </>
      ) : null
    }
    confirmLabel="Close anyway"
    variant="danger"
    onConfirm={() => {
      if (request) onConfirm(request)
    }}
  />
)
