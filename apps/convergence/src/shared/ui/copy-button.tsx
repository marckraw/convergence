import { useCallback, useEffect, useRef, useState, type FC } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'

interface CopyButtonProps {
  text: string
  label?: string
  className?: string
  variant?: 'icon' | 'button'
}

export const CopyButton: FC<CopyButtonProps> = ({
  text,
  label = 'Copy',
  className,
  variant = 'icon',
}) => {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const handleClick = useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      try {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
        }
        timeoutRef.current = setTimeout(() => setCopied(false), 1500)
      } catch {
        setCopied(false)
      }
    },
    [text],
  )

  const copiedLabel = 'Copied'
  const actionLabel = copied ? copiedLabel : label

  if (variant === 'button') {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-label={actionLabel}
        title={actionLabel}
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-md border border-border/70 bg-background px-2.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          className,
        )}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
        {actionLabel}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={actionLabel}
      title={actionLabel}
      className={cn(
        'inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 bg-background/80 text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        className,
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  )
}
