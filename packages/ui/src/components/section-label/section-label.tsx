import { cva } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '#lib/cn.pure'

/**
 * The eyebrow look as classes (R4): medium, uppercase, a little tracking, in
 * the muted ink; 11 px (`md`), or 10 px (`sm`), the step Mission Control,
 * Loom and the conversation's small eyebrows wear (DS-20, MC-5). For a
 * `*.styles.ts` file or an element that can't be a SectionLabel.
 */
const sectionLabelVariants = cva(
  'font-medium tracking-eyebrow text-ink-muted uppercase',
  {
    variants: {
      size: {
        sm: 'text-3xs',
        md: 'text-2xs',
      },
    },
    defaultVariants: { size: 'md' },
  },
)

/**
 * The eyebrow look as a class, at 11 px: the app's most common eyebrow, 23 of
 * 84 (R0).
 */
const sectionLabel = sectionLabelVariants({ size: 'md' })

type SectionLabelElement = 'p' | 'h2' | 'h3' | 'h4'

type SectionLabelSize = 'sm' | 'md'

type SectionLabelProps = Omit<ComponentProps<'p'>, 'className'> & {
  className?: string
  /** A heading when it names a section (h2 to h4), a paragraph when it only labels. */
  as?: SectionLabelElement
  /** 11 px (`md`, the default), or 10 px (`sm`) for a dense panel's eyebrow (R4). */
  size?: SectionLabelSize
}

/**
 * A small uppercase label over a group: "Details", "Recent", "Usage"
 * (MAR-3616). Make it a heading (`as="h3"`) when it names the section under
 * it, so heading navigation finds it.
 */
function SectionLabel({
  as: Element = 'p',
  size = 'md',
  className,
  ...props
}: SectionLabelProps) {
  return (
    <Element
      data-slot="section-label"
      data-size={size}
      className={cn(sectionLabelVariants({ size }), className)}
      {...props}
    />
  )
}

export {
  SectionLabel,
  type SectionLabelProps,
  type SectionLabelSize,
  sectionLabel,
  sectionLabelVariants,
}
