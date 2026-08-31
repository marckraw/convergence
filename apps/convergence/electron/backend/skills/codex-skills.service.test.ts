import { describe, expect, it, vi } from 'vitest'
import { CodexSkillsService } from './codex-skills.service'

function payload() {
  return {
    skills: [
      {
        name: 'review',
        description: 'Review pull requests.',
        path: '/tmp/review/SKILL.md',
        scope: 'user',
        enabled: true,
      },
    ],
  }
}

describe('CodexSkillsService caching', () => {
  it('caches a successful scan and reuses it within the TTL', async () => {
    const listSkills = vi.fn().mockResolvedValue(payload())
    const service = new CodexSkillsService('/bin/codex', {
      client: { listSkills },
      now: () => 1000,
      cacheTtlMs: 5000,
    })

    const first = await service.list('/repo')
    const second = await service.list('/repo')

    expect(listSkills).toHaveBeenCalledTimes(1)
    expect(second).toEqual(first)
    expect(first.skills).toHaveLength(1)
  })

  it('keys the cache by path', async () => {
    const listSkills = vi.fn().mockResolvedValue(payload())
    const service = new CodexSkillsService('/bin/codex', {
      client: { listSkills },
      now: () => 1000,
      cacheTtlMs: 5000,
    })

    await service.list('/repo-a')
    await service.list('/repo-b')

    expect(listSkills).toHaveBeenCalledTimes(2)
  })

  it('refetches after the TTL expires', async () => {
    let now = 1000
    const listSkills = vi.fn().mockResolvedValue(payload())
    const service = new CodexSkillsService('/bin/codex', {
      client: { listSkills },
      now: () => now,
      cacheTtlMs: 5000,
    })

    await service.list('/repo')
    now = 1000 + 5001
    await service.list('/repo')

    expect(listSkills).toHaveBeenCalledTimes(2)
  })

  it('bypasses the cache on forceReload', async () => {
    const listSkills = vi.fn().mockResolvedValue(payload())
    const service = new CodexSkillsService('/bin/codex', {
      client: { listSkills },
      now: () => 1000,
      cacheTtlMs: 5000,
    })

    await service.list('/repo')
    await service.list('/repo', { forceReload: true })

    expect(listSkills).toHaveBeenCalledTimes(2)
  })

  it('does not cache a failed scan', async () => {
    const listSkills = vi
      .fn()
      .mockRejectedValueOnce(
        new Error('codex app-server timed out after 20000ms'),
      )
      .mockResolvedValueOnce(payload())
    const service = new CodexSkillsService('/bin/codex', {
      client: { listSkills },
      now: () => 1000,
      cacheTtlMs: 5000,
    })

    const errored = await service.list('/repo')
    expect(errored.error).toMatch(/timed out/)

    const recovered = await service.list('/repo')
    expect(listSkills).toHaveBeenCalledTimes(2)
    expect(recovered.error).toBeNull()
  })
})
