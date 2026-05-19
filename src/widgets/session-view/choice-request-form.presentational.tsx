import { useMemo, useState, type FC } from 'react'
import type {
  InteractionQuestion,
  InteractionResponse,
} from '@/entities/session'
import { Button } from '@/shared/ui/button'

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
          <legend className="text-xs font-medium text-foreground">
            {question.header}
          </legend>
          <p className="text-sm text-muted-foreground">{question.question}</p>
          <div className="space-y-2">
            {question.options.map((option) => {
              const selected = (answers[question.id] ?? []).includes(
                option.label,
              )
              return (
                <Button
                  key={option.label}
                  type="button"
                  variant="ghost"
                  aria-pressed={selected}
                  className={[
                    'h-auto w-full justify-start whitespace-normal rounded-md border px-3 py-2 text-left text-sm shadow-none',
                    selected
                      ? 'border-blue-500/60 bg-blue-500/10 text-foreground hover:bg-blue-500/10'
                      : 'border-border/70 bg-background/60 text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                  ].join(' ')}
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
                  <span className="min-w-0 break-words">
                    <span className="block font-medium">{option.label}</span>
                    {option.description ? (
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                </Button>
              )
            })}
          </div>
        </fieldset>
      ))}
      <Button size="sm" type="submit" disabled={!canSubmit}>
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
