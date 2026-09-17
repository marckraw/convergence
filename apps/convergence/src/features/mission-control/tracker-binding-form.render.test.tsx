import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { SessionCrew } from '@/entities/session-crew'
import type { TrackerProbeReading } from '@/shared/types/tracker.types'
import { TrackerBindingForm } from './tracker-binding-form.presentational'
import { TrackerBindingFormContainer } from './tracker-binding-form.container'

/**
 * The tracker binding form, rendered (MAR-3084 R9; the MAR-2280 law): the
 * sentence a person reads is asserted on the screen, not in the pure helper.
 */

const KEY = 'lin_api_fixture_never_shown_back'
const AT = '2026-09-17T08:04:00.000Z'

function renderForm(overrides: {
  credential?: 'present' | 'absent' | null
  lastProbe?: TrackerProbeReading | null
  keyDraft?: string
}) {
  const noop = vi.fn()
  return render(
    <TrackerBindingForm
      draft={{
        projectId: 'project-1',
        labelPrefix: 'horse:',
        wavePrefix: 'wave:',
      }}
      bound
      credential={overrides.credential ?? 'present'}
      keyDraft={overrides.keyDraft ?? ''}
      lastProbe={overrides.lastProbe ?? null}
      busy={false}
      error={null}
      onDraftChange={noop}
      onSaveBinding={noop}
      onUnbind={noop}
      onKeyDraftChange={noop}
      onSaveKey={noop}
      onForgetKey={noop}
      onTest={noop}
    />,
  )
}

afterEach(() => {
  cleanup()
  delete (window as unknown as { electronAPI?: unknown }).electronAPI
})

describe('MAR-3084 R9: the binding form shows facts, not the key', () => {
  it('present + a probe of 12 reads "12 issues in project", with the four fields and the time', () => {
    renderForm({
      credential: 'present',
      lastProbe: { probe: { ok: true, issues: 12 }, at: AT },
    })

    expect(screen.getByText('12 issues in project')).toBeTruthy()
    expect(screen.getByText('Stored in Keychain')).toBeTruthy()
    expect(screen.getByText('Linear')).toBeTruthy()
    expect(screen.getByLabelText('Tracker project id')).toHaveProperty(
      'value',
      'project-1',
    )
    expect(screen.getByLabelText('Tracker label prefix')).toHaveProperty(
      'value',
      'horse:',
    )
    expect(screen.getByLabelText('Tracker wave prefix')).toHaveProperty(
      'value',
      'wave:',
    )
    expect(screen.getByText(/^Tested at /)).toBeTruthy()
    // A stored key offers no key field at all.
    expect(screen.queryByLabelText('Linear API key')).toBeNull()
  })

  it('unauthorized reads the refusal by name and offers entering the key again', () => {
    renderForm({
      credential: 'present',
      lastProbe: {
        probe: {
          ok: false,
          refusal: {
            kind: 'unauthorized',
            message: 'Linear refused the API key.',
            retryAt: null,
          },
        },
        at: AT,
      },
    })

    expect(screen.getByText(/^Linear refused the API key — /)).toBeTruthy()
    expect(screen.getByLabelText('Enter the Linear API key again')).toBeTruthy()
  })

  it('a stored key is never shown back: the field empties once the Keychain has it', async () => {
    const crew = {
      id: 'crew-1',
      name: 'Loom',
      emoji: null,
      accentColor: null,
      position: 0,
      roundCap: null,
      stallMinutes: null,
      createdAt: AT,
      updatedAt: AT,
      sessionIds: [],
      members: [],
      trackerBinding: {
        kind: 'linear',
        projectId: 'project-1',
        labelPrefix: 'horse:',
        wavePrefix: 'wave:',
        statusMap: {},
      },
    } satisfies SessionCrew
    const setCredential = vi.fn(async () => 'present' as const)
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      tracker: {
        credentialStatus: vi.fn(async () => 'absent' as const),
        setCredential,
        deleteCredential: vi.fn(async () => 'absent' as const),
        probe: vi.fn(async () => ({ probe: { ok: true, issues: 3 }, at: AT })),
      },
      crew: { setTrackerBinding: vi.fn(async () => crew) },
    }

    render(<TrackerBindingFormContainer crew={crew} />)
    await screen.findByText('Not stored')

    fireEvent.change(screen.getByLabelText('Linear API key'), {
      target: { value: KEY },
    })
    expect(screen.queryByDisplayValue(KEY)).not.toBeNull()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Store key' }))
    })

    await waitFor(() =>
      expect(screen.getByText('Stored in Keychain')).toBeTruthy(),
    )
    expect(setCredential).toHaveBeenCalledWith('crew-1', KEY)
    // Mutation: keep the typed key after storing it -> red here.
    expect(screen.queryByDisplayValue(KEY)).toBeNull()
    expect(document.body.textContent).not.toContain(KEY)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    })
    await screen.findByText('3 issues in project')
  })
})
