import { useEffect, useRef, useState, type FC } from 'react'
import { detectMarkdownCut } from '@/shared/lib/markdown-cut-detector.pure'
import {
  MarkdownPresentational,
  type MarkdownProps,
} from './markdown.presentational'

function readIsDark(): boolean {
  if (typeof document === 'undefined') return false
  return document.documentElement.classList.contains('dark')
}

function useIsDark(): boolean {
  const [isDark, setIsDark] = useState<boolean>(readIsDark)

  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    setIsDark(root.classList.contains('dark'))
    const observer = new MutationObserver(() => {
      setIsDark(root.classList.contains('dark'))
    })
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return isDark
}

// Canary: warns when rendered textContent appears to drop the tail of `content`.
// Originally added to catch silent cuts from the previous markdown parser.
// Streamdown's incomplete-markdown handling should make this redundant; left in
// place dev-only until a few real streams confirm zero false positives.
export const Markdown: FC<Omit<MarkdownProps, 'rootRef' | 'mermaidTheme'>> = (
  props,
) => {
  const rootRef = useRef<HTMLDivElement>(null)
  const isDark = useIsDark()
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
