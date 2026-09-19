/**
 * How Loom is on screen (MAR-3189 R1): a narrow column beside the
 * conversation, or the whole content area.
 *
 * There is no third "collapsed to a thin rail" choice any more. The thin
 * strip still exists, but only as what a window too narrow for the column
 * leaves -- never as a preference -- so a stored mode can never put a person
 * in front of a panel with no sheet in it.
 */
export type WavePanelMode = 'compact' | 'expanded'

/**
 * Reads a stored panel mode. Storage outlives code: anything this build does
 * not know reads as `compact`, so the column is never lost behind a bad
 * value -- including the two modes this app stored before Loom, `open` and
 * `rail`, which both land on the column with its sheets.
 */
export function parseWavePanelMode(raw: string | null): WavePanelMode {
  return raw === 'expanded' ? 'expanded' : 'compact'
}

export function serializeWavePanelMode(mode: WavePanelMode): string {
  return mode
}
