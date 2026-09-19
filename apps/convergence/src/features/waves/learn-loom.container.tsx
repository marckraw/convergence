import { useEffect, useState, type FC } from 'react'
import {
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

  // Opening always starts the lesson at its first beat: a guide that resumed
  // where it was left would open on a step whose context a person no longer
  // has (R5).
  useEffect(() => {
    if (!open) return
    setStep(LEARN_LOOM_FIRST_STEP)
    setView('steps')
  }, [open])

  return (
    <LearnLoomGuideView
      open={open}
      view={view}
      step={learnLoomStepView(step)}
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
