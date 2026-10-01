import { Collapsible as BaseCollapsible } from '@base-ui/react/collapsible'
import { ChevronRight } from 'lucide-react'
import { cn } from '#lib/cn.pure'
import { focusRing } from '#lib/focus-ring.styles'

type CollapsibleProps = Omit<BaseCollapsible.Root.Props, 'className'> & {
  className?: string
}

/**
 * Something that opens and closes under a trigger (MAR-3616): a tool call's
 * output, a sidebar section, a details block. Base UI's Collapsible, so the
 * trigger says `aria-expanded` and names what it controls. Controlled with
 * `open` and `onOpenChange`, or not, with `defaultOpen`.
 */
function Collapsible({ className, ...props }: CollapsibleProps) {
  return (
    <BaseCollapsible.Root
      data-slot="collapsible"
      className={className}
      {...props}
    />
  )
}

type CollapsibleTriggerProps = Omit<
  BaseCollapsible.Trigger.Props,
  'className'
> & {
  className?: string
  /** Where its chevron sits, which turns a quarter as it opens; `none` for a trigger that draws its own. */
  chevron?: 'start' | 'end' | 'none'
}

/**
 * The button that opens and closes it: a chevron that turns a quarter as it
 * opens, then its words (or `render` for a trigger of another shape). The
 * chevron stands still under reduced motion and simply points the new way.
 */
function CollapsibleTrigger({
  chevron = 'start',
  className,
  children,
  ...props
}: CollapsibleTriggerProps) {
  const glyph =
    chevron === 'none' ? null : (
      <ChevronRight
        aria-hidden
        data-slot="collapsible-chevron"
        className="size-3 shrink-0 transition-transform duration-fast group-data-panel-open/collapsible:rotate-90 motion-reduce:transition-none"
      />
    )
  return (
    <BaseCollapsible.Trigger
      data-slot="collapsible-trigger"
      className={cn(
        'group/collapsible app-no-drag inline-flex min-w-0 items-center gap-1 rounded-sm text-left',
        focusRing,
        className,
      )}
      {...props}
    >
      {chevron === 'start' ? glyph : null}
      {children}
      {chevron === 'end' ? glyph : null}
    </BaseCollapsible.Trigger>
  )
}

type CollapsiblePanelProps = Omit<BaseCollapsible.Panel.Props, 'className'> & {
  className?: string
}

/**
 * What opens: its height grows from nothing to what it holds over the panel
 * duration, and it fades in as it does; closing runs the other way, and
 * closing halfway reverses (CSS transitions, never keyframes). Reduced motion
 * opens and closes it at once and keeps the fade.
 */
function CollapsiblePanel({ className, ...props }: CollapsiblePanelProps) {
  return (
    <BaseCollapsible.Panel
      data-slot="collapsible-panel"
      className={cn(
        'h-(--collapsible-panel-height) overflow-hidden transition-all duration-panel ease-in-out',
        'data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0',
        'motion-reduce:transition-opacity',
        className,
      )}
      {...props}
    />
  )
}

export {
  Collapsible,
  CollapsiblePanel,
  type CollapsiblePanelProps,
  type CollapsibleProps,
  CollapsibleTrigger,
  type CollapsibleTriggerProps,
}
