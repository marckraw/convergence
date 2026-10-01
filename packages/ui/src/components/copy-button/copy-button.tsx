import {
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '../button/button'
import { IconButton } from '../icon-button/icon-button'

type CopyButtonProps = {
  /** What lands on the clipboard. */
  text: string
  /** Its name and tooltip; "Copy" unless told otherwise. */
  label?: string
  className?: string
  /** `icon`: a 24 px bordered square; `button`: the words beside the icon. */
  variant?: 'icon' | 'button'
}

const COPIED = 'Copied'

/**
 * Copies a string (MAR-3616, rebuilt on IconButton and Button). It says
 * "Copied" for a moment, in its name, its tooltip and a polite live region,
 * then goes back to its own name. When the clipboard refuses, it keeps its
 * own name. A click on it never reaches a row underneath.
 */
function CopyButton({
  text,
  label = 'Copy',
  className,
  variant = 'icon',
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const handleClick = useCallback(
    async (event: MouseEvent<HTMLElement>) => {
      event.preventDefault()
      event.stopPropagation()
      try {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(() => setCopied(false), 1500)
      } catch {
        setCopied(false)
      }
    },
    [text],
  )

  const actionLabel = copied ? COPIED : label
  const glyph = copied ? (
    <Check aria-hidden className="h-3.5 w-3.5 text-success-ink" />
  ) : (
    <Copy aria-hidden className="h-3.5 w-3.5" />
  )
  const announcement = (
    <span className="sr-only" aria-live="polite">
      {copied ? COPIED : ''}
    </span>
  )

  if (variant === 'button') {
    return (
      <>
        <Button variant="secondary" onClick={handleClick} className={className}>
          {glyph}
          {actionLabel}
        </Button>
        {announcement}
      </>
    )
  }

  return (
    <>
      <IconButton
        variant="secondary"
        size="xs"
        label={actionLabel}
        onClick={handleClick}
        className={['text-muted-foreground hover:text-foreground', className]
          .filter(Boolean)
          .join(' ')}
      >
        {glyph}
      </IconButton>
      {announcement}
    </>
  )
}

export { CopyButton, type CopyButtonProps }
