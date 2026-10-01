import { useRender } from '@base-ui/react/use-render'
import { cn } from '#lib/cn.pure'
import type { AppliedTheme } from '#lib/theme'

export type ThemeScopeProps = Omit<
  useRender.ComponentProps<'div'>,
  'className'
> & {
  className?: string
  /** The theme everything inside resolves to, whatever the app's is. */
  theme: AppliedTheme
}

/**
 * A subtree in a theme of its own (MAR-3616 DS3c, R12): it sets data-theme,
 * which sets color-scheme, so every light-dark() token inside resolves as
 * that theme, and the kit's parts inside draw that theme's look. The text
 * colour starts again from the scope's ink, since an inherited colour was
 * already resolved outside. The terminal's tab strip sits in a dark one, so
 * it stays dark in the light theme too. Pass `render` to make an element of
 * your own the scope instead of a <div>.
 */
export function ThemeScope({
  theme,
  render,
  className,
  ref,
  ...props
}: ThemeScopeProps) {
  return useRender({
    defaultTagName: 'div',
    render,
    ref,
    props: {
      'data-slot': 'theme-scope',
      'data-theme': theme,
      className: cn('text-ink', className),
      ...props,
    },
  })
}
