// canary: ui-components-have-stories, no-magic-values, no-raw-colors, no-palette-colors, motion-from-tokens
// A design-system part with no pill.stories.tsx beside it, styled with an arbitrary size, a raw
// colour, a palette shade and a raw duration: the token rules read @convergence/ui as well as the
// app (all but src/styles, where the tokens are written).
export function Pill({ children }: { children: string }) {
  return (
    <span
      className="text-[10px] text-emerald-600 transition-colors duration-200"
      style={{ borderColor: 'oklch(0.7 0.1 160)' }}
    >
      {children}
    </span>
  )
}
