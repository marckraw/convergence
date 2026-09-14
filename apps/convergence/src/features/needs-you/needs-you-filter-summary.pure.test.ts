import { expect, it } from 'vitest'
import { buildFeedFilterSummary } from './needs-you-filter-summary.pure'
import { defaultFeedView, type ActivityView } from './needs-you-view.pure'

it('describes unrestricted host and provider scope explicitly', () => {
  expect(buildFeedFilterSummary(defaultFeedView())).toEqual({
    activity: 'All activity',
    scope: 'All hosts · All providers',
  })
})

it.each<[ActivityView, string]>([
  ['needs-me', 'Needs me'],
  ['working', 'Working'],
  ['review', 'Review'],
])('names the %s workflow view', (activity, label) => {
  expect(buildFeedFilterSummary({ ...defaultFeedView(), activity })).toEqual({
    activity: label,
    scope: 'All hosts · All providers',
  })
})

it('names a selected host and uses the existing provider filter label', () => {
  expect(
    buildFeedFilterSummary({
      ...defaultFeedView(),
      activity: 'working',
      hosts: ['remote'],
      providers: ['openai'],
    }),
  ).toEqual({ activity: 'Working', scope: 'Remote · OpenAI' })
})

it('lists every selected scope in a stable order without changing the view', () => {
  const view = {
    ...defaultFeedView(),
    hosts: ['remote', 'local'] as ('local' | 'remote')[],
    providers: ['pi', 'openai', 'anthropic'],
  }
  expect(buildFeedFilterSummary(view).scope).toBe(
    'Local + Remote · Anthropic + OpenAI + Pi',
  )
  expect(view.hosts).toEqual(['remote', 'local'])
  expect(view.providers).toEqual(['pi', 'openai', 'anthropic'])
})

it('retains an unfamiliar provider name in full without matching cards', () => {
  const provider = 'future-provider-with-a-long-descriptive-name'
  expect(
    buildFeedFilterSummary({ ...defaultFeedView(), providers: [provider] })
      .scope,
  ).toBe(`All hosts · ${provider}`)
})
