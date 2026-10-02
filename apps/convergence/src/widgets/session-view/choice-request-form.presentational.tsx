import { useId, useMemo, useState, type FC } from 'react'
import type {
  InteractionQuestion,
  InteractionResponse,
} from '@/entities/session'
import {
  Button,
  Checkbox,
  ChoiceCard,
  ChoiceField,
  Fieldset,
  FieldsetLegend,
  RadioGroup,
} from '@convergence/ui'

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
  const formId = useId()

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
      {questions.map((question) => {
        const chosen = answers[question.id] ?? []
        const choose = (value: string) =>
          setAnswers((current) => ({
            ...current,
            [question.id]: toggleChoiceAnswer({
              current: current[question.id] ?? [],
              value,
              multiSelect: question.multiSelect,
            }),
          }))
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
