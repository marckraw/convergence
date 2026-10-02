import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { UiProvider } from '@convergence/ui'
import type { ProjectScript } from '@/entities/project-script'
import { ProjectScriptEditor } from './project-script-editor.container'

const script = {
  id: 'script-1',
  name: 'Dev server',
  command: 'npm run dev',
  icon: 'play',
  cwd: null,
} as unknown as ProjectScript

it('DLG-31 a failed save says "Couldn’t save the action." with the reason under it, not after it — mutation: append the reason to the line turns red', async () => {
  const onSave = vi
    .fn()
    .mockRejectedValue(new Error('An action with this name exists.'))
  render(
    <UiProvider>
      <ProjectScriptEditor
        open
        script={script}
        onOpenChange={vi.fn()}
        onSave={onSave}
      />
    </UiProvider>,
  )

  fireEvent.click(await screen.findByRole('button', { name: 'Save' }))

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent(
    'Couldn’t save the action. An action with this name exists.',
  )
  // The reason is its own line, under the failure.
  expect(
    within(alert).getByText('An action with this name exists.'),
  ).toBeInTheDocument()
})
