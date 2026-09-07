import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Home } from '../features/home'
import { FirstRequest } from '../features/first-request'
import { readConnection, type ConnectionReading } from '../shared/api'

const identity = { name: 'Marcin Krawczyk', initials: 'MK' }
afterEach(cleanup)

describe('Studio home and connection (MAR-2853)', () => {
  it.each([
    'connected',
    'unauthorized',
    'incompatible',
    'unreachable',
  ] as const)('shows %s honestly on both screens', (status) => {
    // Mutation: classify any failure as connected, in either screen.
    const connection: ConnectionReading = {
      ...readConnection(status === 'unreachable'),
      status,
    }
    const connected = status === 'connected'
    const view = render(
      <FirstRequest
        identity={identity}
        connection={connection}
        onSkip={() => {}}
      />,
    )
    const line = screen.getByRole('status')
    expect(line.textContent).toBe(
      `${connected ? '● Connected to' : '○ Not connected to'} backpack.automations`,
    )
    expect(line.classList.contains('studio-connection-connected')).toBe(
      connected,
    )
    view.rerender(<Home identity={identity} connection={connection} />)
    expect(screen.getByRole('status').textContent).toBe(
      connected ? '● Connected' : '○ Not connected',
    )
    expect(
      screen
        .getByRole('status')
        .classList.contains('studio-connection-connected'),
    ).toBe(connected)
  })
  it('renders every home section from the mock model and marks inert controls', () => {
    // Mutations: remove/alter a section, or drop disabled from either inert Backpack Button.
    render(<Home identity={identity} connection={readConnection()} />)
    for (const text of [
      'backpack',
      'studio',
      '+ New conversation',
      'Inbox',
      '3',
      'All conversations',
      'Search conversations',
      'Library',
      'RECENT',
      'Summer campaign',
      'Ready for your review',
      'Q4 priorities',
      'Waiting for your answer',
      'Checkout recovery',
      'Working',
      'REMOTE ASSISTANT',
      'backpack.automations ⌄',
      'Help from GCS',
      'MK',
      'Marcin Krawczyk',
      'Account ⌄',
      'New conversation',
      'READY TO HELP',
      'What would you like to get done?',
      'Your assistant brings GCS skills, knowledge and connected tools.',
      'Describe what you need, or start with something you’ve saved.',
      '+ Add a file · Choose a skill',
      'Send ↑',
      'Explore its skills →',
      'Browse knowledge →',
      'A few things we can do together',
      'Make something',
      'Discuss a campaign brief, explore ideas and refine them in a conversation.',
      'Move work forward',
      'Talk through tickets and priorities with help from GCS tools.',
      'Understand a problem',
      'Investigate an issue and review the evidence before taking action.',
    ])
      expect(screen.getByText(text)).toBeTruthy()
    for (const control of screen.getAllByRole('button')) {
      expect(
        control.hasAttribute('disabled') ||
          control.getAttribute('aria-disabled') === 'true',
      ).toBe(true)
    }
    for (const label of ['+ New conversation', 'Send ↑'])
      expect(
        screen
          .getByRole('button', { name: label })
          .classList.contains('ef-button-filled'),
      ).toBe(true)
  })
  it('uses both evaluations through the single connection door', () => {
    // Mutations: hardcode connected or change the captured endpoint constant.
    expect(readConnection()).toMatchObject({
      status: 'connected',
      endpointName: 'backpack.automations',
    })
    expect(readConnection(true)).toMatchObject({
      status: 'unreachable',
      endpointName: 'backpack.automations',
    })
  })
})
