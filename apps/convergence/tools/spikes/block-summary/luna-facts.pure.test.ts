import { describe, expect, it } from 'vitest'
import { blockFacts, formatBlockFacts } from './luna-facts.pure'

describe('luna block facts', () => {
  it('counts tools and keeps leaf paths', () => {
    const facts = blockFacts({
      items: [{ toolName: 'Read' }, { toolName: 'Read' }, { toolName: 'Grep' }],
      truth: {
        paths: [
          'src',
          'src/widgets',
          'src/widgets/session-view',
          'state.ts',
          'src/widgets/session-view/state.ts',
        ],
      },
    })
    expect(facts.itemCount).toBe(3)
    expect(facts.tools).toEqual([
      { name: 'Read', count: 2 },
      { name: 'Grep', count: 1 },
    ])
    expect(facts.paths).toEqual(['src/widgets/session-view/state.ts'])
    expect(formatBlockFacts(facts)).toBe(
      '3 records; Read ×2, Grep ×1; paths: src/widgets/session-view/state.ts',
    )
  })

  it('keeps a listing name that is not a basename of another path', () => {
    expect(
      blockFacts({
        items: [{ toolName: 'ls src/shared' }],
        truth: { paths: ['src/shared', 'lib', 'ui', 'styles'] },
      }).paths,
    ).toEqual(['src/shared', 'lib', 'ui', 'styles'])
  })
})
