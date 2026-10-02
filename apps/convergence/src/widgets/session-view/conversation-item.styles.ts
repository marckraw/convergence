/**
 * Where a conversation item's CopyButton sits (CONV-11): the 24 px (xs)
 * button, 8 px in from the item's top right corner, shown on hover or focus.
 */
export const copyButtonSlot =
  'absolute right-2 top-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover/item:opacity-100'

/**
 * The room a line along the item's top leaves for its CopyButton: the
 * button's 8 px inset, its 24 px and 8 px of air. One value for every line
 * the button could cover (the header, a tool's preview, a request card's
 * title), so the button never sits on words.
 */
export const copyButtonRoom = 'pr-10'
