import {
  type ComponentProps,
  useCallback,
  useLayoutEffect,
  useRef,
} from 'react'
import { cn } from '#lib/cn.pure'
import { focusRingInset } from '#lib/focus-ring.styles'
import { CopyButton } from '../copy-button/copy-button'

/** How tall it grows before it scrolls: 112 px, 224 px (tool output today), or as tall as it is. */
const HEIGHTS = {
  sm: 'max-h-28',
  md: 'max-h-56',
  none: '',
} as const

type CodeBlockHeight = keyof typeof HEIGHTS

/**
 * The box takes the focus only while its text is too big for it, so the
 * keyboard can scroll it then, and a block that fits costs no tab stop. It is
 * measured when laid out, whenever the box changes size, and when the code
 * changes.
 */
const useFocusableWhileScrolling = (code: string) => {
  const box = useRef<HTMLPreElement>(null)
  const update = useCallback(() => {
    const element = box.current
    if (element === null) return
    const scrolls =
      element.scrollWidth > element.clientWidth ||
      element.scrollHeight > element.clientHeight
    if (scrolls) element.tabIndex = 0
    else element.removeAttribute('tabindex')
  }, [])
  useLayoutEffect(() => {
    update()
  }, [update, code])
  useLayoutEffect(() => {
    const element = box.current
    if (element === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [update])
  return box
}

type CodeBlockProps = {
  /** The code, exactly as written. */
  children: string
  /** What it is, for a screen reader: "Tool output", "Injected context". "Code" unless told otherwise. */
  label?: string
  /** A copy button at its top right. */
  copyable?: boolean
  /** md (224 px, as tool output today) unless told otherwise. */
  maxHeight?: CodeBlockHeight
  className?: string
}

/**
 * A block of preformatted text (MAR-3616): tool output, injected context, a
 * command, in one look for the seven `pre` styles the conversation has today
 * (CONV-32): monospace in the 12 px print, on a faint wash in a rounded-md
 * box, scrolling inside itself past its height, never the page, and focusable
 * with an inset ring while it scrolls; `copyable` adds a CopyButton ("Copy
 * code", which says "Copied" for a moment) at its top right. No
 * highlighting: Streamdown already colours code inside markdown. A figure
 * named by `label`.
 */
function CodeBlock({
  children,
  label = 'Code',
  copyable = false,
  maxHeight = 'md',
  className,
}: CodeBlockProps) {
  const box = useFocusableWhileScrolling(children)
  return (
    <figure
      aria-label={label}
      data-slot="code-block"
      className={cn('relative min-w-0', className)}
    >
      <pre
        ref={box}
        dir="ltr"
        translate="no"
        className={cn(
          'overflow-auto overscroll-contain rounded-md border border-line bg-surface-muted/20 p-3 font-mono text-xs text-ink',
          HEIGHTS[maxHeight],
          copyable && 'pr-10',
          focusRingInset,
        )}
      >
        <code>{children}</code>
      </pre>
      {copyable ? (
        <CopyButton
          text={children}
          label="Copy code"
          className="absolute top-2 right-2"
        />
      ) : null}
    </figure>
  )
}

type CodeProps = Omit<ComponentProps<'code'>, 'className'> & {
  className?: string
}

/** Code inside a sentence: a path, a command, a key, in monospace on the muted wash. */
function Code({ className, ...props }: CodeProps) {
  return (
    <code
      data-slot="code"
      className={cn(
        'rounded-sm bg-surface-muted px-1 py-0.5 font-mono wrap-anywhere',
        className,
      )}
      {...props}
    />
  )
}

export {
  Code,
  CodeBlock,
  type CodeBlockHeight,
  type CodeBlockProps,
  type CodeProps,
}
