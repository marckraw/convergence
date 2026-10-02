import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { notify } from './notify'

vi.mock('sonner', () => ({
  toast: Object.assign(
    vi.fn(() => 'plain'),
    {
      success: vi.fn(() => 'ok'),
      info: vi.fn(() => 'info'),
      warning: vi.fn(() => 'warning'),
      error: vi.fn(() => 'error'),
      loading: vi.fn(() => 'loading'),
      dismiss: vi.fn((id?: string) => id ?? 'all'),
    },
  ),
}))

const sonner = vi.mocked(toast)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('notify (MAR-3608, DLG-31)', () => {
  it('words a failure "Couldn’t <verb> <thing>." with the reason under it', () => {
    notify.failure('update Codex', new Error('npm exited with code 1'), {
      id: 'provider-update',
    })
    expect(sonner.error).toHaveBeenCalledWith('Couldn’t update Codex.', {
      id: 'provider-update',
      description: 'npm exited with code 1',
    })
  })

  it('leaves the reason out when there is none to give', () => {
    notify.failure('open the project', undefined)
    expect(sonner.error).toHaveBeenCalledWith('Couldn’t open the project.', {})
  })

  it('draws a second action beside the first, and stays when persistent', () => {
    const download = vi.fn()
    const notes = vi.fn()
    notify.info('Update available', {
      action: { label: 'Download', onClick: download },
      secondaryAction: { label: 'Release notes', onClick: notes },
      persistent: true,
    })
    // Mutation: drop the secondaryAction mapping -> no cancel key, red.
    expect(sonner.info).toHaveBeenCalledWith('Update available', {
      action: { label: 'Download', onClick: download },
      cancel: { label: 'Release notes', onClick: notes },
      duration: Number.POSITIVE_INFINITY,
    })
  })

  it('raises each kind on its own sonner call, and returns its id', () => {
    expect(notify.success('Crew exported')).toBe('ok')
    expect(notify.warning('Agent waiting')).toBe('warning')
    expect(notify.message('The drill was cancelled')).toBe('plain')
    expect(notify.loading('Updating Codex…', { id: 'u' })).toBe('loading')
    expect(notify.error('The drill stopped while sealing')).toBe('error')
    expect(sonner).toHaveBeenCalledWith('The drill was cancelled', {})
    expect(sonner.loading).toHaveBeenCalledWith('Updating Codex…', { id: 'u' })
    expect(notify.dismiss('u')).toBe('u')
  })
})
