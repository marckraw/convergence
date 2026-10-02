import { describe, expect, it } from 'vitest'
import type { InteractionQuestion } from '@/entities/session'
import {
  buildInitialChoiceAnswers,
  canSubmitChoiceAnswers,
  chooseChoiceAnswer,
  choiceResponse,
} from './choice-request-form.pure'

const storage: InteractionQuestion = {
  id: 'q-storage',
  header: 'Storage',
  question: 'Where should the draft queue live?',
  multiSelect: false,
  options: [{ label: 'SQLite' }, { label: 'Memory' }],
}

const checks: InteractionQuestion = {
  id: 'q-checks',
  header: 'Checks',
  question: 'Which gates should run?',
  multiSelect: true,
  options: [{ label: 'Typecheck' }, { label: 'Unit tests' }],
}

describe('choice request answers (CONV-30)', () => {
  it('starts a one-answer question on its first option, a several-answers one on none', () => {
    expect(buildInitialChoiceAnswers([storage, checks])).toEqual({
      'q-storage': ['SQLite'],
      'q-checks': [],
    })
    expect(buildInitialChoiceAnswers([{ ...storage, options: [] }])).toEqual({
      'q-storage': [],
    })
  })

  it('swaps a single answer, and ticks then unticks one of several', () => {
    const start = buildInitialChoiceAnswers([storage, checks])
    expect(
      chooseChoiceAnswer({
        answers: start,
        question: storage,
        value: 'Memory',
      }),
    ).toEqual({ 'q-storage': ['Memory'], 'q-checks': [] })
    const ticked = chooseChoiceAnswer({
      answers: chooseChoiceAnswer({
        answers: start,
        question: checks,
        value: 'Typecheck',
      }),
      question: checks,
      value: 'Unit tests',
    })
    expect(ticked['q-checks']).toEqual(['Typecheck', 'Unit tests'])
    expect(
      chooseChoiceAnswer({
        answers: ticked,
        question: checks,
        value: 'Typecheck',
      })['q-checks'],
    ).toEqual(['Unit tests'])
  })

  it('can send only once every question has an answer', () => {
    const start = buildInitialChoiceAnswers([storage, checks])
    expect(canSubmitChoiceAnswers([storage, checks], start)).toBe(false)
    expect(
      canSubmitChoiceAnswers(
        [storage, checks],
        chooseChoiceAnswer({
          answers: start,
          question: checks,
          value: 'Typecheck',
        }),
      ),
    ).toBe(true)
  })

  it('sends each question’s values, and shows each question over its answers', () => {
    expect(
      choiceResponse([storage, checks], {
        'q-storage': ['Memory'],
        'q-checks': ['Typecheck', 'Unit tests'],
      }),
    ).toEqual({
      response: {
        kind: 'choice',
        answers: [
          { questionId: 'q-storage', values: ['Memory'] },
          { questionId: 'q-checks', values: ['Typecheck', 'Unit tests'] },
        ],
      },
      displayText:
        'Where should the draft queue live?\nMemory\n\nWhich gates should run?\nTypecheck, Unit tests',
    })
  })
})
