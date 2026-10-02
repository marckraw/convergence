/**
 * A row you pick, drawn as a Card (DS-21): History's runs and events, a
 * conversation to add to a crew. Its CardAction holds the row's lines,
 * stacked, and its hit area covers the card; the card wears the frame (a
 * tone's edge, the selected fill).
 */
export const ROW_CARD_DOOR_CLASS =
  'flex w-full min-w-0 flex-col items-start gap-0.5 px-3 py-2'

/** A picked row keeps its selected fill under the pointer (R7). */
export const ROW_CARD_PICKED_CLASS = 'bg-fill-selected hover:bg-fill-selected'
