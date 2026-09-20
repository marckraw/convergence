import { describe, expect, it } from 'vitest'
import {
  DRILL_AFTER_MESSAGE,
  DRILL_BEFORE_MESSAGE,
  readSealDeclaration,
} from './context-drill.pure'

describe('the seal declaration (MAR-3255 R1)', () => {
  it('reads a seal that sits above the baton line', () => {
    expect(
      readSealDeclaration(
        [
          'I wrote the protocol and pushed.',
          'SEALED: #30 abc1234',
          'BATON: marcin',
        ].join('\n'),
      ),
    ).toEqual({ kind: 'sealed', detail: '#30 abc1234' })
  })

  it('reads a refusal and keeps the reason the agent gave', () => {
    expect(
      readSealDeclaration(
        ['NOT SEALED: the push was rejected', 'BATON: marcin'].join('\n'),
      ),
    ).toEqual({ kind: 'not-sealed', reason: 'the push was rejected' })
  })

  it.each([
    ['null', null],
    ['an empty message', ''],
    ['only whitespace', '\n  \n\t\n'],
    [
      'prose that declares nothing',
      'Done. I updated the ledger.\nBATON: marcin',
    ],
  ])('answers absent for %s', (_label, message) => {
    expect(readSealDeclaration(message)).toEqual({ kind: 'absent' })
  })

  it('counts a bolded declaration', () => {
    // MAR-2815's lesson, in this fence: a mastermind that bolds its closing
    // lines by reflex has still declared. The leading marks come off; the
    // trailing ones stay in `detail`, which nothing branches on.
    expect(readSealDeclaration('**SEALED: #30 abc1234**')).toEqual({
      kind: 'sealed',
      detail: '#30 abc1234**',
    })
  })

  it('counts a quoted declaration', () => {
    expect(readSealDeclaration('> `NOT SEALED: no network`')).toEqual({
      kind: 'not-sealed',
      reason: 'no network`',
    })
  })

  it('ignores a seal quoted earlier in the body', () => {
    // The window, not the message. An agent recalling its previous seal is
    // describing history; the declaration is what it writes at the bottom.
    //
    // The quoted line is a DECLARATION in its own right -- it would be read
    // as a seal anywhere in the window -- because that is the only shape the
    // window can refute. A reminder whose line merely mentions the word is
    // already refused by the anchor above, so quoting one of those would pass
    // with no window at all and prove nothing.
    expect(
      readSealDeclaration(
        [
          'Last time I answered this:',
          '> SEALED: #29 deadbee',
          'This time the vessel would not commit.',
          'I could not write the protocol.',
          'Nothing was pushed.',
          'BATON: marcin',
        ].join('\n'),
      ),
    ).toEqual({ kind: 'absent' })
  })

  it('ignores a refusal quoted earlier in the body', () => {
    // The window's other half: with only the seal pass windowed, this reply
    // would report a refusal the agent made last week.
    expect(
      readSealDeclaration(
        [
          '> NOT SEALED: the push was rejected',
          'That was yesterday. Today it went through.',
          'SEALED: #30 abc1234',
          'BATON: marcin',
        ].join('\n'),
      ),
    ).toEqual({ kind: 'sealed', detail: '#30 abc1234' })
  })

  it('lets a refusal win over a seal beside it', () => {
    expect(
      readSealDeclaration(
        [
          'SEALED: #30 abc1234',
          'NOT SEALED: the push was rejected',
          'BATON: marcin',
        ].join('\n'),
      ),
    ).toEqual({ kind: 'not-sealed', reason: 'the push was rejected' })
  })

  it('lets a refusal win when it is written first', () => {
    expect(
      readSealDeclaration(
        [
          'NOT SEALED: the push was rejected',
          'SEALED: #30 abc1234',
          'BATON: marcin',
        ].join('\n'),
      ),
    ).toEqual({ kind: 'not-sealed', reason: 'the push was rejected' })
  })

  it('refuses a seal merely mentioned inside a sentence', () => {
    // Anchored at the start of the line: a reply that TALKS about sealing has
    // declared nothing. A reader that matched anywhere would accept this.
    expect(
      readSealDeclaration(
        'I will answer SEALED: once the push lands.\nBATON: marcin',
      ),
    ).toEqual({ kind: 'absent' })
  })

  it('refuses a refusal merely mentioned inside a sentence', () => {
    // The other half of the same anchor, and it needs its own input: with
    // the refusal pass anchored and the seal pass not, this line still reads
    // as absent, so only a line the SEAL pass could claim can expose that.
    expect(
      readSealDeclaration(
        'Nobody should ever write NOT SEALED: without a reason.\nBATON: marcin',
      ),
    ).toEqual({ kind: 'absent' })
  })

  it('keeps an empty reason when the agent gave none', () => {
    expect(readSealDeclaration('NOT SEALED:')).toEqual({
      kind: 'not-sealed',
      reason: '',
    })
  })
})

describe("the drill's two messages", () => {
  it('says the four words the protocol answers to', () => {
    // Pinned as literals: the agent's revival protocol keys off these words,
    // and a reworded beat 1 is a drill that silently does nothing.
    expect(DRILL_BEFORE_MESSAGE).toBe('You know the drill.')
  })

  it('tells a compacted agent where to start reading', () => {
    expect(DRILL_AFTER_MESSAGE).toContain('REVIVAL PROTOCOL')
    expect(DRILL_AFTER_MESSAGE).toContain('Prove continuity')
    expect(DRILL_AFTER_MESSAGE).toContain('resume at RESUME')
  })
})
