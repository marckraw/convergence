/**
 * The tooltip's surface (MAR-3616): today's glass bubble, kept (R0), the one
 * place glass belongs (R8). Small type, a line or two, wrapping at 20rem.
 * Where the system asks for reduced transparency (the chrome's
 * `data-reduced-transparency="true"` on <html>), the fill turns opaque and the
 * blur goes, as the window chrome does. The Tooltip wears it, and so does
 * TooltipCard, which shows more than a label.
 */
export const tooltipSurface = [
  'z-50 w-fit max-w-xs overflow-hidden rounded-xl border border-border/80 bg-popover/95 px-3 py-2',
  'text-xs break-words text-popover-foreground shadow-xl backdrop-blur-xl',
  'in-data-[reduced-transparency=true]:bg-popover in-data-[reduced-transparency=true]:backdrop-blur-none',
].join(' ')
