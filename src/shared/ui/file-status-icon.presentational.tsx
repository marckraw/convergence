import type { FC } from 'react'
import { FileEdit, FilePlus, FileX, FileQuestion } from 'lucide-react'

interface FileStatusIconProps {
  status: string
}

export const FileStatusIcon: FC<FileStatusIconProps> = ({ status }) => {
  switch (status) {
    case 'M':
      return <FileEdit className="h-3.5 w-3.5 text-amber-500" />
    case 'A':
    case '??':
      return <FilePlus className="h-3.5 w-3.5 text-green-500" />
    case 'D':
      return <FileX className="h-3.5 w-3.5 text-red-500" />
    default:
      return <FileQuestion className="h-3.5 w-3.5 text-muted-foreground" />
  }
}
