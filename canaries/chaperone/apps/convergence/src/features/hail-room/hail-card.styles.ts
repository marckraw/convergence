// canary: focus-colour-is-for-focus
// A hailed card marked in the focus colour, and a picked row ringed in it behind a state variant:
// the colour that means "the keyboard is here", drawn for a state that isn't focus (ruling 11).
// A ring a focus variant puts on is use-focus-ring's business, and a word that only contains
// "focus" is not a utility; neither is reported here.
export const hailCardStyles = {
  hailOpen: 'outline-1 outline-focus -outline-offset-1',
  picked: 'data-pressed:ring-2 data-pressed:ring-focus/50',
  current: 'border-focus',
  note: 'text-focus-ring-words',
}
