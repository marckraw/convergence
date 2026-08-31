import { describe, expect, it } from 'vitest'
import {
  extractCursorCommandRecords,
  mapCursorCommandCatalog,
  summarizeCursorCommandCatalogUpdate,
} from './cursor-skills.mapper.pure'

describe('cursor skills mapper', () => {
  it('extracts commands from ACP available_commands_update payloads', () => {
    const payload = {
      method: 'session/update',
      params: {
        sessionId: 'cursor-session-1',
        update: {
          sessionUpdate: 'available_commands_update',
          availableCommands: [
            {
              name: 'review',
              description: 'Review current changes',
              input: { hint: 'scope to review' },
            },
            {
              name: '/commit',
              description: 'Prepare a commit',
            },
          ],
        },
      },
    }

    const records = extractCursorCommandRecords(payload)

    expect(records.map((record) => record.name)).toEqual(['review', '/commit'])
    expect(mapCursorCommandCatalog(payload)).toMatchObject({
      providerId: 'cursor',
      providerName: 'Cursor',
      catalogSource: 'native-rpc',
      invocationSupport: 'native-command',
      activationConfirmation: 'none',
      skills: [
        {
          providerId: 'cursor',
          providerName: 'Cursor',
          name: 'review',
          displayName: 'review',
          description: 'Review current changes',
          shortDescription: 'Review current changes',
          path: null,
          scope: 'system',
          rawScope: 'command',
          sourceLabel: 'Cursor command',
          enabled: true,
          warnings: [],
        },
        {
          name: 'commit',
          sourceLabel: 'Cursor command',
        },
      ],
      error: null,
    })
  })

  it('labels user and project command records distinctly from built-in commands', () => {
    const catalog = mapCursorCommandCatalog({
      availableCommands: [
        {
          name: 'personal-review',
          description: 'Personal review checklist',
          source: 'user',
          path: '/Users/me/.cursor/rules/personal-review.md',
        },
        {
          name: 'project-plan',
          description: 'Project planning rule',
          source: 'project',
          path: '/repo/.cursor/rules/project-plan.md',
        },
      ],
    })

    expect(catalog.skills).toEqual([
      expect.objectContaining({
        name: 'personal-review',
        scope: 'user',
        rawScope: 'user',
        sourceLabel: 'Cursor user skill',
      }),
      expect.objectContaining({
        name: 'project-plan',
        scope: 'project',
        rawScope: 'project',
        sourceLabel: 'Cursor project skill',
      }),
    ])
  })

  it('adds warnings for disabled, pathless, duplicate, or incomplete commands without treating pathless commands as invalid', () => {
    const catalog = mapCursorCommandCatalog({
      commands: [
        { name: 'review', description: 'Review changes' },
        { name: 'review', description: 'Review branch' },
        { name: 'disabled', description: 'Unavailable', disabled: true },
        { name: 'missing-description' },
      ],
    })

    expect(catalog.skills).toEqual([
      expect.objectContaining({
        name: 'review',
        path: null,
        enabled: true,
        warnings: [expect.objectContaining({ code: 'duplicate-name' })],
      }),
      expect.objectContaining({
        name: 'review',
        warnings: [expect.objectContaining({ code: 'duplicate-name' })],
      }),
      expect.objectContaining({
        name: 'disabled',
        enabled: false,
        warnings: [expect.objectContaining({ code: 'disabled' })],
      }),
      expect.objectContaining({
        name: 'missing-description',
        enabled: true,
        warnings: [expect.objectContaining({ code: 'missing-description' })],
      }),
    ])
  })

  it('summarizes large command updates for provider debug', () => {
    const summary = summarizeCursorCommandCatalogUpdate(
      {
        availableCommands: Array.from({ length: 25 }, (_, index) => ({
          name: `cmd-${index}`,
          description: `Command ${index}`,
          input: index === 0 ? { hint: 'argument' } : undefined,
        })),
      },
      3,
    )

    expect(summary).toEqual({
      sessionUpdate: 'available_commands_update',
      commandCount: 25,
      commands: [
        {
          name: 'cmd-0',
          description: 'Command 0',
          sourceLabel: 'Cursor command',
          hasInput: true,
        },
        {
          name: 'cmd-1',
          description: 'Command 1',
          sourceLabel: 'Cursor command',
          hasInput: false,
        },
        {
          name: 'cmd-2',
          description: 'Command 2',
          sourceLabel: 'Cursor command',
          hasInput: false,
        },
      ],
      truncatedCount: 22,
    })
  })
})
