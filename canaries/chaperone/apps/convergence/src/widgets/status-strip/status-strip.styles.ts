// canary: no-magic-values, no-raw-colors, no-palette-colors, no-dark-variant, no-white-overlays, motion-from-tokens
// A status strip styled from before the tokens: an arbitrary width, a hex fill, a palette red with
// its dark: twin, a white hairline that vanishes on a light surface, and a raw duration on
// transition-all. The pull request's number in the label is not a colour, and is not reported.
export const statusStripStyles = {
  root: 'w-[37px] border-b border-white/10 bg-[#0b0b0f]',
  failed: 'text-red-500 dark:text-red-400',
  motion: 'transition-all duration-150',
  label: 'PR #915',
}
