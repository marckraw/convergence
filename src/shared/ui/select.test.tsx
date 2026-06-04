import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select'

describe('Select', () => {
  it('renders a combobox trigger with options', () => {
    render(
      <Select defaultValue="project">
        <SelectTrigger aria-label="Scope">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All scopes</SelectItem>
          <SelectItem value="project">Project</SelectItem>
        </SelectContent>
      </Select>,
    )

    expect(screen.getByRole('combobox', { name: 'Scope' })).toBeInTheDocument()
  })
})
