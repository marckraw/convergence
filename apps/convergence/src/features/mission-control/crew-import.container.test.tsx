import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { CrewImportPlan } from '@/shared/types/crew-import.types'
const mocks = vi.hoisted(() => ({
  plan: vi.fn(),
  apply: vi.fn(),
  load: vi.fn(async () => {}),
  project: vi.fn(),
}))
vi.mock('@/entities/session-crew', () => ({
  sessionCrewApi: { importPlan: mocks.plan, importApply: mocks.apply },
  useSessionCrewStore: { getState: () => ({ load: mocks.load }) },
}))
vi.mock('@/entities/session-relay', () => ({
  useSessionRelayStore: { getState: () => ({ load: mocks.load }) },
}))
vi.mock('@/entities/session', () => ({
  useSessionStore: { getState: () => ({ loadGlobalSessions: mocks.load }) },
}))
vi.mock('@/entities/project', () => ({
  useProjectStore: {
    getState: () => ({ createProject: mocks.project, error: null }),
  },
}))
import { CrewImport } from './crew-import.container'
const base = { detail: '', differences: [], canUpdate: false, options: [] }
const plan: CrewImportPlan = {
  path: '/crew.yaml',
  revision: 'v1',
  crew: { ...base, key: 'crew', label: 'Crew', state: 'existing', id: 'c' },
  roles: [
    {
      ...base,
      key: 'role:horse',
      label: 'Horse',
      role: 'horse',
      state: 'choose',
      sessionId: null,
      projectId: 'p',
      options: [{ value: 's', label: 'Existing horse' }],
    },
  ],
  wires: [],
  limits: { ...base, key: 'limits', label: 'Limits', state: 'existing' },
  kept: [],
  hasLayout: false,
  canApply: false,
}
beforeEach(() => {
  mocks.plan.mockReset()
  mocks.apply.mockReset()
  mocks.load.mockClear()
  mocks.project.mockReset()
})
it('opens the picker, replans a choice, applies and shows the report (mutation: disconnect the import door)', async () => {
  mocks.plan.mockResolvedValueOnce(plan).mockResolvedValueOnce({
    ...plan,
    canApply: true,
    roles: [{ ...plan.roles[0], state: 'bound', sessionId: 's' }],
  })
  mocks.apply.mockResolvedValue({
    path: plan.path,
    crewId: 'c',
    nothingToChange: false,
    entries: [{ key: 'role:horse', label: 'Horse', outcome: 'bound' }],
  })
  render(<CrewImport />)
  fireEvent.click(screen.getByRole('button', { name: 'Import crew…' }))
  const select = await screen.findByRole('combobox', { name: 'Choose Horse' })
  fireEvent.change(select, { target: { value: 's' } })
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled(),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
  await screen.findByText('Crew import report')
  expect({
    plans: mocks.plan.mock.calls,
    apply: mocks.apply.mock.calls,
    loads: mocks.load.mock.calls.length,
  }).toEqual({
    plans: [
      [undefined, {}],
      ['/crew.yaml', { 'role:horse': 's' }],
    ],
    apply: [
      [
        '/crew.yaml',
        {
          revision: 'v1',
          choices: { 'role:horse': 's' },
          updates: {},
          includeLayout: false,
        },
      ],
    ],
    loads: 3,
  })
})

it('keeps missing-project blocked after folder cancellation (mutation: disconnect Choose folder)', async () => {
  mocks.plan.mockResolvedValue({
    ...plan,
    roles: [{ ...plan.roles[0], state: 'missing-project', options: [] }],
  })
  mocks.project.mockResolvedValue(null)
  render(<CrewImport />)
  fireEvent.click(screen.getByRole('button', { name: 'Import crew…' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Choose folder…' }))
  await waitFor(() => expect(mocks.project).toHaveBeenCalledTimes(1))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled(),
  )
  expect({
    plans: mocks.plan.mock.calls.length,
    applies: mocks.apply.mock.calls.length,
    disabled: screen
      .getByRole('button', { name: 'Apply' })
      .hasAttribute('disabled'),
  }).toEqual({ plans: 1, applies: 0, disabled: true })
})
