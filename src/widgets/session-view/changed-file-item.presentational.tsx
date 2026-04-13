import type { FC } from 'react'
import { Button } from '@/shared/ui/button'
import { ChevronRight } from 'lucide-react'
import { FileStatusIcon } from '@/shared/ui/file-status-icon.presentational'
import { cn } from '@/shared/lib/cn.pure'

interface ChangedFileItemProps {
  status: string
  file: string
  selected: boolean
  onSelect: () => void
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

export const ChangedFileItem: FC<ChangedFileItemProps> = ({
  status,
  file,
  selected,
  onSelect,
}) => {
  const { name, directory } = getFileParts(file)

  return (
    <Button
      type="button"
      variant="ghost"
      title={file}
      className={cn(
        'h-auto w-full justify-start gap-2 rounded px-2 py-2 text-left font-normal',
        selected && 'bg-accent',
      )}
      onClick={onSelect}
    >
      <ChevronRight
        className={cn(
          'mt-0.5 h-3 w-3 shrink-0 transition-transform',
          selected && 'rotate-90',
        )}
      />
      <FileStatusIcon status={status} />
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
    </Button>
  )
}
