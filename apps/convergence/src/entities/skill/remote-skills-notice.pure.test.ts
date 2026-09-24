import { describe, expect, it } from 'vitest'
import { remoteSkillsNotice } from './remote-skills-notice.pure'

const REMOTE = 'From this Mac — little-monster may not have these skills.'

describe('remoteSkillsNotice', () => {
  it('returns null on this Mac', () => {
    expect(
      remoteSkillsNotice({ hostId: 'local', hostLabel: 'Local' }),
    ).toBeNull()
    expect(remoteSkillsNotice({ hostId: null, hostLabel: 'Local' })).toBeNull()
    expect(
      remoteSkillsNotice({ hostId: undefined, hostLabel: null }),
    ).toBeNull()
    expect(remoteSkillsNotice({ hostId: '', hostLabel: '' })).toBeNull()
    expect(remoteSkillsNotice({ hostId: '   ', hostLabel: 'Local' })).toBeNull()
  })

  it('names the remote host', () => {
    expect(
      remoteSkillsNotice({
        hostId: 'daemon-lm',
        hostLabel: 'little-monster',
      }),
    ).toBe(REMOTE)
  })

  it('falls back to the host id when the label is missing', () => {
    const byId = 'From this Mac — daemon-lm may not have these skills.'
    expect(remoteSkillsNotice({ hostId: 'daemon-lm', hostLabel: '' })).toBe(
      byId,
    )
    expect(remoteSkillsNotice({ hostId: 'daemon-lm', hostLabel: '   ' })).toBe(
      byId,
    )
    expect(remoteSkillsNotice({ hostId: 'daemon-lm', hostLabel: null })).toBe(
      byId,
    )
  })
})
