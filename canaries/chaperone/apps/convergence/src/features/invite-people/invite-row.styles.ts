// canary: use-focus-ring
// A row's focus ring typed by hand in the colour's DS5 name (outline-focus). It is drawn (it names
// outline-solid), so no-invisible-focus-ring has nothing to say; it is still a copy of
// focusRingInset, the shared recipe.
export const inviteRowFocus =
  'outline-none focus-visible:outline-solid focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-focus'
