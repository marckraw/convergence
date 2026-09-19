import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  LEARN_LOOM_CONTROLS,
  LEARN_LOOM_ENTRY,
  LEARN_LOOM_REFERENCE_CARDS,
  LEARN_LOOM_REFERENCE_LINE,
  LEARN_LOOM_REFERENCE_TITLE,
  LEARN_LOOM_STEP_COPY,
  LEARN_LOOM_TICKET,
  LEARN_LOOM_TITLE,
} from './learn-loom-copy.pure'

describe('MAR-3201 R4: the guide’s words live in one module', () => {
  it('the six footer controls, as the frames draw them', () => {
    // Read back from the frozen frames by the mastermind (lap 2, B).
    expect(LEARN_LOOM_STEP_COPY.map((step) => step.primary)).toEqual([
      'Next: assign a horse →',
      'Next: start the work →',
      'Next: review the result →',
      'Next: your acceptance →',
      'Next: completed work →',
      'Back to Loom',
    ])
    expect(LEARN_LOOM_CONTROLS).toEqual({
      close: 'Close ×',
      reference: 'Quick reference',
      back: 'Back',
      restart: 'Walk through an example →',
      backToLoom: 'Back to Loom',
    })
    expect(LEARN_LOOM_ENTRY).toBe('How Loom works')
    expect(LEARN_LOOM_TITLE).toBe('How Loom works')
    expect(LEARN_LOOM_REFERENCE_TITLE).toBe('Loom, at a glance')
  })

  it('six steps numbered out of six, and the one ticket', () => {
    expect(LEARN_LOOM_STEP_COPY.map((step) => step.index)).toEqual([
      '1 / 6',
      '2 / 6',
      '3 / 6',
      '4 / 6',
      '5 / 6',
      '6 / 6',
    ])
    expect(LEARN_LOOM_STEP_COPY.map((step) => step.label)).toEqual([
      'PREPARE',
      'ASSIGN',
      'WORK',
      'REVIEW',
      'ACCEPT',
      'HISTORY',
    ])
    expect(LEARN_LOOM_TICKET).toEqual({
      identifier: 'DEMO-101',
      title: 'Improve account setup',
      note: 'Illustrative ticket',
    })
    expect(LEARN_LOOM_REFERENCE_CARDS).toHaveLength(6)
    expect(LEARN_LOOM_REFERENCE_LINE).toBe(
      'One shared plan. Agents do the work. You accept the result.',
    )
  })

  it('no component of the guide carries a guide string of its own', () => {
    // The rule is only kept if breaking it is visible: a sentence pasted
    // into a `.tsx` would pass every rendered test in this slice while
    // quietly making the copy impossible to diff against the handoff.
    // Mutation: inline any sentence below into a component -> red.
    // Named, not enumerated: a `.pure.test.ts` may not walk a directory
    // (the tree-walk budget, MAR-2989), and this feature's components are
    // few enough to list. A seventh file would have to be added here.
    const here = join(process.cwd(), 'src/features/waves')
    const components = [
      'learn-loom.presentational.tsx',
      'learn-loom.container.tsx',
      'learn-loom-illustration.presentational.tsx',
      'learn-loom-reference.presentational.tsx',
    ]

    const sentences = [
      ...LEARN_LOOM_STEP_COPY.flatMap((step) => [
        step.title,
        step.main,
        step.keyHeadline,
        step.keyExplanation,
        step.yourPart,
        step.primary,
      ]),
      ...LEARN_LOOM_REFERENCE_CARDS.flatMap((card) => [
        card.title,
        ...card.lines,
      ]),
      LEARN_LOOM_REFERENCE_LINE,
      LEARN_LOOM_TICKET.title,
      LEARN_LOOM_CONTROLS.close,
    ]

    for (const file of components) {
      const source = readFileSync(join(here, file), 'utf8')
      for (const sentence of sentences) {
        expect(`${file}: ${source.includes(sentence)}`).toBe(`${file}: false`)
      }
    }
  })
})
