import { memo, useMemo, type FC, type Ref } from 'react'
import { defaultRehypePlugins, Streamdown, type Components } from 'streamdown'
import { mermaid as mermaidPlugin } from '@streamdown/mermaid'
import { code as codePlugin } from '@streamdown/code'
import { cn } from '@/shared/lib/cn.pure'

const SHIKI_THEME: ['github-light', 'github-dark'] = [
  'github-light',
  'github-dark',
]

const DEEP_LINK_PLACEHOLDER_PREFIX =
  'https://convergence.invalid/__external-deep-link__?url='
const UNSAFE_DEEP_LINK_PROTOCOLS = new Set([
  'about:',
  'blob:',
  'data:',
  'devtools:',
  'file:',
  'javascript:',
  'view-source:',
])

interface MarkdownNode {
  type?: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: MarkdownNode[]
}

function visitMarkdownLinks(
  node: MarkdownNode,
  transform: (href: string) => string,
): void {
  if (node.type === 'element' && node.tagName === 'a' && node.properties) {
    const href = node.properties.href
    if (typeof href === 'string') {
      node.properties.href = transform(href)
    }
  }

  node.children?.forEach((child) => visitMarkdownLinks(child, transform))
}

function protectCustomDeepLink(href: string): string {
  let url: URL

  try {
    url = new URL(href)
  } catch {
    return href
  }

  if (
    url.protocol === 'http:' ||
    url.protocol === 'https:' ||
    UNSAFE_DEEP_LINK_PROTOCOLS.has(url.protocol)
  ) {
    return href
  }

  return `${DEEP_LINK_PLACEHOLDER_PREFIX}${encodeURIComponent(href)}`
}

function restoreCustomDeepLink(href: string): string {
  if (!href.startsWith(DEEP_LINK_PLACEHOLDER_PREFIX)) {
    return href
  }

  try {
    return decodeURIComponent(href.slice(DEEP_LINK_PLACEHOLDER_PREFIX.length))
  } catch {
    return href
  }
}

function rehypeProtectCustomDeepLinks() {
  return (tree: MarkdownNode) => visitMarkdownLinks(tree, protectCustomDeepLink)
}

function rehypeRestoreCustomDeepLinks() {
  return (tree: MarkdownNode) => visitMarkdownLinks(tree, restoreCustomDeepLink)
}

// Streamdown sanitizes links before rendering. Temporarily wrapping safe custom
// schemes lets them pass through that sanitizer while retaining its defaults.
const REHYPE_PLUGINS_WITH_DEEP_LINKS = [
  defaultRehypePlugins.raw,
  rehypeProtectCustomDeepLinks,
  defaultRehypePlugins.sanitize,
  defaultRehypePlugins.harden,
  rehypeRestoreCustomDeepLinks,
]

export type MermaidTheme = 'default' | 'dark'

export interface MarkdownProps {
  content: string
  className?: string
  size?: 'sm' | 'md'
  rootRef?: Ref<HTMLDivElement>
  isStreaming?: boolean
  mermaidTheme?: MermaidTheme
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
    inlineCode: ({ className, children, ...props }) => (
      <code
        className={cn(
          'rounded-md border border-border/80 bg-background/80 px-1.5 py-0.5 font-mono text-[0.92em] text-foreground',
          className,
        )}
        {...props}
      >
        {children}
      </code>
    ),
  }
}

const STREAMDOWN_PLUGINS = { mermaid: mermaidPlugin, code: codePlugin }

export const MarkdownPresentational: FC<MarkdownProps> = memo(
  ({
    content,
    className,
    size = 'md',
    rootRef,
    isStreaming = false,
    mermaidTheme = 'default',
  }) => {
    const components = useMemo(() => createMarkdownComponents(size), [size])
    const mermaidOptions = useMemo(
      () =>
        ({
          config: { theme: mermaidTheme, securityLevel: 'strict' },
        }) as const,
      [mermaidTheme],
    )

    return (
      <div
        ref={rootRef}
        className={cn(
          'min-w-0 break-words [&_:first-child]:mt-0 [&_:last-child]:mb-0',
          className,
        )}
      >
        <Streamdown
          components={components}
          plugins={STREAMDOWN_PLUGINS}
          rehypePlugins={REHYPE_PLUGINS_WITH_DEEP_LINKS}
          mermaid={mermaidOptions}
          shikiTheme={SHIKI_THEME}
          isAnimating={isStreaming}
        >
          {content}
        </Streamdown>
      </div>
    )
  },
)
