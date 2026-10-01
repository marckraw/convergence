import { useRender } from '@base-ui/react/use-render'
import { ExternalLink } from 'lucide-react'
import { cn } from '#lib/cn.pure'
import { focusRing } from '#lib/focus-ring.styles'

type TextLinkProps = Omit<useRender.ComponentProps<'a'>, 'className'> & {
  className?: string
  /**
   * It leaves Convergence for the browser: opens in a new window with no
   * referrer, and says so with a small glyph and, for a screen reader,
   * "(opens in browser)".
   */
  external?: boolean
}

/**
 * A link in running text (MAR-3616): the markdown link's look, the strong ink
 * underlined at 40 %, the underline full on hover, and the focus ring built
 * in. One look and one `rel` for the eight anchors written five ways today
 * (DS-24). An `<a>`; pass `render` for a router Link.
 */
function TextLink({
  external = false,
  render,
  className,
  children,
  ...props
}: TextLinkProps) {
  return useRender({
    defaultTagName: 'a',
    render,
    props: {
      ...(external ? { target: '_blank', rel: 'noreferrer' } : {}),
      ...props,
      'data-slot': 'text-link',
      className: cn(
        'app-no-drag rounded-sm text-strong underline decoration-strong/40 underline-offset-2 transition-colors hover:decoration-strong',
        external && 'inline-flex items-baseline gap-0.5',
        focusRing,
        className,
      ),
      children: external ? (
        <>
          {children}
          <ExternalLink aria-hidden className="size-3 shrink-0 self-center" />
          <span className="sr-only">(opens in browser)</span>
        </>
      ) : (
        children
      ),
    },
  })
}

export { TextLink, type TextLinkProps }
