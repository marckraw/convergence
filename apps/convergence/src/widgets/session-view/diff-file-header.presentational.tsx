import type { FC, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

export type DiffFileHeaderSubtitleVariant = 'description' | 'label'

export interface DiffFileHeaderProps {
  path: string
  subtitle?: string
  subtitleVariant?: DiffFileHeaderSubtitleVariant
  status?: string
  loading?: boolean
  actions?: ReactNode
}

export const DiffFileHeader: FC<DiffFileHeaderProps> = ({
  path,
  subtitle,
  subtitleVariant = 'label',
  status,
  loading = false,
  actions = null,
}) => (
  <div className="shrink-0 border-b border-border px-3 py-2">
    <div className="flex min-w-0 items-center gap-2">
      {status ? (
        <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {status}
        </span>
      ) : null}
      <p
        title={path}
        className="min-w-0 flex-1 truncate font-mono text-xs text-foreground"
      >
        {path}
      </p>
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
      ) : null}
      {actions}
    </div>
    {subtitle ? (
      <p
        className={
          subtitleVariant === 'description'
            ? 'mt-1 text-xs leading-5 text-muted-foreground'
            : 'mt-1 text-[10px] uppercase tracking-wider text-muted-foreground'
        }
      >
        {subtitle}
      </p>
    ) : null}
  </div>
)
