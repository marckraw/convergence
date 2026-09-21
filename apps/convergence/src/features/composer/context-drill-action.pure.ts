import type { DrillBeat, DrillDescription } from '@/entities/context-drill'

export interface ContextDrillCancelState {
  visible: boolean
  enabled: boolean
  reason: string | null
}

export interface ContextDrillActionState {
  visible: boolean
  enabled: boolean
  label: string
  reason: string | null
  cancel: ContextDrillCancelState
}

export const DRILL_RUN_LABEL = 'Run the drill'

/**
 * What each beat is called on screen, in the tense of something happening.
 *
 * `resuming` is the backend's word for the beat and `Waking up…` is Marcin's
 * word for it; the two are kept apart deliberately, because the beat is a
 * state machine's name and the label is copy, and a label that had to match a
 * backend identifier is a label nobody may reword.
 */
const BEAT_LABEL: Record<DrillBeat, string> = {
  sealing: 'Sealing memory…',
  compacting: 'Compacting…',
  resuming: 'Waking up…',
}

/**
 * The same sentence the backend's `cancel` refuses with.
 *
 * Duplicated rather than imported: the renderer may not reach into
 * `electron/`, and this copy is for the DISABLED state -- what the button
 * says before anybody clicks it -- where no backend call has happened and
 * there is no refusal to quote. The two must agree, which is why both are
 * written once each and tested against this spelling.
 */
export const DRILL_COMPACTION_UNINTERRUPTIBLE =
  'Compaction cannot be interrupted; it finishes on its own.'

const HIDDEN_CANCEL: ContextDrillCancelState = {
  visible: false,
  enabled: false,
  reason: null,
}

const HIDDEN: ContextDrillActionState = {
  visible: false,
  enabled: false,
  label: DRILL_RUN_LABEL,
  reason: null,
  cancel: HIDDEN_CANCEL,
}

/**
 * Whether the drill's control is drawn, what it says, and whether Cancel is
 * beside it (MAR-3256 R3).
 *
 * The beat is asked FIRST and outranks everything, including eligibility: a
 * routine that is already running must stay visible and cancellable even if
 * `describe` has not answered yet, or has answered "not offered" -- which it
 * will, because a conversation mid-drill is mid-turn and mid-turn is not
 * ready. A control that disappeared the instant it started working would
 * take its own Cancel with it.
 */
export function resolveContextDrillAction(
  description: DrillDescription | undefined,
  beat: DrillBeat | null,
): ContextDrillActionState {
  if (beat !== null) {
    // Cancel is offered for the beats that are a WAIT -- the routine is
    // sitting on a settle it can stop sitting on. `compacting` is a call
    // already in flight in the provider: nothing in this process can abort
    // it, so the control says that instead of pretending.
    const interruptible = beat !== 'compacting'
    return {
      visible: true,
      enabled: false,
      label: BEAT_LABEL[beat],
      reason: null,
      cancel: {
        visible: true,
        enabled: interruptible,
        reason: interruptible ? null : DRILL_COMPACTION_UNINTERRUPTIBLE,
      },
    }
  }

  // In no crew at all, or nothing known about this conversation yet: the
  // drill is not this conversation's business and the popover says nothing
  // about it at all.
  if (!description || description.seat === 'none') return HIDDEN

  // A crew seat that is not the mastermind (MAR-3287 R3). Drawn, disabled,
  // and quoting the backend's sentence about where to set the role -- decided
  // from `seat`, never by recognising the sentence, so rewording it can never
  // change what is drawn.
  if (description.seat === 'other-role') {
    return {
      visible: true,
      enabled: false,
      label: DRILL_RUN_LABEL,
      reason: description.reason,
      cancel: HIDDEN_CANCEL,
    }
  }

  if (description.offered) {
    return {
      visible: true,
      enabled: true,
      label: DRILL_RUN_LABEL,
      reason: null,
      cancel: HIDDEN_CANCEL,
    }
  }

  // Eligible but not right now. Drawn, disabled, and quoting the backend's
  // own sentence rather than inventing a second wording for the same refusal.
  return {
    visible: true,
    enabled: false,
    label: DRILL_RUN_LABEL,
    reason: description.reason,
    cancel: HIDDEN_CANCEL,
  }
}
