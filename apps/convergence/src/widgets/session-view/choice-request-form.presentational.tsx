import { useMemo, useState, type FC } from 'react'
import type {
  InteractionQuestion,
  InteractionResponse,
} from '@/entities/session'
import { Button, Card, CardAction, cn } from '@convergence/ui'

interface ChoiceRequestFormProps {
  questions: InteractionQuestion[]
  onSubmit: (response: InteractionResponse, displayText: string) => void
}

export const ChoiceRequestForm: FC<ChoiceRequestFormProps> = ({
  questions,
  onSubmit,
}) => {
  const initialAnswers = useMemo(
    () => buildInitialChoiceAnswers(questions),
    [questions],
  )
  const [answers, setAnswers] =
    useState<Record<string, string[]>>(initialAnswers)

  const canSubmit = questions.every(
    (question) => (answers[question.id] ?? []).length > 0,
  )

  return (
    <form
      className="mt-4 space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!canSubmit) return

        const response: InteractionResponse = {
          kind: 'choice',
          answers: questions.map((question) => ({
            questionId: question.id,
            values: answers[question.id] ?? [],
          })),
        }
        onSubmit(response, formatChoiceAnswerDisplay(questions, answers))
      }}
    >
      {questions.map((question) => (
        <fieldset key={question.id} className="min-w-0 space-y-2">
          <legend className="text-xs font-medium text-ink">
            {question.header}
          </legend>
          <p className="text-sm text-ink-muted">{question.question}</p>
          <div className="space-y-2">
            {question.options.map((option) => {
              const selected = (answers[question.id] ?? []).includes(
                option.label,
              )
              return (
                // An answer is a card whose door presses it (DS-21).
                <Card
                  key={option.label}
                  interactive
                  padding="none"
                  className={cn(
                    'text-sm',
                    // R7: the chosen answer is ChoiceCard's chosen look, raised with a
                    // stronger edge, not a blue tint.
                    selected
                      ? 'border-control-line bg-raised text-ink shadow-raised hover:bg-raised'
                      : 'border-line-soft bg-canvas/60 text-ink-muted hover:text-ink',
                  )}
                >
                  <CardAction
                    aria-pressed={selected}
                    className="block w-full min-w-0 px-3 py-2 font-medium"
                    onClick={() => {
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: toggleChoiceAnswer({
                          current: current[question.id] ?? [],
                          value: option.label,
                          multiSelect: question.multiSelect,
                        }),
                      }))
                    }}
                  >
                    <span className="block min-w-0 break-words">
                      <span className="block">{option.label}</span>
                      {option.description ? (
                        <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                  </CardAction>
                </Card>
              )
            })}
          </div>
        </fieldset>
      ))}
      <Button type="submit" disabled={!canSubmit}>
        Answer
      </Button>
    </form>
  )
}

function buildInitialChoiceAnswers(
  questions: InteractionQuestion[],
): Record<string, string[]> {
  return Object.fromEntries(
    questions.map((question) => [
      question.id,
      question.multiSelect
        ? []
        : question.options[0]?.label
          ? [question.options[0].label]
          : [],
    ]),
  )
}

function toggleChoiceAnswer(input: {
  current: string[]
  value: string
  multiSelect: boolean
}): string[] {
  if (!input.multiSelect) {
    return [input.value]
  }

  if (input.current.includes(input.value)) {
    return input.current.filter((value) => value !== input.value)
  }

  return [...input.current, input.value]
}

function formatChoiceAnswerDisplay(
  questions: InteractionQuestion[],
  answers: Record<string, string[]>,
): string {
  return questions
    .map((question) => {
      const values = answers[question.id] ?? []
      return `${question.question}\n${values.join(', ')}`
    })
    .join('\n\n')
}
