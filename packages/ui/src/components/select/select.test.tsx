import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select'

const scopes = [
  { value: 'all', label: 'All scopes' },
  { value: 'project-1', label: 'Project' },
]

describe('Select', () => {
  it('renders a named combobox that shows the chosen label, not its value', () => {
    render(
      <Select items={scopes} defaultValue="project-1">
        <SelectTrigger aria-label="Scope">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {scopes.map((scope) => (
            <SelectItem key={scope.value} value={scope.value}>
              {scope.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>,
    )

    const trigger = screen.getByRole('combobox', { name: 'Scope' })
    // MAR-3616 #4: without `items`, Base UI's trigger shows "project-1".
    expect(trigger).toHaveTextContent('Project')
    expect(trigger).not.toHaveTextContent('project-1')
    expect(trigger).toHaveAttribute('data-size', 'md')
  })
})
