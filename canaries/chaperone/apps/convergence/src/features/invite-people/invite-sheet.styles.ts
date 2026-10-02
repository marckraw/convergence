// canary: use-focus-ring
// A sheet title handed to a Button that cancels the Button's own ring: tailwind-merge puts
// focus-visible:outline-none and the part's outline-solid in one group, so the later one wins and
// the keyboard's focus shows only as a faint fill. It types no ring of its own, so only the
// cancel is reported (DS-7).
export const inviteSheetTitle =
  'flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-fill-hover focus-visible:bg-fill-hover focus-visible:outline-none'
