import { CodexAppServerClient } from '../provider/codex/codex-app-server-client'
import { mapCodexSkillCatalog } from './codex-skills.mapper.pure'
import { buildProviderSkillErrorCatalog } from './skill-catalog.pure'
import type { ProviderSkillCatalog, SkillCatalogOptions } from './skills.types'

export interface CodexSkillsClient {
  listSkills: (
    projectPath: string,
    options?: SkillCatalogOptions,
  ) => Promise<unknown>
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Failed to inspect Codex skills'
}

export class CodexSkillsService {
  private client: CodexSkillsClient

  constructor(binaryPath: string, client?: CodexSkillsClient) {
    this.client = client ?? new CodexAppServerClient(binaryPath)
  }

  async list(
    projectPath: string,
    options: SkillCatalogOptions = {},
  ): Promise<ProviderSkillCatalog> {
    try {
      const payload = await this.client.listSkills(projectPath, options)
      return mapCodexSkillCatalog(payload)
    } catch (error) {
      return buildProviderSkillErrorCatalog({
        providerId: 'codex',
        providerName: 'Codex',
        catalogSource: 'native-rpc',
        invocationSupport: 'structured-input',
        activationConfirmation: 'none',
        error: errorMessage(error),
      })
    }
  }
}
