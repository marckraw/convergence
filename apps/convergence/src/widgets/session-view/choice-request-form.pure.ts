import type {
  InteractionQuestion,
  InteractionResponse,
} from '@/entities/session'

/** The answers chosen so far, by question id. */
export type ChoiceAnswers = Record<string, string[]>

/**
 * Where a choice request starts (CONV-30): a one-answer question has its first
 * option chosen, a several-answers one has nothing ticked.
 */
export function buildInitialChoiceAnswers(
  questions: readonly InteractionQuestion[],
): ChoiceAnswers {
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

/**
 * The answers after one option is picked: a one-answer question takes it in
 * place of its choice; a several-answers one ticks it, or unticks it.
 */
export function chooseChoiceAnswer(input: {
  answers: ChoiceAnswers
  question: Pick<InteractionQuestion, 'id' | 'multiSelect'>
  value: string
}): ChoiceAnswers {
  const { answers, question, value } = input
  const current = answers[question.id] ?? []
  const next = !question.multiSelect
    ? [value]
    : current.includes(value)
      ? current.filter((chosen) => chosen !== value)
      : [...current, value]
  return { ...answers, [question.id]: next }
}

/** Every question has an answer, so Answer can send. */
export function canSubmitChoiceAnswers(
  questions: readonly InteractionQuestion[],
  answers: ChoiceAnswers,
): boolean {
  return questions.every((question) => (answers[question.id] ?? []).length > 0)
}

/**
 * What answering sends: the response the provider reads, and the words the
 * transcript shows for it, each question over its answers.
 */
export function choiceResponse(
  questions: readonly InteractionQuestion[],
  answers: ChoiceAnswers,
): { response: InteractionResponse; displayText: string } {
  return {
    response: {
      kind: 'choice',
      answers: questions.map((question) => ({
        questionId: question.id,
        values: answers[question.id] ?? [],
      })),
    },
    displayText: questions
      .map(
        (question) =>
          `${question.question}\n${(answers[question.id] ?? []).join(', ')}`,
      )
      .join('\n\n'),
  }
}
