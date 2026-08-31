import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useProjectStore } from '@/entities/project'
import { useSessionStore, type SessionSummary } from '@/entities/session'
import { useSessionRelayStore } from '@/entities/session-relay'
import type { SessionRelay } from '@/entities/session-relay'
import { SessionWiresContainer } from './session-wires.container'

function session(id: string, name: string): SessionSummary {
  return {
    id,
    contextKind: 'project',
    projectId: 'project-1',
    workspaceId: null,
    providerId: 'claude-code',
    model: 'sonnet',
    effort: 'medium',
    name,
    status: 'completed',
    attention: 'none',
    activity: null,
    contextWindow: null,
    workingDirectory: '/tmp/project-1',
    archivedAt: null,
    parentSessionId: null,
    forkStrategy: null,
    primarySurface: 'conversation',
    continuationToken: null,
    lastSequence: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  } as SessionSummary
}

function hail(id: string, source: string, target: string, armed = true) {
  return {
    id,
    crewId: 'crew-1',
    sourceSessionId: source,
    trigger: 'settled',
    action: 'hail',
    targetSessionId: target,
    spawnSpec: null,
    instruction: null,
    opener: null,
    armed,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  } as SessionRelay
}

describe('SessionWiresContainer', () => {
  beforeEach(() => {
    useSessionStore.setState({
      globalSessions: [
        session('s1', 'Implementor'),
        session('s2', 'Reviewer'),
        session('s3', 'Scribe'),
      ],
    })
    useProjectStore.setState({ projects: [] })
    useSessionRelayStore.setState({ relays: [], isLoaded: true })
  })

  it('renders nothing at all when no wire leaves this session', () => {
    // No empty state and no placeholder: a session nothing leaves should look
    // exactly as it did before F11 existed.
    const { container } = render(<SessionWiresContainer sessionId="s1" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for a session wires only point at', () => {
    // An incoming wire fires when somebody else finishes. This surface answers
    // "what happens when I finish", so it must stay silent.
    useSessionRelayStore.setState({ relays: [hail('r1', 's2', 's1')] })
    const { container } = render(<SessionWiresContainer sessionId="s1" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('counts the wires that leave, and reads them out in the crew’s own words', () => {
    useSessionRelayStore.setState({
      relays: [hail('r1', 's1', 's2'), hail('r2', 's1', 's3')],
    })
    render(<SessionWiresContainer sessionId="s1" />)

    const chip = screen.getByRole('button', {
      name: '2 wires fire when this session finishes.',
    })
    expect(chip).toHaveTextContent('2 wires')

    fireEvent.click(chip)
    // The same sentence `buildRelaySentence` gives the crew screen, so the two
    // surfaces cannot drift into separate vocabularies for one wire.
    expect(
      screen.getByText(
        'When Implementor finishes, send its last message to Reviewer',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'When Implementor finishes, send its last message to Scribe',
      ),
    ).toBeInTheDocument()
  })

  it('still shows a session whose every wire is switched off, and says so', () => {
    // Hiding disarmed wires would make the switch invisible from the only
    // screen the user is looking at.
    useSessionRelayStore.setState({
      relays: [hail('r1', 's1', 's2', false)],
    })
    render(<SessionWiresContainer sessionId="s1" />)

    expect(
      screen.getByRole('button', {
        name: '1 wire leaves this session, and it is disarmed.',
      }),
    ).toBeInTheDocument()
  })

  it('names the wires that are armed when only some of them are', () => {
    useSessionRelayStore.setState({
      relays: [hail('r1', 's1', 's2'), hail('r2', 's1', 's3', false)],
    })
    render(<SessionWiresContainer sessionId="s1" />)

    expect(
      screen.getByRole('button', {
        name: '2 wires leave this session; 1 of them is armed.',
      }),
    ).toBeInTheDocument()
  })

  it('reads a disarmed wire grey while its armed neighbour stays plain', () => {
    // Run 17's ruling: a switch at rest must never imply something will happen,
    // whatever accent its crew wears. Asserted rather than left to the styles,
    // because a ruling with no test is a ruling waiting to be undone quietly.
    useSessionRelayStore.setState({
      relays: [hail('r1', 's1', 's2'), hail('r2', 's1', 's3', false)],
    })
    render(<SessionWiresContainer sessionId="s1" />)

    fireEvent.click(
      screen.getByRole('button', {
        name: '2 wires leave this session; 1 of them is armed.',
      }),
    )

    const armed = screen.getByText(
      'When Implementor finishes, send its last message to Reviewer',
    )
    const disarmed = screen.getByText(
      'When Implementor finishes, send its last message to Scribe',
    )

    expect(disarmed.className).toContain('text-muted-foreground/60')
    expect(disarmed.className).toContain('line-through')
    expect(armed.className).toContain('text-foreground')
    expect(armed.className).not.toContain('line-through')
  })
})
