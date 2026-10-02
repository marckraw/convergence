import { useId, type FC } from 'react'
import type { InteractionQuestion } from '@/entities/session'
import {
  Button,
  Checkbox,
  ChoiceCard,
  ChoiceField,
  Fieldset,
  FieldsetLegend,
  RadioGroup,
} from '@convergence/ui'

interface ChoiceRequestFormViewProps {
  questions: InteractionQuestion[]
  /** What is chosen so far, by question id. */
  answers: Record<string, string[]>
  /** Every question has an answer. */
  canSubmit: boolean
  /** One option picked: chosen in place of a single answer, or ticked or unticked. */
  onChoose: (question: InteractionQuestion, value: string) => void
  onSubmit: () => void
}

/**
 * A choice request's questions and its Answer (CONV-9): props in, markup out.
 * The answers are held by ChoiceRequestForm, its container (CONV-30).
 */
export const ChoiceRequestFormView: FC<ChoiceRequestFormViewProps> = ({
  questions,
  answers,
  canSubmit,
  onChoose,
  onSubmit,
}) => {
  const formId = useId()

  return (
    <form
      className="mt-4 space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      {questions.map((question) => {
        const chosen = answers[question.id] ?? []
        const choose = (value: string) => onChoose(question, value)
        const questionId = `${formId}-${question.id}`
        const head = (
          <>
            <FieldsetLegend className="text-xs text-ink">
              {question.header}
            </FieldsetLegend>
            <p id={questionId} className="text-sm text-ink-muted">
              {question.question}
            </p>
          </>
        )
        // Several answers: checkboxes with their words. One answer: a radio
        // group of cards, the chosen one raised (R7, R9; CONV-9).
        return question.multiSelect ? (
          <Fieldset
            key={question.id}
            aria-describedby={questionId}
            className="gap-2"
          >
            {head}
            <div className="space-y-1">
              {question.options.map((option) => (
                <ChoiceField
                  key={option.label}
                  label={<span className="break-words">{option.label}</span>}
                  hint={option.description}
                >
                  <Checkbox
                    checked={chosen.includes(option.label)}
                    onCheckedChange={() => choose(option.label)}
                  />
                </ChoiceField>
              ))}
            </div>
          </Fieldset>
        ) : (
          <Fieldset
            key={question.id}
            aria-describedby={questionId}
            className="gap-2"
            render={
              <RadioGroup
                value={chosen[0] ?? null}
                onValueChange={(value) => choose(value as string)}
              />
            }
          >
            {head}
            <div className="space-y-2">
              {question.options.map((option) => (
                <ChoiceCard
                  key={option.label}
                  value={option.label}
                  title={<span className="break-words">{option.label}</span>}
                  description={option.description}
                />
              ))}
            </div>
          </Fieldset>
        )
      })}
      <Button type="submit" disabled={!canSubmit}>
        Answer
      </Button>
    </form>
  )
}
