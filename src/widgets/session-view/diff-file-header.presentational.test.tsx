import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DiffFileHeader } from './diff-file-header.presentational'

describe('DiffFileHeader', () => {
  it('renders a guide-style description subtitle', () => {
    render(
      <DiffFileHeader
        path="electron/backend/types.ts"
        status="added"
        subtitle="Defines the daemon contract."
        subtitleVariant="description"
      />,
    )

    expect(screen.getByText('electron/backend/types.ts')).toBeInTheDocument()
    expect(screen.getByText('added')).toBeInTheDocument()
    expect(screen.getByText('Defines the daemon contract.')).toHaveClass(
      'text-xs',
    )
  })

  it('renders a label-style diff mode subtitle', () => {
    render(
      <DiffFileHeader
        path="src/app.ts"
        subtitle="Working tree diff"
        subtitleVariant="label"
      />,
    )

    expect(screen.getByText('Working tree diff')).toHaveClass('uppercase')
  })
})
