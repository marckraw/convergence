import { useEffect, useRef, type FC } from 'react'
import { useAppliedTheme } from '@convergence/ui'
import { detectMarkdownCut } from '@/shared/lib/markdown-cut-detector.pure'
import {
  MarkdownPresentational,
  type MarkdownProps,
} from './markdown.presentational'

// Canary: warns when rendered textContent appears to drop the tail of `content`.
// Originally added to catch silent cuts from the previous markdown parser.
// Streamdown's incomplete-markdown handling should make this redundant; left in
// place dev-only until a few real streams confirm zero false positives.
export const Markdown: FC<Omit<MarkdownProps, 'rootRef' | 'mermaidTheme'>> = (
  props,
) => {
  const rootRef = useRef<HTMLDivElement>(null)
  // Mermaid can't read CSS: it is told the theme on screen, live (MAR-3615).
  const isDark = useAppliedTheme() === 'dark'
  const { content } = props

  useEffect(() => {
    if (!import.meta.env.DEV) return

    const id = setTimeout(() => {
      const el = rootRef.current
      if (!el) return
      const rendered = el.textContent ?? ''
      const result = detectMarkdownCut({ input: content, rendered })
      if (result.cut) {
        console.warn('[Markdown] possible content cut detected', result)
      }
    }, 500)
    return () => clearTimeout(id)
  }, [content])

  return (
    <MarkdownPresentational
      {...props}
      rootRef={rootRef}
      mermaidTheme={isDark ? 'dark' : 'default'}
    />
  )
}
