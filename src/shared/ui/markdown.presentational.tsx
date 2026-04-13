import { memo, useMemo, type FC } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/shared/lib/cn.pure'

export interface MarkdownProps {
  content: string
  className?: string
  size?: 'sm' | 'md'
}

function createMarkdownComponents(size: MarkdownProps['size']): Components {
  const isCompact = size === 'sm'

  return {
    p: ({ className, ...props }) => (
      <p
        className={cn(
          isCompact ? 'my-2 text-xs leading-6' : 'my-3 text-sm leading-7',
          className,
        )}
        {...props}
      />
    ),
    h1: ({ className, ...props }) => (
      <h1
        className={cn(
          isCompact
            ? 'mt-4 mb-2 text-base font-semibold'
            : 'mt-6 mb-3 text-xl font-semibold',
          className,
        )}
        {...props}
      />
    ),
    h2: ({ className, ...props }) => (
      <h2
        className={cn(
          isCompact
            ? 'mt-4 mb-2 text-sm font-semibold'
            : 'mt-5 mb-3 text-lg font-semibold',
          className,
        )}
        {...props}
      />
    ),
    h3: ({ className, ...props }) => (
      <h3
        className={cn(
          isCompact
            ? 'mt-3 mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground'
            : 'mt-4 mb-2 text-base font-semibold',
          className,
        )}
        {...props}
      />
    ),
    ul: ({ className, ...props }) => (
      <ul
        className={cn(
          isCompact
            ? 'my-2 ml-4 list-disc space-y-1 text-xs'
            : 'my-3 ml-5 list-disc space-y-1.5 text-sm',
          className,
        )}
        {...props}
      />
    ),
    ol: ({ className, ...props }) => (
      <ol
        className={cn(
          isCompact
            ? 'my-2 ml-4 list-decimal space-y-1 text-xs'
            : 'my-3 ml-5 list-decimal space-y-1.5 text-sm',
          className,
        )}
        {...props}
      />
    ),
    li: ({ className, ...props }) => (
      <li className={cn('pl-1', className)} {...props} />
    ),
    blockquote: ({ className, ...props }) => (
      <blockquote
        className={cn(
          'my-4 border-l-2 border-border bg-muted/30 pl-4 italic text-muted-foreground',
          isCompact ? 'py-2 text-xs leading-6' : 'py-2.5 text-sm leading-7',
          className,
        )}
        {...props}
      />
    ),
    hr: ({ className, ...props }) => (
      <hr className={cn('my-4 border-border', className)} {...props} />
    ),
    a: ({ className, ...props }) => (
      <a
        className={cn(
          'break-all text-primary underline decoration-primary/40 underline-offset-4',
          className,
        )}
        rel="noreferrer"
        target="_blank"
        {...props}
      />
    ),
    table: ({ className, children, ...props }) => (
      <div className="app-scrollbar my-4 overflow-x-auto rounded-xl border border-border bg-background/50">
        <table
          className={cn(
            'min-w-full border-collapse text-left',
            isCompact ? 'text-xs' : 'text-sm',
            className,
          )}
          {...props}
        >
          {children}
        </table>
      </div>
    ),
    thead: ({ className, ...props }) => (
      <thead className={cn('bg-muted/40', className)} {...props} />
    ),
    th: ({ className, ...props }) => (
      <th
        className={cn(
          'border-b border-border px-3 py-2 font-medium text-foreground',
          className,
        )}
        {...props}
      />
    ),
    td: ({ className, ...props }) => (
      <td
        className={cn(
          'border-b border-border/70 px-3 py-2 align-top text-muted-foreground',
          className,
        )}
        {...props}
      />
    ),
    pre: ({ children }) => <>{children}</>,
    code: ({ className, children, ...props }) => {
      const normalized = String(children).replace(/\n$/, '')
      const language = className?.match(/language-([\w-]+)/)?.[1]
      const isBlock = Boolean(language) || normalized.includes('\n')

      if (!isBlock) {
        return (
          <code
            className={cn(
              'rounded-md border border-border/80 bg-background/80 px-1.5 py-0.5 font-mono text-[0.92em] text-foreground',
              className,
            )}
            {...props}
          >
            {children}
          </code>
        )
      }

      return (
        <div className="my-4 overflow-hidden rounded-xl border border-border bg-background/80 shadow-[0_12px_30px_-24px_rgba(0,0,0,0.8)]">
          <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {language ?? 'code'}
            </span>
          </div>
          <pre className="app-scrollbar overflow-x-auto p-4">
            <code
              className={cn(
                'block font-mono text-[13px] leading-6 text-foreground',
                className,
              )}
              {...props}
            >
              {normalized}
            </code>
          </pre>
        </div>
      )
    },
  }
}

export const Markdown: FC<MarkdownProps> = memo(
  ({ content, className, size = 'md' }) => {
    const components = useMemo(() => createMarkdownComponents(size), [size])

    return (
      <div
        className={cn(
          'min-w-0 break-words [&_:first-child]:mt-0 [&_:last-child]:mb-0',
          className,
        )}
      >
        <ReactMarkdown components={components} remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </div>
    )
  },
)
