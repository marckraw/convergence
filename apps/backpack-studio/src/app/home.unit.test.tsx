import { createStudioApiFixture } from '../shared/api/studio-api.fixture'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Home } from '../features/home'
import { FirstRequest } from '../features/first-request'
import {
  readConnection,
  readCapturedDaemonHandshake,
  simulateUnreachable,
  type ConnectionReading,
} from '../shared/api'

const fixtureConnection = {
  ...readCapturedDaemonHandshake(),
  endpointName: 'backpack.automations',
}
const composer = { value: '', onChange: () => {}, onSend: () => {} }
const nav = {
  conversations: [
    ['Summer campaign', 'idle'],
    ['Q4 priorities', 'failed'],
    ['Checkout recovery', 'running'],
  ].map(([title, status], index) => ({
    id: String(index),
    title,
    status: status as 'idle' | 'failed' | 'running',
    createdAt: 'today',
    updatedAt: 'today',
  })),
  onNew: () => {},
  onSelect: () => {},
}
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
      ...fixtureConnection,
      status,
    }
    const connected = status === 'connected'
    const view = render(
      <FirstRequest
        identity={identity}
        connection={connection}
        onSkip={() => {}}
        onStart={() => {}}
        composer={composer}
      />,
    )
    const line = screen.getByRole('status')
    expect(line.textContent).toBe(
      `${connected ? '● Connected to' : '○ Not connected to'} backpack.automations`,
    )
    expect(line.classList.contains('studio-connection-connected')).toBe(
      connected,
    )
    view.rerender(
      <Home
        {...nav}
        composer={composer}
        identity={identity}
        connection={connection}
      />,
    )
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
    render(
      <Home
        {...nav}
        composer={composer}
        identity={identity}
        connection={fixtureConnection}
      />,
    )
    for (const text of [
      'backpack',
      'studio',
      '+ New conversation',
      'Inbox',
      '2',
      'All conversations',
      'Search conversations',
      'Library',
      'RECENT',
      'Summer campaign',
      'Done',
      'Q4 priorities',
      'Refused',
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
    expect(
      screen.getByPlaceholderText(
        'Describe what you need, or start with something you’ve saved.',
      ),
    ).toBeTruthy()
    for (const control of screen
      .getAllByRole('button')
      .filter(
        (button) =>
          ![
            '+ New conversation',
            'Summer campaign',
            'Q4 priorities',
            'Checkout recovery',
          ].some((name) => button.textContent?.includes(name)),
      )) {
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
  it('keeps the simulation separate from the live connection door', async () => {
    window.backpackStudio = createStudioApiFixture()
    expect(await readConnection()).toMatchObject({
      status: 'connected',
      endpointName: 'backpack.automations',
    })
    expect(simulateUnreachable(fixtureConnection)).toMatchObject({
      status: 'unreachable',
      endpointName: 'backpack.automations',
    })
    delete window.backpackStudio
  })
})
