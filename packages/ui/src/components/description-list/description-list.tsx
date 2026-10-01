import {
  createContext,
  type ComponentProps,
  type ReactNode,
  useContext,
} from 'react'
import { cn } from '#lib/cn.pure'

/**
 * `stacked`: each term over its value, as Parallel work's details are.
 * `inline`: the term at the start of its line and the value at the end, as
 * the conversation's Details rows are.
 */
type DescriptionListLayout = 'stacked' | 'inline'

/** `compact` is the 11 px print of panels and popovers; `default` the body's 12 and 14. */
type DescriptionListDensity = 'default' | 'compact'

const DescriptionListContext = createContext<{
  layout: DescriptionListLayout
  density: DescriptionListDensity
}>({ layout: 'stacked', density: 'default' })

const LISTS: Record<DescriptionListLayout, string> = {
  stacked: 'flex flex-col gap-3',
  inline: 'flex flex-col gap-1',
}

const ITEMS: Record<DescriptionListLayout, string> = {
  stacked: 'flex min-w-0 flex-col gap-0.5',
  inline: 'flex min-w-0 items-baseline justify-between gap-3',
}

const TERMS: Record<DescriptionListDensity, string> = {
  default: 'text-xs',
  compact: 'text-2xs',
}

const VALUES: Record<DescriptionListDensity, string> = {
  default: 'text-sm',
  compact: 'text-xs',
}

type DescriptionListProps = Omit<ComponentProps<'dl'>, 'className'> & {
  className?: string
  layout?: DescriptionListLayout
  density?: DescriptionListDensity
}

/**
 * Facts as terms and values (MAR-3616): a `<dl>`, so a screen reader hears
 * each value with its name. One part for the five key/value layouts the
 * conversation draws today (CONV-24). Fill it with DescriptionItems.
 */
function DescriptionList({
  layout = 'stacked',
  density = 'default',
  className,
  ...props
}: DescriptionListProps) {
  return (
    <DescriptionListContext.Provider value={{ layout, density }}>
      <dl
        data-slot="description-list"
        data-layout={layout}
        className={cn(LISTS[layout], className)}
        {...props}
      />
    </DescriptionListContext.Provider>
  )
}

type DescriptionItemProps = Omit<ComponentProps<'div'>, 'className'> & {
  className?: string
  /** What the value is: "Branch", "Model". */
  term: ReactNode
  /** The value itself. */
  children: ReactNode
}

/**
 * One fact: its term, muted, and its value, in the body ink. Inline, a long
 * value is cut short at the line's end and the term keeps its words.
 */
function DescriptionItem({
  term,
  children,
  className,
  ...props
}: DescriptionItemProps) {
  const { layout, density } = useContext(DescriptionListContext)
  return (
    <div
      data-slot="description-item"
      className={cn(ITEMS[layout], className)}
      {...props}
    >
      <dt
        className={cn(
          'text-ink-muted',
          TERMS[density],
          layout === 'inline' && 'shrink-0',
        )}
      >
        {term}
      </dt>
      <dd
        className={cn(
          'min-w-0 text-ink',
          VALUES[density],
          layout === 'inline' ? 'truncate text-right' : 'wrap-anywhere',
        )}
      >
        {children}
      </dd>
    </div>
  )
}

export {
  DescriptionItem,
  type DescriptionItemProps,
  DescriptionList,
  type DescriptionListDensity,
  type DescriptionListLayout,
  type DescriptionListProps,
}
