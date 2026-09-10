import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { CrewImportPlan } from '@/shared/types/crew-import.types'
const mocks = vi.hoisted(() => ({
  plan: vi.fn(),
  apply: vi.fn(),
  load: vi.fn(async () => {}),
  project: vi.fn(),
  selectDirectory: vi.fn(),
  createAndSwitch: vi.fn(),
  loadProjects: vi.fn(async () => {}),
  refreshSessions: vi.fn(async () => {}),
  loadGlobalChatSessions: vi.fn(async () => {}),
}))
vi.mock('@/entities/session-crew', () => ({
  sessionCrewApi: { importPlan: mocks.plan, importApply: mocks.apply },
  useSessionCrewStore: { getState: () => ({ load: mocks.load }) },
}))
vi.mock('@/entities/session-relay', () => ({
  useSessionRelayStore: { getState: () => ({ load: mocks.load }) },
}))
vi.mock('@/entities/session', () => ({
  useSessionStore: {
    getState: () => ({
      loadGlobalSessions: mocks.load,
      refreshSessions: mocks.refreshSessions,
      loadGlobalChatSessions: mocks.loadGlobalChatSessions,
    }),
  },
}))
vi.mock('@/entities/project', () => ({
  projectApi: { create: mocks.project },
  dialogApi: { selectDirectory: mocks.selectDirectory },
  useProjectStore: {
    getState: () => ({
      createProject: mocks.createAndSwitch,
      loadProjects: mocks.loadProjects,
      error: null,
    }),
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
  mocks.selectDirectory.mockReset()
  mocks.createAndSwitch.mockReset()
  mocks.loadProjects.mockClear()
  mocks.refreshSessions.mockClear()
  mocks.loadGlobalChatSessions.mockClear()
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
    refreshes: mocks.refreshSessions.mock.calls,
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
    refreshes: [[['p']]],
  })
})

it('keeps missing-project blocked after folder cancellation (mutation: disconnect Choose folder)', async () => {
  mocks.plan.mockResolvedValue({
    ...plan,
    roles: [{ ...plan.roles[0], state: 'missing-project', options: [] }],
  })
  mocks.selectDirectory.mockResolvedValue(null)
  render(<CrewImport />)
  fireEvent.click(screen.getByRole('button', { name: 'Import crew…' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Choose folder…' }))
  await waitFor(() => expect(mocks.selectDirectory).toHaveBeenCalledTimes(1))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled(),
  )
  expect({
    plans: mocks.plan.mock.calls.length,
    applies: mocks.apply.mock.calls.length,
    creates: mocks.project.mock.calls.length,
    switches: mocks.createAndSwitch.mock.calls.length,
    disabled: screen
      .getByRole('button', { name: 'Apply' })
      .hasAttribute('disabled'),
  }).toEqual({ plans: 1, applies: 0, creates: 0, switches: 0, disabled: true })
})

it('registers a chosen folder directly without switching the active project (mutation: use createProject store action)', async () => {
  mocks.plan.mockResolvedValue({
    ...plan,
    roles: [{ ...plan.roles[0], state: 'missing-project', options: [] }],
  })
  mocks.selectDirectory.mockResolvedValue('/chosen/root')
  mocks.project.mockResolvedValue({ id: 'new-project' })
  render(<CrewImport />)
  fireEvent.click(screen.getByRole('button', { name: 'Import crew…' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Choose folder…' }))
  await waitFor(() => expect(mocks.plan).toHaveBeenCalledTimes(2))
  expect({
    creates: mocks.project.mock.calls,
    switches: mocks.createAndSwitch.mock.calls,
    reloads: mocks.loadProjects.mock.calls.length,
  }).toEqual({
    creates: [[{ repositoryPath: '/chosen/root' }]],
    switches: [],
    reloads: 1,
  })
})

it('refreshes affected project and global sidebars after apply (mutation: omit sidebar refresh)', async () => {
  mocks.plan.mockResolvedValue({
    ...plan,
    canApply: true,
    roles: [
      { ...plan.roles[0], state: 'create', projectId: 'p' },
      { ...plan.roles[0], key: 'second', state: 'create', projectId: 'p' },
      { ...plan.roles[0], key: 'third', state: 'create', projectId: 'q' },
      { ...plan.roles[0], key: 'global', state: 'create', projectId: null },
    ],
  })
  mocks.apply.mockResolvedValue({
    path: plan.path,
    crewId: 'c',
    nothingToChange: false,
    entries: [],
  })
  render(<CrewImport />)
  fireEvent.click(screen.getByRole('button', { name: 'Import crew…' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Apply' }))
  await screen.findByText('Crew import report')
  expect({
    projects: mocks.refreshSessions.mock.calls,
    global: mocks.loadGlobalChatSessions.mock.calls.length,
  }).toEqual({ projects: [[['p', 'q']]], global: 1 })
})
