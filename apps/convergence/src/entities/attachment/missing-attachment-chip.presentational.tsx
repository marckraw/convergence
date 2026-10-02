import type { FC } from 'react'
import { FileWarning } from 'lucide-react'
import { Chip, Tooltip } from '@convergence/ui'

interface MissingAttachmentChipProps {
  attachmentId: string
  filename?: string
}

/** What its tooltip says, and a screen reader hears after the name. */
const MISSING = 'Attachment file is no longer available'

/**
 * A sent attachment whose file is gone: a dashed Chip with its name, and
 * nothing to open. Our tooltip says why (R2); a screen reader hears it too.
 */
export const MissingAttachmentChip: FC<MissingAttachmentChipProps> = ({
  attachmentId,
  filename,
}) => {
  const label = filename ?? 'Unavailable attachment'
  return (
    <Tooltip label={MISSING}>
      <Chip
        dashed
        icon={<FileWarning />}
        data-testid="missing-attachment-chip"
        data-attachment-id={attachmentId}
      >
        <span className="italic">{label}</span>
        <span className="sr-only">. {MISSING}</span>
      </Chip>
    </Tooltip>
  )
}
