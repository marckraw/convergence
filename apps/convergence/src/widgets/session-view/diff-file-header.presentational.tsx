import type { FC, ReactNode } from 'react'
import { Spinner, Tooltip } from '@convergence/ui'

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
        <span className="rounded border border-border px-1.5 py-0.5 font-mono text-3xs text-muted-foreground">
          {status}
        </span>
      ) : null}
      <Tooltip label={path} when="truncated">
        <p className="min-w-0 flex-1 truncate font-mono text-xs text-ink">
          {path}
        </p>
      </Tooltip>
      {loading ? <Spinner size="sm" className="text-ink-muted" /> : null}
      {actions}
    </div>
    {subtitle ? (
      <p
        className={
          subtitleVariant === 'description'
            ? 'mt-1 text-xs leading-5 text-muted-foreground'
            : 'mt-1 text-3xs uppercase tracking-wider text-muted-foreground'
        }
      >
        {subtitle}
      </p>
    ) : null}
  </div>
)
