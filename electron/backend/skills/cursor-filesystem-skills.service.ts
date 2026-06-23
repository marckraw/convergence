import { homedir } from 'os'
import { resolve } from 'path'
import {
  collectProjectAncestorSkillRoots,
  scanFilesystemSkillCatalog,
  uniqueSkillRoots,
} from './filesystem-skill-scanner.service'
import type { ProviderSkillCatalog, SkillCatalogOptions } from './skills.types'

export interface CursorFilesystemSkillsServiceOptions {
  homeDir?: string
}

/**
 * Discovers Cursor agent skills for the Skills dialog by scanning
 * `.cursor/skills/<name>/SKILL.md` from the working directory up to the
 * repository root. Cursor skills are project-scoped only — there is no
 * personal/global Cursor skills directory — and are invoked as `/name`.
 *
 * This is intentionally separate from the ACP-based `CursorSkillsService`, which
 * lists the running agent's live slash-commands for the session composer.
 */
export class CursorFilesystemSkillsService {
  private homeDir: string

  constructor(options: CursorFilesystemSkillsServiceOptions = {}) {
    this.homeDir = resolve(options.homeDir ?? homedir())
  }

  async list(
    projectPath: string,
    _options: SkillCatalogOptions = {},
  ): Promise<ProviderSkillCatalog> {
    const roots = uniqueSkillRoots(
      await collectProjectAncestorSkillRoots(
        resolve(projectPath),
        '.cursor/skills',
        'project',
        this.homeDir,
      ),
    )

    return scanFilesystemSkillCatalog({
      providerId: 'cursor',
      providerName: 'Cursor',
      invocationSupport: 'native-command',
      activationConfirmation: 'none',
      roots,
      pathInvocation: 'name-only',
    })
  }
}
