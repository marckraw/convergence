import type { FC } from 'react'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn.pure'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import {
  LEARN_LOOM_CONTROLS,
  LEARN_LOOM_REFERENCE_TITLE,
  LEARN_LOOM_TITLE,
  LEARN_LOOM_YOUR_PART,
} from './learn-loom-copy.pure'
import { LearnLoomIllustrationView } from './learn-loom-illustration.presentational'
import { LearnLoomReferenceView } from './learn-loom-reference.presentational'
import type { LearnLoomStepView, LearnLoomView } from './learn-loom.pure'
import {
  LEARN_LOOM_BODY_CLASS,
  LEARN_LOOM_CLOSE_CLASS,
  LEARN_LOOM_CONTROL_CLASS,
  LEARN_LOOM_CONTROL_OFF_CLASS,
  LEARN_LOOM_DIALOG_CLASS,
  LEARN_LOOM_DIALOG_TITLE_CLASS,
  LEARN_LOOM_EXPLANATION_CLASS,
  LEARN_LOOM_EYEBROW_CLASS,
  LEARN_LOOM_FOOTER_CLASS,
  LEARN_LOOM_HEADER_CLASS,
  LEARN_LOOM_KEY_CARD_CLASS,
  LEARN_LOOM_KEY_EXPLANATION_CLASS,
  LEARN_LOOM_KEY_HEADLINE_CLASS,
  LEARN_LOOM_MAIN_CLASS,
  LEARN_LOOM_OVERLAY_CLASS,
  LEARN_LOOM_PRIMARY_CLASS,
  LEARN_LOOM_REFERENCE_CONTROL_CLASS,
  LEARN_LOOM_STEP_INTRO_CLASS,
  LEARN_LOOM_STEP_TITLE_CLASS,
  LEARN_LOOM_YOUR_PART_CLASS,
} from './learn-loom.styles'

export interface LearnLoomViewProps {
  open: boolean
  view: LearnLoomView
  step: LearnLoomStepView
  /** What the guide says out loud, for whichever view is open (lap 3, D). */
  liveMessage: string
  onClose: () => void
  onNext: () => void
  onBack: () => void
  onOpenReference: () => void
  onRestart: () => void
}

/**
 * The guide itself (MAR-3201).
 *
 * The shared dialog is composed, not forked: `hideClose` turns off the
 * primitive's own corner close so the guide's own close control is the only
 * one, and `overlayClassName` carries the backdrop the handoff specifies. The
 * body is the only region allowed to grow, which is what keeps the footer
 * from moving between steps (R10).
 */
export const LearnLoomGuideView: FC<LearnLoomViewProps> = ({
  open,
  view,
  step,
  liveMessage,
  onClose,
  onNext,
  onBack,
  onOpenReference,
  onRestart,
}) => (
  <Dialog
    open={open}
    onOpenChange={(next) => {
      if (!next) onClose()
    }}
  >
    <DialogContent
      data-learn-loom
      hideClose
      overlayClassName={LEARN_LOOM_OVERLAY_CLASS}
      className={LEARN_LOOM_DIALOG_CLASS}
      aria-describedby={undefined}
      // Said outright (R7): this Radix version traps focus and hides the
      // rest of the page from assistive tech, but does not put the word on
      // the element, and the rule asks for the word.
      aria-modal
      // Radix's own restore aims at the trigger it never had, and its
      // fallback is whatever held focus before the dialog -- `<body>` when
      // the opener was clicked. Refused here; the panel puts the keyboard
      // back on the control that opened the guide, after this scope has
      // let go of it (R6).
      onCloseAutoFocus={(event) => event.preventDefault()}
    >
      <DialogHeader className={LEARN_LOOM_HEADER_CLASS}>
        <DialogTitle className={LEARN_LOOM_DIALOG_TITLE_CLASS}>
          {view === 'reference' ? LEARN_LOOM_REFERENCE_TITLE : LEARN_LOOM_TITLE}
        </DialogTitle>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={LEARN_LOOM_CLOSE_CLASS}
          onClick={onClose}
        >
          {LEARN_LOOM_CONTROLS.close}
        </Button>
      </DialogHeader>

      {/* One region for both views (lap 3, D): entering the quick reference
          is a change of place, and silence is not an announcement. It
          carries the ticket's status words too, because those live inside
          an `aria-hidden` illustration. */}
      <div aria-live="polite" data-learn-loom-live className="sr-only">
        {liveMessage}
      </div>

      <div className={LEARN_LOOM_BODY_CLASS}>
        {view === 'reference' ? (
          <LearnLoomReferenceView />
        ) : (
          <>
            <div
              data-learn-loom-step={step.step.key}
              className={LEARN_LOOM_STEP_INTRO_CLASS}
            >
              <p className={LEARN_LOOM_EYEBROW_CLASS}>
                <span>{step.copy.index}</span>
                <span>{step.copy.label}</span>
              </p>
              <h2 className={LEARN_LOOM_STEP_TITLE_CLASS}>{step.copy.title}</h2>
            </div>
            <LearnLoomIllustrationView view={step} />
            <div className={LEARN_LOOM_EXPLANATION_CLASS}>
              <p className={LEARN_LOOM_MAIN_CLASS}>{step.copy.main}</p>
              <div data-learn-loom-key className={LEARN_LOOM_KEY_CARD_CLASS}>
                <p className={LEARN_LOOM_KEY_HEADLINE_CLASS}>
                  {step.copy.keyHeadline}
                </p>
                <p className={LEARN_LOOM_KEY_EXPLANATION_CLASS}>
                  {step.copy.keyExplanation}
                </p>
              </div>
              {/* `559:850` is one text node: the label and the sentence
                  share size, weight and colour, parted by a small gap. */}
              <p
                className={cn(
                  LEARN_LOOM_YOUR_PART_CLASS,
                  'flex flex-wrap items-baseline gap-2.5',
                )}
              >
                <span>{LEARN_LOOM_YOUR_PART}</span>
                <span>{step.copy.yourPart}</span>
              </p>
            </div>
          </>
        )}
      </div>

      <div data-learn-loom-footer className={LEARN_LOOM_FOOTER_CLASS}>
        {view === 'reference' ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={LEARN_LOOM_REFERENCE_CONTROL_CLASS}
              onClick={onRestart}
            >
              {LEARN_LOOM_CONTROLS.restart}
            </Button>
            <Button
              type="button"
              size="sm"
              className={LEARN_LOOM_REFERENCE_CONTROL_CLASS}
              onClick={onClose}
            >
              {LEARN_LOOM_CONTROLS.backToLoom}
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={LEARN_LOOM_CONTROL_CLASS}
              onClick={onOpenReference}
            >
              {LEARN_LOOM_CONTROLS.reference}
            </Button>
            {/* `aria-disabled`, never the attribute (lap 3, C): pressing
                Back on step 2 makes this same node refuse, and a `disabled`
                element loses the focus that is standing on it. */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-disabled={step.backDisabled || undefined}
              className={
                step.backDisabled
                  ? LEARN_LOOM_CONTROL_OFF_CLASS
                  : LEARN_LOOM_CONTROL_CLASS
              }
              onClick={() => {
                if (step.backDisabled) return
                onBack()
              }}
            >
              {LEARN_LOOM_CONTROLS.back}
            </Button>
            {/* The last step has nowhere to advance to, so its primary
                control leaves the guide instead (R5). */}
            <Button
              type="button"
              size="sm"
              className={LEARN_LOOM_PRIMARY_CLASS}
              onClick={step.isLast ? onClose : onNext}
            >
              {step.copy.primary}
            </Button>
          </>
        )}
      </div>
    </DialogContent>
  </Dialog>
)
