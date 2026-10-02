// canary: preset/presentational-no-stateful-hooks
// A presentational that holds its own answers and counts its steps in a
// reducer, both called with a type argument: the form Chaperone's own preset
// pattern misses (CONV-30). Its state belongs in a container.
import { useReducer, useState } from 'react'

export function HeldAnswers({ questions }: { questions: string[] }) {
  const [answers] = useState<Record<string, string>>({})
  const [step] = useReducer<number, []>((current) => current + 1, 0)
  return (
    <>
      {questions[step]}
      {Object.keys(answers).length}
    </>
  )
}
