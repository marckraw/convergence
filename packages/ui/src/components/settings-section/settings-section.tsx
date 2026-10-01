import { type ComponentProps, type ReactNode, useId } from 'react'
import { cn } from '#lib/cn.pure'

type SettingsSectionProps = Omit<
  ComponentProps<'section'>,
  'className' | 'title'
> & {
  className?: string
  /** Its name: the section's heading. */
  title: ReactNode
  /** What it does, in a sentence or two, under the name. Always shown, never behind an ⓘ. */
  description?: ReactNode
  /** A 16 px glyph before the name, muted. */
  icon?: ReactNode
  /** Its controls: under the heading, or at the end of a compact row. */
  children?: ReactNode
  /** One setting on one row: its name (and description) at the start, its control at the end. */
  compact?: boolean
  /** A hairline above it and room under that, to set it off from the section before. */
  divided?: boolean
  /** Its heading's level; h4, as the settings dialog's subsections are, unless told otherwise. */
  headingLevel?: 3 | 4
}

/**
 * A group of settings, or one setting on its row (MAR-3616), as the settings
 * dialog draws them today (R0): a subsection is its 14 px semibold heading,
 * a muted line under it, and its controls (SettingsSubsection); a compact
 * one is the bordered row with the name at its start and the control at its
 * end (SettingsControlField). The description is shown under the name, not
 * hidden in an ⓘ tooltip (DLG-11). It's a region named by its heading.
 */
function SettingsSection({
  title,
  description,
  icon,
  children,
  compact = false,
  divided = false,
  headingLevel = 4,
  className,
  ...props
}: SettingsSectionProps) {
  const titleId = useId()
  const Heading = `h${headingLevel}` as const
  const glyph =
    icon == null ? null : (
      <span
        aria-hidden
        className={cn(
          'flex shrink-0 text-ink-muted [&_svg]:size-4',
          !compact && 'mt-0.5',
        )}
      >
        {icon}
      </span>
    )
  if (compact) {
    return (
      <section
        aria-labelledby={titleId}
        data-slot="settings-section"
        data-compact=""
        className={cn(
          'flex items-center justify-between gap-4 rounded-xl border border-line-soft bg-surface/45 px-4 py-2.5',
          className,
        )}
        {...props}
      >
        <div className="flex min-w-0 items-center gap-2">
          {glyph}
          <div className="flex min-w-0 flex-col">
            <Heading
              id={titleId}
              className="truncate text-sm font-medium text-ink"
            >
              {title}
            </Heading>
            {description == null ? null : (
              <p className="text-xs text-ink-muted">{description}</p>
            )}
          </div>
        </div>
        {children == null ? null : (
          <div className="min-w-0 shrink-0">{children}</div>
        )}
      </section>
    )
  }
  return (
    <section
      aria-labelledby={titleId}
      data-slot="settings-section"
      className={cn(
        'space-y-3',
        divided && 'border-t border-line-soft pt-6',
        className,
      )}
      {...props}
    >
      <div className="flex items-start gap-2">
        {glyph}
        <div className="min-w-0">
          <Heading id={titleId} className="text-sm font-semibold text-ink">
            {title}
          </Heading>
          {description == null ? null : (
            <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-ink-muted">
              {description}
            </p>
          )}
        </div>
      </div>
      {children}
    </section>
  )
}

export { SettingsSection, type SettingsSectionProps }
