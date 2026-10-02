import { useState, type FC } from 'react'
import type {
  InteractionQuestion,
  InteractionResponse,
} from '@/entities/session'
import {
  buildInitialChoiceAnswers,
  canSubmitChoiceAnswers,
  chooseChoiceAnswer,
  choiceResponse,
} from './choice-request-form.pure'
import { ChoiceRequestFormView } from './choice-request-form.presentational'

interface ChoiceRequestFormProps {
  questions: InteractionQuestion[]
  onSubmit: (response: InteractionResponse, displayText: string) => void
}

/**
 * A choice request's answers while they are being chosen (CONV-30): the
 * state lives here, the rules in choice-request-form.pure.ts, the drawing in
 * ChoiceRequestFormView.
 */
export const ChoiceRequestForm: FC<ChoiceRequestFormProps> = ({
  questions,
  onSubmit,
}) => {
  const [answers, setAnswers] = useState(() =>
    buildInitialChoiceAnswers(questions),
  )
  const canSubmit = canSubmitChoiceAnswers(questions, answers)

  return (
    <ChoiceRequestFormView
      questions={questions}
      answers={answers}
      canSubmit={canSubmit}
      onChoose={(question, value) =>
        setAnswers((current) =>
          chooseChoiceAnswer({ answers: current, question, value }),
        )
      }
      onSubmit={() => {
        if (!canSubmit) return
        const { response, displayText } = choiceResponse(questions, answers)
        onSubmit(response, displayText)
      }}
    />
  )
}
