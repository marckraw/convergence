import type { FC } from 'react'
import {
  LEARN_LOOM_REFERENCE_CARDS,
  LEARN_LOOM_REFERENCE_LINE,
} from './learn-loom-copy.pure'
import {
  LEARN_LOOM_REFERENCE_CARD_CLASS,
  LEARN_LOOM_REFERENCE_CARD_TITLE_CLASS,
  LEARN_LOOM_REFERENCE_GRID_CLASS,
  LEARN_LOOM_REFERENCE_LEAD_CLASS,
  LEARN_LOOM_REFERENCE_LINE_CLASS,
} from './learn-loom.styles'

/** The six cards a person can read without walking the lesson again (R4). */
export const LearnLoomReferenceView: FC = () => (
  <div data-learn-loom-reference className="flex flex-col gap-5">
    <p className={LEARN_LOOM_REFERENCE_LEAD_CLASS}>
      {LEARN_LOOM_REFERENCE_LINE}
    </p>
    <div className={LEARN_LOOM_REFERENCE_GRID_CLASS}>
      {LEARN_LOOM_REFERENCE_CARDS.map((card) => (
        <section
          key={card.title}
          data-learn-loom-card={card.title}
          aria-label={card.title}
          className={LEARN_LOOM_REFERENCE_CARD_CLASS}
        >
          <h3 className={LEARN_LOOM_REFERENCE_CARD_TITLE_CLASS}>
            {card.title}
          </h3>
          <div className={LEARN_LOOM_REFERENCE_LINE_CLASS}>
            {card.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </section>
      ))}
    </div>
  </div>
)
