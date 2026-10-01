import type { ComponentProps } from 'react'
import { cn } from '#lib/cn.pure'

/**
 * The eyebrow look as a class (R4): 11 px, medium, uppercase, a little
 * tracking, in the muted ink. The app's most common eyebrow, 23 of 84 (R0).
 * For a `*.styles.ts` file or an element that can't be a SectionLabel.
 */
const sectionLabel =
  'text-2xs font-medium tracking-eyebrow text-ink-muted uppercase'

type SectionLabelElement = 'p' | 'h2' | 'h3' | 'h4'

type SectionLabelProps = Omit<ComponentProps<'p'>, 'className'> & {
  className?: string
  /** A heading when it names a section (h2 to h4), a paragraph when it only labels. */
  as?: SectionLabelElement
}

/**
 * A small uppercase label over a group: "Details", "Recent", "Usage"
 * (MAR-3616). Make it a heading (`as="h3"`) when it names the section under
 * it, so heading navigation finds it.
 */
function SectionLabel({
  as: Element = 'p',
  className,
  ...props
}: SectionLabelProps) {
  return (
    <Element
      data-slot="section-label"
      className={cn(sectionLabel, className)}
      {...props}
    />
  )
}

export { SectionLabel, type SectionLabelProps, sectionLabel }
