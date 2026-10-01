import { Children, type ReactNode } from 'react'

/**
 * A segment's words, each in a span that can be cut short: text inside a
 * flex item can't take an ellipsis, a span around it can. Icons pass as they
 * are.
 */
export const truncateWords = (children: ReactNode): ReactNode =>
  Children.map(children, (child) =>
    typeof child === 'string' || typeof child === 'number' ? (
      <span className="min-w-0 truncate">{child}</span>
    ) : (
      child
    ),
  )
