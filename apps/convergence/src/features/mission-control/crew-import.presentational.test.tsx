import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type {
  CrewImportPlan,
  CrewImportRow,
} from '@/shared/types/crew-import.types'
import { CrewImportView } from './crew-import.presentational'
const row = (key: string, state: CrewImportRow['state']): CrewImportRow => ({
  key,
  label: key,
  state,
  detail: state,
  differences: [],
  canUpdate: false,
  options: [],
})
const plan: CrewImportPlan = {
  path: '/recipes/crew.yaml',
  revision: 'v1',
  crew: { ...row('crew', 'existing'), id: 'c' },
  roles: [
    {
      ...row('horse', 'differs'),
      role: 'horse',
      sessionId: 's',
      projectId: 'p',
      canUpdate: true,
      differences: ['model'],
      detail: 'differs: model',
    },
  ],
  wires: [],
  limits: row('limits', 'existing'),
  kept: [row('local wire', 'kept')],
  hasLayout: true,
  canApply: true,
}
const decisions = {
  revision: 'v1',
  choices: {},
  updates: {},
  includeLayout: true,
}
it('shows reconciliation and defaults updates on (mutation: omit the update decision)', () => {
  const update = vi.fn()
  render(
    <CrewImportView
      plan={plan}
      decisions={decisions}
      busy={false}
      error={null}
      report={null}
      onClose={() => {}}
      onApply={() => {}}
      onChoice={() => {}}
      onUpdate={update}
      onIncludeLayout={() => {}}
      onChooseFolder={() => {}}
    />,
  )
  const checkbox = screen.getByRole('checkbox', {
    name: 'Update horse to file',
  })
  expect({
    checked: (checkbox as HTMLInputElement).checked,
    apply: (screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement)
      .disabled,
    kept: screen.getByText('local wire').textContent,
  }).toEqual({ checked: true, apply: false, kept: 'local wire' })
  fireEvent.click(checkbox)
  expect(update).toHaveBeenCalledWith('horse', false)
})

it.each([
  'choose',
  'missing-project',
  'missing-lane',
  'missing-endpoint',
  'remote-create-unsupported',
] as const)(
  'disables Apply for %s (mutation: remove the Apply gate)',
  (state) => {
    render(
      <CrewImportView
        plan={{
          ...plan,
          canApply: false,
          roles: [{ ...plan.roles[0]!, state, canUpdate: false }],
        }}
        decisions={decisions}
        busy={false}
        error={null}
        report={null}
        onClose={() => {}}
        onApply={() => {}}
        onChoice={() => {}}
        onUpdate={() => {}}
        onIncludeLayout={() => {}}
        onChooseFolder={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
  },
)

it('renders a baton rename and its selected kept-wire warning (mutation: omit warning rendering)', () => {
  const renamed = {
    ...plan,
    roles: [
      {
        ...plan.roles[0]!,
        detail: 'differs: baton name (fable → mastermind)',
        differences: ['batonName'],
      },
    ],
    kept: [
      {
        ...row('kept wire', 'kept'),
        warnings: [
          {
            updateKey: 'horse',
            message: 'wire horse → fable waits on a baton no member will carry',
          },
        ],
      },
    ],
  }
  const props = {
    plan: renamed,
    decisions,
    busy: false,
    error: null,
    report: null,
    onClose: vi.fn(),
    onApply: vi.fn(),
    onChoice: vi.fn(),
    onUpdate: vi.fn(),
    onIncludeLayout: vi.fn(),
    onChooseFolder: vi.fn(),
  }
  const { rerender } = render(<CrewImportView {...props} />)
  expect({
    rename: screen.getByText('differs: baton name (fable → mastermind)')
      .textContent,
    warning: screen.queryByText(
      'wire horse → fable waits on a baton no member will carry',
    )?.textContent,
  }).toEqual({
    rename: 'differs: baton name (fable → mastermind)',
    warning: 'wire horse → fable waits on a baton no member will carry',
  })
  rerender(
    <CrewImportView
      {...props}
      decisions={{ ...decisions, updates: { horse: false } }}
    />,
  )
  expect(
    screen.queryByText(
      'wire horse → fable waits on a baton no member will carry',
    ),
  ).not.toBeInTheDocument()
})
