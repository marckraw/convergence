import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ProjectScript } from '@/entities/project-script'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { ProjectActionsTrigger } from './project-actions-trigger.presentational'

const script: ProjectScript = {
  id: 'script-1',
  projectId: 'project-1',
  name: 'dev',
  command: 'npm run dev',
  icon: 'play',
  cwd: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('ProjectActionsTrigger', () => {
  it('forwards trigger props when used as a dropdown trigger child', async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <ProjectActionsTrigger selectedScript={script} running={false} />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Action menu opened</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )

    fireEvent.pointerDown(screen.getByRole('button', { name: /dev/i }), {
      button: 0,
      ctrlKey: false,
    })

    expect(await screen.findByText('Action menu opened')).toBeInTheDocument()
  })
})
