import { useState, type FC } from 'react'
import {
  learnLoomLiveMessage,
  LEARN_LOOM_FIRST_STEP,
  learnLoomStepAt,
  learnLoomStepView,
  type LearnLoomView,
} from './learn-loom.pure'
import { LearnLoomGuideView } from './learn-loom.presentational'

/**
 * The guide's own state (MAR-3201 R5).
 *
 * It lives here rather than in the panel because none of it is Loom's: the
 * panel's mode, sheet, width and scroll are untouched by opening or closing
 * the lesson, which is the whole of R6's promise.
 */
export const LearnLoomGuide: FC<{ open: boolean; onClose: () => void }> = ({
  open,
  onClose,
}) => {
  const [step, setStep] = useState(LEARN_LOOM_FIRST_STEP)
  const [view, setView] = useState<LearnLoomView>('steps')

  /**
   * There is no reset here, and that is the point (lap 3, B).
   *
   * What a reset would be fixing, measured: with no fresh mount, step and
   * view simply SURVIVE -- a guide left on the quick reference reopens on
   * the quick reference, permanently, until something remounts it. (The
   * sharper claim that a passive effect leaves a stale title committed for
   * one frame did not reproduce: React flushes the effect before Radix
   * mounts the content, so the old name never reaches the document.)
   * The panel gives this component a key that changes when the guide closes,
   * so every session starts from a fresh mount -- including the sessions the
   * guide never sees closing, like Loom's column disappearing underneath it.
   */

  return (
    <LearnLoomGuideView
      open={open}
      view={view}
      step={learnLoomStepView(step)}
      liveMessage={learnLoomLiveMessage(view, step)}
      onClose={onClose}
      // Functional updates, so a burst of presses lands on the arithmetic
      // result instead of on whichever render each press happened to read.
      onNext={() => setStep((was) => learnLoomStepAt(was + 1))}
      onBack={() => setStep((was) => learnLoomStepAt(was - 1))}
      onOpenReference={() => setView('reference')}
      onRestart={() => {
        setStep(LEARN_LOOM_FIRST_STEP)
        setView('steps')
      }}
    />
  )
}
