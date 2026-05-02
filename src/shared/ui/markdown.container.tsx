import { useEffect, useRef, type FC } from 'react'
import { detectMarkdownCut } from '@/shared/lib/markdown-cut-detector.pure'
import {
  MarkdownPresentational,
  type MarkdownProps,
} from './markdown.presentational'

// Canary: warns when rendered textContent appears to drop the tail of `content`.
// Catches silent cuts from react-markdown parser quirks or upstream data loss.
export const Markdown: FC<Omit<MarkdownProps, 'rootRef'>> = (props) => {
  const rootRef = useRef<HTMLDivElement>(null)
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

  return <MarkdownPresentational {...props} rootRef={rootRef} />
}
