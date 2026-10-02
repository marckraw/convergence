/**
 * Why each of a diff's context controls is unavailable (R2, MAR-3608): an
 * unavailable control stays reachable and says why, never only greys out.
 * Undefined means the control is available.
 */
export interface DiffContextAvailability {
  canExpandBefore: boolean
  canExpandAfter: boolean
  expandedFromDefault: boolean
  /** Whether the viewer was given each action at all. */
  canExpandBeforeHere: boolean
  canExpandAfterHere: boolean
  canExpandBothHere: boolean
  canResetHere: boolean
}

export interface DiffContextReasons {
  above: string | undefined
  both: string | undefined
  below: string | undefined
  reset: string | undefined
}

/** A viewer that can't load more of the file here at all. */
export const DIFF_CONTEXT_NOT_HERE = "This view can't show more of the file."

export function diffContextReasons(
  input: DiffContextAvailability,
): DiffContextReasons {
  return {
    above: !input.canExpandBeforeHere
      ? DIFF_CONTEXT_NOT_HERE
      : input.canExpandBefore
        ? undefined
        : 'The file starts here: nothing above to show.',
    both: !input.canExpandBothHere
      ? DIFF_CONTEXT_NOT_HERE
      : input.canExpandBefore || input.canExpandAfter
        ? undefined
        : 'The whole file is showing.',
    below: !input.canExpandAfterHere
      ? DIFF_CONTEXT_NOT_HERE
      : input.canExpandAfter
        ? undefined
        : 'The file ends here: nothing below to show.',
    reset: !input.canResetHere
      ? DIFF_CONTEXT_NOT_HERE
      : input.expandedFromDefault
        ? undefined
        : 'This is the usual context already.',
  }
}
