import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { describeTurnFileChange } from './turn-file-change-notice.pure'
import { TurnFileChangeNotices } from './turn-file-change-notice.presentational'

describe('TurnFileChangeNotices', () => {
  it('renders nothing when the change has nothing to disclose', () => {
    const { container } = render(
      <TurnFileChangeNotices
        notices={describeTurnFileChange({ truncated: false, binary: false })}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the truncation notice above the diff', () => {
    render(
      <TurnFileChangeNotices
        notices={describeTurnFileChange({ truncated: true, binary: false })}
      />,
    )
    expect(
      screen.getByText(
        'Diff truncated — this is a fragment, not the whole change.',
      ),
    ).toBeInTheDocument()
  })

  it('renders both notices as separate lines when both apply', () => {
    render(
      <TurnFileChangeNotices
        notices={describeTurnFileChange({ truncated: true, binary: true })}
      />,
    )
    expect(
      screen.getByText('Binary file — there is no textual diff to show.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Diff truncated — this is a fragment, not the whole change.',
      ),
    ).toBeInTheDocument()
  })
})
