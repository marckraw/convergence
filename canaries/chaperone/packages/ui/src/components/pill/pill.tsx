// canary: ui-components-have-stories, no-magic-values, no-raw-colors, no-palette-colors, motion-from-tokens, no-streamdown-names
// A design-system part with no pill.stories.tsx beside it, styled with an arbitrary size, a raw
// colour, a palette shade, a raw duration and a Streamdown name's custom property: the token rules
// read @convergence/ui as well as the app (all but src/styles, where the tokens are written, and
// for no-streamdown-names all but theme.css, where the vendor bridge serves Streamdown's names).
export function Pill({ children }: { children: string }) {
  return (
    <span
      className="text-[10px] text-emerald-600 transition-colors duration-200"
      style={{
        borderColor: 'oklch(0.7 0.1 160)',
        color: 'var(--color-muted-foreground)',
      }}
    >
      {children}
    </span>
  )
}
