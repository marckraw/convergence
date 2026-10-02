import type { ComponentProps, FC, ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn, IconButton, SectionLabel } from '@convergence/ui'

type InspectorHeaderProps = Omit<
  ComponentProps<'header'>,
  'className' | 'title' | 'children'
> & {
  /** A small word over the title, in the eyebrow look: "New connection". */
  eyebrow?: ReactNode
  /** What the panel is about. */
  title: ReactNode
  /** A muted line under the title: what state it is in, or what it does. */
  subtitle?: ReactNode
  /** Before the words: the crew's swatch. */
  leading?: ReactNode
  /** The title's own colour or truncation. */
  titleClassName?: string
  /** The ✕'s name and tooltip: "Close crew settings". */
  closeLabel: string
  onClose: () => void
}

/**
 * The head every canvas inspector shares (MC-11): an eyebrow, the title and a
 * muted subtitle at its start, one 28 px ✕ at its end, named for what it
 * closes. The four inspectors wrote it out four times, with the ✕ at two
 * sizes.
 */
export const InspectorHeader: FC<InspectorHeaderProps> = ({
  eyebrow,
  title,
  subtitle,
  leading,
  titleClassName,
  closeLabel,
  onClose,
  ...props
}) => (
  <header className="flex items-start gap-2" {...props}>
    {leading}
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      {eyebrow == null ? null : <SectionLabel>{eyebrow}</SectionLabel>}
      <h3 className={cn('text-sm font-medium', titleClassName)}>{title}</h3>
      {subtitle == null ? null : (
        <div className="text-2xs text-ink-muted">{subtitle}</div>
      )}
    </div>
    <IconButton
      label={closeLabel}
      type="button"
      variant="quiet"
      onClick={onClose}
      size="sm"
      className="shrink-0"
    >
      <X className="size-3.5" />
    </IconButton>
  </header>
)
