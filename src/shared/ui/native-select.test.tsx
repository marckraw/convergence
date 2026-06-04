import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NativeSelect } from './native-select'

describe('NativeSelect', () => {
  it('renders a select with options and a decorative chevron', () => {
    render(
      <NativeSelect aria-label="Scope" defaultValue="all">
        <option value="all">All scopes</option>
        <option value="project">Project</option>
      </NativeSelect>,
    )

    expect(screen.getByRole('combobox', { name: 'Scope' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Project' })).toBeInTheDocument()
  })
})
