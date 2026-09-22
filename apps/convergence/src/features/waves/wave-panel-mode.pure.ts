/**
 * How Loom is on screen (MAR-3189 R1, MAR-3292 R1): a narrow column beside
 * the conversation, the whole content area, or folded away to a narrow strip
 * of icons.
 *
 * `folded` is a third CHOICE, and it exists only because the strip it shows
 * is no longer a dead end. MAR-3189 removed the old collapsed rail as a
 * preference for one reason: a stored mode could put a person in front of a
 * panel with no sheet in it and no way to a sheet. The folded column answers
 * that -- every icon on it opens a sheet -- so the choice may come back.
 *
 * The strip is still ALSO what a window too narrow for the column leaves. One
 * component, two reasons; which one it is, is a question about `stored`, not
 * about the shape.
 */
export type WavePanelMode = 'compact' | 'expanded' | 'folded'

/**
 * Reads a stored panel mode. Storage outlives code: anything this build does
 * not know reads as `compact`, so the column is never lost behind a bad
 * value -- including the two modes this app stored before Loom, `open` and
 * `rail`, which both land on the column with its sheets.
 *
 * `rail` in particular must NOT read as `folded`, near as the two words are:
 * it was written by people collapsing a panel that no longer exists, and
 * reading it as a choice would fold Loom for a person who never chose it.
 */
export function parseWavePanelMode(raw: string | null): WavePanelMode {
  if (raw === 'expanded') return 'expanded'
  if (raw === 'folded') return 'folded'
  return 'compact'
}

export function serializeWavePanelMode(mode: WavePanelMode): string {
  return mode
}
