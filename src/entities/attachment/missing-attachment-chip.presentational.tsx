import type { FC } from 'react'
import { FileWarning } from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'

interface MissingAttachmentChipProps {
  attachmentId: string
  filename?: string
}

export const MissingAttachmentChip: FC<MissingAttachmentChipProps> = ({
  attachmentId,
  filename,
}) => {
  const label = filename ?? 'Unavailable attachment'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-dashed bg-muted/20 py-1 pl-2 pr-2 text-xs text-muted-foreground',
      )}
      data-testid="missing-attachment-chip"
      data-attachment-id={attachmentId}
      title="Attachment file is no longer available"
    >
      <FileWarning className="h-3.5 w-3.5" />
      <span className="max-w-[12rem] truncate italic">{label}</span>
    </span>
  )
}
