import type { FC } from 'react'
import { Button } from '@/shared/ui/button'
import { FileStatusIcon } from '@/shared/ui/file-status-icon.presentational'
import { cn } from '@/shared/lib/cn.pure'
import type { TurnFileChange } from '@/entities/turn'

interface TurnFileItemProps {
  fileChange: TurnFileChange
  selected: boolean
  onSelect: () => void
}

const STATUS_TO_CODE: Record<TurnFileChange['status'], string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
}

function getFileParts(file: string): {
  name: string
  directory: string | null
} {
  const segments = file.split('/')
  const name = segments[segments.length - 1] ?? file
  const directory =
    segments.length > 1
      ? segments.slice(0, segments.length - 1).join('/')
      : null
  return { name, directory }
}

export const TurnFileItem: FC<TurnFileItemProps> = ({
  fileChange,
  selected,
  onSelect,
}) => {
  const { name, directory } = getFileParts(fileChange.filePath)
  const statusCode = STATUS_TO_CODE[fileChange.status]
  const hasCounts = fileChange.additions > 0 || fileChange.deletions > 0

  return (
    <Button
      type="button"
      variant="ghost"
      title={fileChange.filePath}
      className={cn(
        'h-auto w-full justify-start gap-2 rounded px-2 py-1.5 text-left font-normal',
        selected && 'bg-accent',
      )}
      onClick={onSelect}
    >
      <FileStatusIcon status={statusCode} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-xs text-foreground">
          {name}
        </span>
        {directory && (
          <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground">
            {directory}
          </span>
        )}
      </span>
      {hasCounts && (
        <span className="ml-auto flex shrink-0 items-baseline gap-1 font-mono text-[10px]">
          {fileChange.additions > 0 && (
            <span className="text-green-500">+{fileChange.additions}</span>
          )}
          {fileChange.deletions > 0 && (
            <span className="text-red-500">−{fileChange.deletions}</span>
          )}
        </span>
      )}
    </Button>
  )
}
